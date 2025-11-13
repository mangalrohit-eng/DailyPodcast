/**
 * Health Check API endpoint
 * 
 * GET /api/health
 * Returns system health and status
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../lib/tools/storage';
import { Config } from '../lib/config';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const storage = new StorageTool();
    
    // Check storage connectivity
    let storageOk = false;
    let lastRun = null;
    
    try {
      // Try to list episodes
      const objects = await storage.list('episodes/');
      storageOk = true;
      
      // Find most recent manifest
      const manifests = objects
        .filter(obj => obj.path.endsWith('_manifest.json'))
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
      
      if (manifests.length > 0) {
        const manifestPath = manifests[0].path;
        const manifestData = await storage.get(manifestPath);
        lastRun = JSON.parse(manifestData.toString('utf-8'));
      }
    } catch (error) {
      Logger.warn('Storage check failed', {
        error: (error as Error).message,
      });
    }
    
    // Check OpenAI key
    const openaiConfigured = !!Config.OPENAI_API_KEY && Config.OPENAI_API_KEY.length > 0;
    
    const health = {
      status: storageOk && openaiConfigured ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        storage: storageOk ? 'ok' : 'error',
        openai: openaiConfigured ? 'ok' : 'not configured',
      },
      last_run: lastRun ? {
        date: lastRun.date,
        duration_sec: lastRun.duration_sec,
        created_at: lastRun.created_at,
      } : null,
      config: {
        storage_backend: Config.STORAGE_BACKEND,
        timezone: Config.TIMEZONE,
        target_duration_sec: Config.TARGET_DURATION_SECONDS,
      },
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    
    return res.status(statusCode).json(health);
  } catch (error) {
    Logger.error('Health check failed', {
      error: (error as Error).message,
    });
    
    return res.status(503).json({
      status: 'error',
      error: (error as Error).message,
    });
  }
}

