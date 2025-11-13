/**
 * Latest Logs API
 * 
 * GET /api/logs/latest - Get latest run logs
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
    const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
    
    const logsStorage = new LogsStorage();
    const result = await logsStorage.getLatestLogs(cursor);
    
    res.status(200).json(result);
  } catch (error) {
    Logger.error('Failed to get latest logs', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: 'Failed to get logs',
      message: (error as Error).message,
    });
  }
}

