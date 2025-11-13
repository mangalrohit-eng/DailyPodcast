/**
 * Runs List API
 * 
 * GET /api/runs - List recent runs
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

