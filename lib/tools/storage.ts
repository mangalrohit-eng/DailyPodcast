/**
 * Storage Tool - Unified interface for S3 storage
 */

import { S3Storage } from './storage-s3';
import { Config } from '../config';
import { Logger } from '../utils';

export interface StorageObject {
  path: string;
  url: string;
  size: number;
  uploadedAt: Date;
}

export class StorageTool {
  private s3: S3Storage;
  
  constructor() {
    // Use S3 storage (Vercel Blob removed due to lack of subscription)
    this.s3 = new S3Storage();
  }
  
  async put(
    path: string,
    data: Buffer | string,
    contentType: string
  ): Promise<string> {
    Logger.debug('Storage put', { path, size: typeof data === 'string' ? data.length : data.length, contentType });
    return await this.s3.put(path, data, contentType);
  }
  
  async get(path: string): Promise<Buffer> {
    Logger.debug('Storage get', { path });
    return await this.s3.get(path);
  }
  
  async exists(path: string): Promise<boolean> {
    return await this.s3.exists(path);
  }
  
  async list(prefix: string): Promise<StorageObject[]> {
    return await this.s3.list(prefix);
  }
  
  async delete(path: string): Promise<void> {
    Logger.debug('Storage delete', { path });
    return await this.s3.delete(path);
  }
}
