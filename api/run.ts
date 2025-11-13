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
  
  Logger.info('API /run triggered', {
    method: req.method,
    query: req.query,
    headers: {
      'x-vercel-cron': req.headers['x-vercel-cron'],
    },
  });
  
  try {
    // Parse input from request body or query
    const input = {
      date: (req.query.date as string) || (req.body?.date),
      force_overwrite: req.query.force === 'true' || req.body?.force_overwrite,
      window_hours: req.query.window ? parseInt(req.query.window as string, 10) : undefined,
    };
    
    // Run orchestrator
    const orchestrator = new Orchestrator();
    const result = await orchestrator.run(input);
    
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
    Logger.error('API /run failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    return res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
}

