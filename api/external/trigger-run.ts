/**
 * External API - Trigger a podcast run
 * 
 * POST /api/external/trigger-run
 * 
 * Headers:
 *   X-API-Key: <your-api-key>
 * 
 * Body (optional):
 *   { 
 *     "date": "2024-01-15",
 *     "force_overwrite": true,
 *     "window_hours": 24
 *   }
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Orchestrator } from '../../lib/orchestrator';
import { Logger } from '../../lib/utils';
import { authenticateApiKey } from '../../lib/middleware/api-auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Authenticate API key
  const authError = authenticateApiKey(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }
  
  Logger.info('🤖 External API: Trigger run', {
    body: req.body,
    timestamp: new Date().toISOString(),
  });
  
  try {
    const input = {
      date: req.body?.date,
      force_overwrite: req.body?.force_overwrite || false,
      window_hours: req.body?.window_hours,
    };
    
    const orchestrator = new Orchestrator();
    const result = await orchestrator.run(input);
    
    Logger.info('✅ External API: Run completed', {
      runId: result.run_id,
      success: result.success,
    });
    
    return res.status(200).json({
      success: true,
      run_id: result.run_id,
      result: {
        success: result.success,
        run_id: result.run_id,
        manifest_url: result.manifest_url,
        episode_url: result.episode_url,
        feed_url: result.feed_url,
      },
      message: 'Podcast run triggered successfully',
    });
  } catch (error) {
    Logger.error('❌ External API: Run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to trigger podcast run',
    });
  }
}

