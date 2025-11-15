/**
 * Consolidated External API - All external endpoints in one
 * 
 * Endpoints:
 *   GET /api/external?action=run-errors&runId=2024-01-15
 *   GET /api/external?action=run-logs&runId=2024-01-15
 *   GET /api/external?action=run-status&runId=2024-01-15
 *   POST /api/external?action=trigger-run
 * 
 * Headers:
 *   X-API-Key: <your-api-key>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../lib/tools/storage';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Logger } from '../lib/utils';
import { authenticateApiKey } from '../lib/middleware/api-auth';
import { Orchestrator } from '../lib/orchestrator';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Authenticate API key
  const authError = authenticateApiKey(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }
  
  const action = req.query.action as string | undefined;
  
  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing action parameter. Valid actions: run-errors, run-logs, run-status, trigger-run',
    });
  }
  
  Logger.info('🤖 External API called', { action, method: req.method });
  
  try {
    switch (action) {
      case 'run-errors':
        return await handleRunErrors(req, res);
      case 'run-logs':
        return await handleRunLogs(req, res);
      case 'run-status':
        return await handleRunStatus(req, res);
      case 'trigger-run':
        return await handleTriggerRun(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: `Invalid action: ${action}. Valid actions: run-errors, run-logs, run-status, trigger-run`,
        });
    }
  } catch (error) {
    Logger.error('❌ External API error', {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleRunErrors(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const runId = req.query.runId as string | undefined;
  
  if (!runId) {
    return res.status(400).json({
      success: false,
      error: 'Missing runId parameter',
    });
  }
  
  const storage = new StorageTool();
  
  const agentNames = [
    'IngestionAgent',
    'RankingAgent',
    'ScraperAgent',
    'OutlineAgent',
    'ScriptwriterAgent',
    'FactCheckAgent',
    'SafetyAgent',
    'TtsDirectorAgent',
    'AudioEngineerAgent',
    'PublisherAgent',
    'MemoryAgent',
  ];
  
  const errors: Array<{
    agent: string;
    timestamp: string;
    errors: string[];
    duration_ms?: number;
  }> = [];
  
  for (const agentName of agentNames) {
    const path = `runs/${runId}/agents/${agentName}.json`;
    try {
      const content = await storage.get(path);
      if (content) {
        const agentLog = JSON.parse(content);
        if (agentLog.errors && agentLog.errors.length > 0) {
          errors.push({
            agent: agentName,
            timestamp: agentLog.timestamp,
            errors: agentLog.errors,
            duration_ms: agentLog.duration_ms,
          });
        }
      }
    } catch (error) {
      // Agent log doesn't exist - skip
    }
  }
  
  return res.status(200).json({
    success: true,
    run_id: runId,
    has_errors: errors.length > 0,
    error_count: errors.length,
    errors,
  });
}

async function handleRunLogs(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const runId = req.query.runId as string | undefined;
  
  if (!runId) {
    return res.status(400).json({
      success: false,
      error: 'Missing runId parameter',
    });
  }
  
  const storage = new StorageTool();
  
  const agentNames = [
    'IngestionAgent',
    'RankingAgent',
    'ScraperAgent',
    'OutlineAgent',
    'ScriptwriterAgent',
    'FactCheckAgent',
    'SafetyAgent',
    'TtsDirectorAgent',
    'AudioEngineerAgent',
    'PublisherAgent',
    'MemoryAgent',
  ];
  
  const logs: any[] = [];
  
  for (const agentName of agentNames) {
    const path = `runs/${runId}/agents/${agentName}.json`;
    try {
      const content = await storage.get(path);
      if (content) {
        logs.push(JSON.parse(content));
      }
    } catch (error) {
      // Agent log doesn't exist - skip
    }
  }
  
  return res.status(200).json({
    success: true,
    run_id: runId,
    agent_count: logs.length,
    logs,
  });
}

async function handleRunStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const runId = req.query.runId as string | undefined;
  
  if (!runId) {
    return res.status(400).json({
      success: false,
      error: 'Missing runId parameter',
    });
  }
  
  const runsStorage = new RunsStorage();
  const runs = await runsStorage.listRuns(1);
  
  const run = runs.find(r => r.run_id === runId);
  
  if (!run) {
    return res.status(404).json({
      success: false,
      error: 'Run not found',
    });
  }
  
  return res.status(200).json({
    success: true,
    run,
  });
}

async function handleTriggerRun(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const orchestrator = new Orchestrator();
  
  const result = await orchestrator.run({
    force_overwrite: req.body?.force_overwrite || false,
  });
  
  if (result.success) {
    return res.status(200).json({
      success: true,
      run_id: result.manifest?.run_id,
      episode_url: result.manifest?.mp3_url,
      duration_sec: result.manifest?.duration_sec,
      metrics: result.metrics,
    });
  } else {
    return res.status(500).json({
      success: false,
      error: result.error || 'Unknown error',
      metrics: result.metrics,
    });
  }
}

