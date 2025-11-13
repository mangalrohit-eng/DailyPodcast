/**
 * Configuration API
 * 
 * GET /api/config - Get current configuration
 * PUT /api/config - Update configuration
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { ConfigStorage } from '../lib/tools/config-storage';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // GET - anyone can read config (dashboard needs it)
  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  
  // PUT - requires authentication
  if (req.method === 'PUT') {
    return AuthMiddleware.protect(req, res, handlePut);
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  try {
    const configStorage = new ConfigStorage();
    const config = await configStorage.load();
    
    res.status(200).json(config);
  } catch (error) {
    Logger.error('Failed to get config', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: 'Failed to load configuration',
      message: (error as Error).message,
    });
  }
}

async function handlePut(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  try {
    const user = (req as any).user || 'anonymous';
    const configStorage = new ConfigStorage();
    
    // Merge with existing config
    const existingConfig = await configStorage.load();
    const updatedConfig = {
      ...existingConfig,
      ...req.body,
    };
    
    // Save
    const savedConfig = await configStorage.save(updatedConfig, user);
    
    Logger.info('Config updated', { user, version: savedConfig.version });
    
    res.status(200).json(savedConfig);
  } catch (error) {
    Logger.error('Failed to update config', {
      error: (error as Error).message,
    });
    
    res.status(400).json({
      error: 'Failed to save configuration',
      message: (error as Error).message,
    });
  }
}

