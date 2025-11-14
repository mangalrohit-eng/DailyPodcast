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
    Logger.info('📖 GET /api/config - Loading config from S3...');
    
    const configStorage = new ConfigStorage();
    const config = await configStorage.load();
    
    Logger.info('✅ Config loaded successfully', {
      topics_count: config.topics?.length || 0,
      topics: config.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
      has_podcast_production: !!config.podcast_production,
    });
    
    res.status(200).json(config);
  } catch (error) {
    Logger.error('❌ Failed to get config', {
      error: (error as Error).message,
      stack: (error as Error).stack,
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
    Logger.info('💾 PUT /api/config - Saving new config...');
    Logger.info('📦 Request body received:', {
      topics_count: req.body?.topics?.length || 0,
      topics: req.body?.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
      has_podcast_production: !!req.body?.podcast_production,
    });
    
    const user = (req as any).user || 'anonymous';
    const configStorage = new ConfigStorage();
    
    // Merge with existing config
    const existingConfig = await configStorage.load();
    Logger.info('📖 Existing config loaded:', {
      topics_count: existingConfig.topics?.length || 0,
      topics: existingConfig.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
    });
    
    const updatedConfig = {
      ...existingConfig,
      ...req.body,
    };
    
    Logger.info('🔄 Merged config:', {
      topics_count: updatedConfig.topics?.length || 0,
      topics: updatedConfig.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
    });
    
    // Save
    const savedConfig = await configStorage.save(updatedConfig, user);
    
    Logger.info('✅ Config saved to S3', { 
      user, 
      version: savedConfig.version,
      topics_saved: savedConfig.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
    });
    
    res.status(200).json(savedConfig);
  } catch (error) {
    Logger.error('❌ Failed to update config', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    res.status(400).json({
      error: 'Failed to save configuration',
      message: (error as Error).message,
    });
  }
}

