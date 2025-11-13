/**
 * Logs Streaming API (SSE)
 * 
 * GET /api/logs/stream - Stream logs in real-time
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
    const runId = (req.query.runId as string) || 'latest';
    const startCursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : 0;
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    const logsStorage = new LogsStorage();
    
    // Resolve 'latest' to actual run ID
    let actualRunId = runId;
    if (runId === 'latest') {
      const latestResult = await logsStorage.getLatestLogs();
      if (!latestResult.runId) {
        res.write('event: error\n');
        res.write('data: {"error":"No runs found"}\n\n');
        return res.end();
      }
      actualRunId = latestResult.runId;
    }
    
    // Send initial connection message
    res.write('event: connected\n');
    res.write(`data: {"runId":"${actualRunId}"}\n\n`);
    
    // Stream logs
    try {
      for await (const log of logsStorage.streamLogs(actualRunId, startCursor)) {
        res.write('event: log\n');
        res.write(`data: ${JSON.stringify(log)}\n\n`);
        
        // Flush to ensure data is sent immediately
        if ((res as any).flush) {
          (res as any).flush();
        }
      }
    } catch (error) {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    }
    
    // Send completion message
    res.write('event: complete\n');
    res.write('data: {"status":"stream ended"}\n\n');
    res.end();
  } catch (error) {
    Logger.error('Failed to stream logs', {
      error: (error as Error).message,
    });
    
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
    res.end();
  }
}

// Disable body parsing for SSE
export const config = {
  api: {
    bodyParser: false,
  },
};

