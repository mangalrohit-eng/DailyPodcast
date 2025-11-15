/**
 * External API - Get run errors
 * 
 * GET /api/external/run-errors?runId=2024-01-15
 * 
 * Headers:
 *   X-API-Key: <your-api-key>
 * 
 * Returns all errors from agent logs
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../../lib/tools/storage';
import { Logger } from '../../lib/utils';
import { authenticateApiKey } from '../../lib/middleware/api-auth';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Authenticate API key
  const authError = authenticateApiKey(req);
  if (authError) {
    return res.status(401).json({ error: authError });
  }
  
  const runId = req.query.runId as string | undefined;
  
  if (!runId) {
    return res.status(400).json({
      success: false,
      error: 'Missing runId parameter',
    });
  }
  
  Logger.info('🤖 External API: Get errors', { runId });
  
  try {
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
  } catch (error) {
    Logger.error('❌ External API: Get errors failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

