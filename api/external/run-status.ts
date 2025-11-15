/**
 * External API - Get run status
 * 
 * GET /api/external/run-status?runId=2024-01-15
 * GET /api/external/run-status (gets latest run)
 * 
 * Headers:
 *   X-API-Key: <your-api-key>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RunsStorage } from '../../lib/tools/runs-storage';
import { progressTracker } from '../../lib/tools/progress-tracker';
import { Logger } from '../../lib/utils';
import { authenticateApiKey } from '../../lib/middleware/api-auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Authenticate API key
  const authError = authenticateApiKey(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }
  
  try {
    const runsStorage = new RunsStorage();
    const runId = req.query.runId as string | undefined;
    
    // If no runId provided, get latest
    let targetRunId = runId;
    if (!targetRunId) {
      const allRuns = await runsStorage.listRuns();
      if (allRuns.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No runs found',
        });
      }
      targetRunId = allRuns[0].run_id;
    }
    
    Logger.info('🤖 External API: Get run status', { runId: targetRunId });
    
    // Get run details
    const runDetails = await runsStorage.getRunDetails(targetRunId);
    
    if (!runDetails) {
      return res.status(404).json({
        success: false,
        error: `Run ${targetRunId} not found`,
      });
    }
    
    // Get progress updates
    const progress = progressTracker.getUpdates(targetRunId);
    
    // Determine overall status
    const lastUpdate = progress[progress.length - 1];
    let overallStatus = 'unknown';
    if (lastUpdate) {
      if (lastUpdate.status === 'completed' && lastUpdate.phase === 'Memory') {
        overallStatus = 'completed';
      } else if (lastUpdate.status === 'failed') {
        overallStatus = 'failed';
      } else if (lastUpdate.status === 'running') {
        overallStatus = 'running';
      }
    }
    
    return res.status(200).json({
      success: true,
      run_id: targetRunId,
      status: overallStatus,
      current_phase: lastUpdate?.phase,
      progress_updates: progress,
      manifest: runDetails,
      agent_times: runDetails.pipeline_report ? {
        ingestion: runDetails.metrics?.ingestion_time_ms,
        ranking: runDetails.metrics?.ranking_time_ms,
        scripting: runDetails.metrics?.scripting_time_ms,
        tts: runDetails.metrics?.tts_time_ms,
        total: runDetails.metrics?.total_time_ms,
      } : undefined,
    });
  } catch (error) {
    Logger.error('❌ External API: Get status failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

