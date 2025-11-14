/**
 * Debug endpoint - Shows the latest run error details
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const runsStorage = new RunsStorage();
    const result = await runsStorage.list(1, 5); // Get last 5 runs
    
    const failedRuns = result.runs.filter(r => r.status === 'failed');
    const latestFailed = failedRuns[0];
    
    if (!latestFailed) {
      return res.status(200).json({
        message: 'No failed runs found',
        allRuns: result.runs.map(r => ({
          run_id: r.run_id,
          status: r.status,
          date: r.date,
          error: r.error
        }))
      });
    }
    
    // Get full manifest for more details
    const manifest = await runsStorage.getManifest(latestFailed.run_id);
    
    return res.status(200).json({
      latestFailedRun: {
        run_id: latestFailed.run_id,
        date: latestFailed.date,
        started_at: latestFailed.started_at,
        completed_at: latestFailed.completed_at,
        error: latestFailed.error,
        duration_ms: latestFailed.duration_ms,
      },
      manifest: manifest ? {
        has_pipeline_report: !!manifest.pipeline_report,
        pipeline_report_keys: manifest.pipeline_report ? Object.keys(manifest.pipeline_report) : [],
      } : null,
      allRecentRuns: result.runs.map(r => ({
        run_id: r.run_id,
        status: r.status,
        error: r.error || 'None',
      })),
    });
  } catch (error) {
    Logger.error('Debug endpoint failed', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    return res.status(500).json({
      error: 'Failed to get debug info',
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

