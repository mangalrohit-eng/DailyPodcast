/**
 * Simple Health Check API endpoint - no lib imports for testing
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const openaiConfigured = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length > 0;
    const blobConfigured = !!process.env.BLOB_READ_WRITE_TOKEN;
    
    const health = {
      status: openaiConfigured ? 'ok' : 'missing_config',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: {
        openai: openaiConfigured ? 'configured' : 'NOT_CONFIGURED',
        blob_storage: blobConfigured ? 'configured' : 'NOT_CONFIGURED',
      },
      config: {
        storage_backend: process.env.STORAGE_BACKEND || 'vercel-blob',
        timezone: process.env.TIMEZONE || 'America/New_York',
        base_url: process.env.PODCAST_BASE_URL || 'NOT_SET',
      },
    };
    
    return res.status(200).json(health);
  } catch (error) {
    return res.status(503).json({
      status: 'error',
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

