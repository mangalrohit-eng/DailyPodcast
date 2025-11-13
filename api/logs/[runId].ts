/**
 * Run Logs API
 * 
 * GET /api/logs/:runId - Get logs for specific run
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { LogsStorage } from '../../lib/tools/logs-storage';
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
    
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
    const download = req.query.download === 'true';
    
    const logsStorage = new LogsStorage();
    const result = await logsStorage.getLogs(runId, cursor);
    
    // Return as downloadable JSONL file
    if (download) {
      const jsonl = result.logs.map(log => JSON.stringify(log)).join('\n');
      
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Content-Disposition', `attachment; filename="logs-${runId}.jsonl"`);
      return res.status(200).send(jsonl);
    }
    
    // Return as JSON
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Failed to get logs', {
      error: (error as Error).message,
    });
    
    res.status(404).json({
      error: 'Logs not found',
      message: (error as Error).message,
    });
  }
}

