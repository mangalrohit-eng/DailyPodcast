/**
 * Main API endpoint - Triggers the podcast generation pipeline
 * 
 * POST /api/run
 * Called by Vercel Cron daily at 12:00 UTC
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Orchestrator } from '../lib/orchestrator';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST from cron or manual trigger
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Verify cron secret (optional but recommended)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-vercel-cron-secret'] !== cronSecret) {
    // Allow manual triggers without secret in dev
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
  
  Logger.info('🌐 API /run triggered', {
    method: req.method,
    query: req.query,
    body: req.body,
    headers: {
      'x-vercel-cron': req.headers['x-vercel-cron'],
    },
    timestamp: new Date().toISOString(),
  });
  
  try {
    // Parse input from request body or query
    const input = {
      date: (req.query.date as string) || (req.body?.date),
      force_overwrite: req.query.force === 'true' || req.body?.force_overwrite,
      window_hours: req.query.window ? parseInt(req.query.window as string, 10) : undefined,
    };
    
    Logger.info('🎯 Parsed input', {
      input,
      raw_force: req.body?.force_overwrite,
      query_force: req.query.force,
    });
    
    // Run orchestrator
    Logger.info('⚙️ Creating orchestrator instance...');
    const orchestrator = new Orchestrator();
    
    Logger.info('▶️ Starting orchestrator.run()...');
    const result = await orchestrator.run(input);
    
    Logger.info('✅ Orchestrator completed', {
      success: result.success,
      hasManifest: !!result.manifest,
      manifestUrl: result.manifest?.mp3_url,
    });
    
    if (result.success) {
      return res.status(200).json({
        success: true,
        episode: {
          date: result.manifest!.date,
          url: result.manifest!.mp3_url,
          duration_sec: result.manifest!.duration_sec,
          word_count: result.manifest!.word_count,
        },
        metrics: result.metrics,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        metrics: result.metrics,
      });
    }
  } catch (error) {
    const errorMessage = (error as Error).message || 'Unknown error';
    const errorStack = (error as Error).stack || '';
    
    Logger.error('API /run failed', {
      error: errorMessage,
      stack: errorStack,
      name: (error as Error).name,
    });
    
    // Return detailed error for debugging
    return res.status(500).json({
      success: false,
      error: errorMessage,
      details: {
        name: (error as Error).name,
        message: errorMessage,
        // Only include stack in non-production for security
        stack: process.env.NODE_ENV === 'production' ? undefined : errorStack,
      },
    });
  }
}

