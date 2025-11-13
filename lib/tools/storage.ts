/**
 * Storage Tool - Abstraction over Vercel Blob and S3-compatible storage
 */

import { put, list, del } from '@vercel/blob';
import { Config } from '../config';
import { Logger } from '../utils';

export interface StorageObject {
  path: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

export class StorageTool {
  private backend: 'vercel-blob' | 's3';
  // Cache of recently created blob URLs to avoid list() lookup delays
  private urlCache: Map<string, { url: string; createdAt: number }> = new Map();
  
  constructor() {
    this.backend = Config.STORAGE_BACKEND as 'vercel-blob' | 's3';
  }
  
  async put(
    path: string,
    data: Buffer | string,
    contentType: string
  ): Promise<string> {
    Logger.debug('Storage put', { path, size: data.length, contentType });
    
    if (this.backend === 'vercel-blob') {
      return this.putVercelBlob(path, data, contentType);
    } else {
      return this.putS3(path, data, contentType);
    }
  }
  
  async get(path: string): Promise<Buffer> {
    Logger.debug('Storage get', { path });
    
    if (this.backend === 'vercel-blob') {
      return this.getVercelBlob(path);
    } else {
      return this.getS3(path);
    }
  }
  
  async exists(path: string): Promise<boolean> {
    try {
      if (this.backend === 'vercel-blob') {
        // List with the exact path - Vercel Blob matches on pathname
        // Add retry for recently created blobs
        let attempts = 0;
        const maxAttempts = 2;
        
        while (attempts < maxAttempts) {
          const { blobs } = await list({ prefix: path, limit: 1 });
          if (blobs.length > 0 && blobs[0].pathname === path) {
            return true;
          }
          
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        return false;
      } else {
        // For S3, try HEAD request
        const url = this.getS3Url(path);
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
      }
    } catch {
      return false;
    }
  }
  
  async list(prefix: string): Promise<StorageObject[]> {
    if (this.backend === 'vercel-blob') {
      const { blobs } = await list({ prefix });
      return blobs.map(blob => ({
        path: blob.pathname,
        url: blob.url,
        size: blob.size,
        uploadedAt: new Date(blob.uploadedAt),
      }));
    } else {
      // S3 list would require AWS SDK or manual implementation
      Logger.warn('S3 list not fully implemented');
      return [];
    }
  }
  
  async delete(path: string): Promise<void> {
    Logger.debug('Storage delete', { path });
    
    if (this.backend === 'vercel-blob') {
      // Find the blob by pathname to get its URL
      const { blobs } = await list({ prefix: path, limit: 1 });
      
      if (blobs.length > 0 && blobs[0].pathname === path) {
        await del(blobs[0].url);
      } else {
        Logger.warn('Blob not found for deletion', { path });
      }
    } else {
      // S3 delete would require AWS SDK
      Logger.warn('S3 delete not fully implemented');
    }
  }
  
  // Vercel Blob implementation
  private async putVercelBlob(
    path: string,
    data: Buffer | string,
    contentType: string
  ): Promise<string> {
    const blob = await put(path, data, {
      access: 'public',
      contentType,
    });
    
    Logger.debug('Blob created', {
      pathname: blob.pathname,
      url: blob.url,
      size: blob.size,
    });
    
    // Cache the URL for immediate retrieval (list() has eventual consistency)
    this.urlCache.set(path, {
      url: blob.url,
      createdAt: Date.now(),
    });
    
    // Clean up cache entries older than 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, value] of this.urlCache.entries()) {
      if (value.createdAt < fiveMinutesAgo) {
        this.urlCache.delete(key);
      }
    }
    
    return blob.url;
  }
  
  private async getVercelBlob(path: string): Promise<Buffer> {
    Logger.debug('Looking up blob', { path, cacheHit: this.urlCache.has(path) });
    
    // Check cache first (for recently created blobs)
    const cached = this.urlCache.get(path);
    if (cached) {
      Logger.debug('Using cached URL', { path, url: cached.url });
      
      const response = await fetch(cached.url);
      if (!response.ok) {
        // Cache might be stale, remove and fall through to list()
        Logger.warn('Cached URL failed, falling back to list()', { path });
        this.urlCache.delete(path);
      } else {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    }
    
    // Fall back to list() for older blobs
    let blobs: any[] = [];
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      const result = await list({ prefix: path, limit: 10 });
      blobs = result.blobs;
      
      Logger.debug('Blob list result', {
        path,
        attempt: attempts + 1,
        found: blobs.length,
        pathnames: blobs.map(b => b.pathname),
      });
      
      // Find exact match
      const exactMatch = blobs.find(b => b.pathname === path);
      if (exactMatch) {
        Logger.debug('Exact match found via list()', { pathname: exactMatch.pathname });
        
        // Fetch using the blob's URL
        const response = await fetch(exactMatch.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch blob: ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      
      attempts++;
      if (attempts < maxAttempts) {
        // Wait with exponential backoff: 100ms, 200ms
        await new Promise(resolve => setTimeout(resolve, 100 * attempts));
        Logger.debug('Retrying blob lookup', { path, attempt: attempts });
      }
    }
    
    throw new Error(`Blob not found: ${path} (tried ${maxAttempts} times, found ${blobs.length} blobs with prefix)`);
  }
  
  // S3 implementation (basic)
  private getS3Url(path: string): string {
    const endpoint = Config.S3_ENDPOINT.replace(/\/$/, '');
    const bucket = Config.S3_BUCKET;
    return `${endpoint}/${bucket}/${path}`;
  }
  
  private async putS3(
    path: string,
    data: Buffer | string,
    contentType: string
  ): Promise<string> {
    const url = this.getS3Url(path);
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        // Note: For production S3, you'd need proper AWS Signature V4
        // This is a simplified version
      },
      body: data,
    });
    
    if (!response.ok) {
      throw new Error(`S3 PUT failed: ${response.statusText}`);
    }
    
    return url;
  }
  
  private async getS3(path: string): Promise<Buffer> {
    const url = this.getS3Url(path);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`S3 GET failed: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

