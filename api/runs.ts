/**
 * Runs API - Consolidated endpoint for all run operations
 * 
 * GET /api/runs - List recent runs
 * GET /api/runs?runId=X - Get specific run details
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const runId = req.query.runId as string;
  
  if (runId) {
    return handleGetRun(req, res, runId);
  } else {
    return handleListRuns(req, res);
  }
}

async function handleListRuns(req: VercelRequest, res: VercelResponse) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10);
    
    const runsStorage = new RunsStorage();
    const result = await runsStorage.list(page, pageSize);
    
    // Check if there's an active run
    const activeRunId = RunsStorage.getActiveRunId();
    
    res.status(200).json({
      ...result,
      activeRun: activeRunId,
    });
  } catch (error) {
    Logger.error('Failed to list runs', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: 'Failed to list runs',
      message: (error as Error).message,
    });
  }
}

async function handleGetRun(req: VercelRequest, res: VercelResponse, runId: string) {
  try {
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

