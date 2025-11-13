/**
 * Run Detail API
 * 
 * GET /api/runs/:runId - Get run details and manifest
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RunsStorage } from '../../lib/tools/runs-storage';
import { Logger } from '../../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const runId = req.query.runId as string;
    
    if (!runId) {
      return res.status(400).json({ error: 'runId is required' });
    }
    
    const runsStorage = new RunsStorage();
    
    // Get run summary
    const summary = await runsStorage.get(runId);
    
    if (!summary) {
      return res.status(404).json({ error: 'Run not found' });
    }
    
    // Get full manifest if available
    const manifest = await runsStorage.getManifest(runId);
    
    res.status(200).json({
      summary,
      manifest,
    });
  } catch (error) {
    Logger.error('Failed to get run details', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: 'Failed to get run details',
      message: (error as Error).message,
    });
  }
}

