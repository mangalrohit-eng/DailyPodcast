/**
 * Logs API - Consolidated endpoint for all log operations
 * 
 * GET /api/logs?type=latest&cursor=N - Get latest run logs
 * GET /api/logs?type=run&runId=X&cursor=N - Get specific run logs
 * GET /api/logs?type=run&runId=X&download=true - Download logs
 * GET /api/logs?type=stream&runId=latest - Stream logs (SSE)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { LogsStorage } from '../lib/tools/logs-storage';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const type = (req.query.type as string) || 'latest';
  
  switch (type) {
    case 'latest':
      return handleLatest(req, res);
    case 'run':
      return handleRun(req, res);
    case 'stream':
      return handleStream(req, res);
    default:
      return res.status(400).json({ error: 'Invalid type parameter' });
  }
}

async function handleLatest(req: VercelRequest, res: VercelResponse) {
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

async function handleRun(req: VercelRequest, res: VercelResponse) {
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

async function handleStream(req: VercelRequest, res: VercelResponse) {
  try {
    const runId = (req.query.runId as string) || 'latest';
    const startCursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : 0;
    
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
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

export const config = {
  api: {
    bodyParser: false,
  },
};

