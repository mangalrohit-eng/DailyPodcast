/**
 * Cancel API - Cancel a running podcast generation
 * 
 * POST /api/run/cancel
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { progressTracker } from '../../lib/tools/progress-tracker';
import { RunsStorage } from '../../lib/tools/runs-storage';
import { Logger } from '../../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { runId } = req.body;
    
    if (!runId) {
      return res.status(400).json({ error: 'Missing runId' });
    }
    
    Logger.info('🛑 Cancel requested', { runId });
    
    // Request cancellation in progress tracker (for current instance only)
    progressTracker.requestCancel(runId);
    
    // CRITICAL: Set cancellation flag in S3 so orchestrator can see it across instances
    const runsStorage = new RunsStorage();
    const cancelled = await runsStorage.requestCancelRun(runId);
    
    if (!cancelled) {
      return res.status(404).json({ 
        error: 'Run not found or not running',
        runId,
      });
    }
    
    // Immediately update status to 'cancelled' so UI shows it right away
    // (Orchestrator will also update it when it detects the cancellation, but this is faster)
    await runsStorage.cancelRun(runId, 'Cancelled by user');
    
    Logger.info('✅ Cancellation flag set and status updated to cancelled', { runId });
    
    return res.status(200).json({
      success: true,
      message: 'Run cancelled successfully',
      runId,
    });
  } catch (error) {
    Logger.error('Error cancelling run', { error });
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

