/**
 * Runs API - Consolidated endpoint for all run operations
 * 
 * GET /api/runs - List recent runs
 * GET /api/runs?runId=X - Get specific run details
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate } from '../lib/middleware/auth';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Logger } from '../lib/utils';

async function handler(
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

export default authenticate(handler);

async function handleListRuns(req: VercelRequest, res: VercelResponse) {
  try {
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.pageSize as string) || '20', 10);
    
    Logger.info('Listing runs', { page, pageSize });
    
    const runsStorage = new RunsStorage();
    const result = await runsStorage.list(page, pageSize);
    
    Logger.info('Runs listed successfully', { count: result.runs.length, total: result.total });
    
    // Check if there's an active run
    const activeRunId = RunsStorage.getActiveRunId();
    
    res.status(200).json({
      ...result,
      activeRun: activeRunId,
    });
  } catch (error) {
    Logger.error('Failed to list runs', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    // Return empty list on error instead of 500
    res.status(200).json({
      runs: [],
      total: 0,
      page: 1,
      pageSize: 20,
      hasMore: false,
      activeRun: null,
      error: (error as Error).message,
    });
  }
}

async function handleGetRun(req: VercelRequest, res: VercelResponse, runId: string) {
  try {
    Logger.info('📊 API: Getting run details', { runId });
    
    const runsStorage = new RunsStorage();
    
    // Get run summary
    const summary = await runsStorage.get(runId);
    
    if (!summary) {
      Logger.warn('❌ Run not found in index', { runId });
      return res.status(404).json({ error: 'Run not found' });
    }
    
    Logger.info('✅ Run summary found', { 
      runId, 
      status: summary.status,
      episode_url: summary.episode_url 
    });
    
    // Get full manifest if available
    const manifest = await runsStorage.getManifest(runId);
    
    if (manifest) {
      Logger.info('✅ Manifest loaded', { 
        runId,
        has_pipeline_report: !!manifest.pipeline_report,
        pipeline_report_keys: manifest.pipeline_report ? Object.keys(manifest.pipeline_report) : [],
      });
    } else {
      Logger.warn('⚠️ No manifest found', { runId });
    }
    
    res.status(200).json({
      summary,
      manifest,
    });
  } catch (error) {
    Logger.error('❌ Failed to get run details', {
      runId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    res.status(500).json({
      error: 'Failed to get run details',
      message: (error as Error).message,
    });
  }
}

