/**
 * External API - Get run logs
 * 
 * GET /api/external/run-logs?runId=2024-01-15&agent=RankingAgent
 * GET /api/external/run-logs?runId=2024-01-15 (all agents)
 * 
 * Headers:
 *   X-API-Key: <your-api-key>
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
  const agent = req.query.agent as string | undefined;
  
  if (!runId) {
    return res.status(400).json({
      success: false,
      error: 'Missing runId parameter',
    });
  }
  
  Logger.info('🤖 External API: Get logs', { runId, agent });
  
  try {
    const storage = new StorageTool();
    
    const agentNames = agent ? [agent] : [
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
    
    const logs: Record<string, any> = {};
    
    for (const agentName of agentNames) {
      const path = `runs/${runId}/agents/${agentName}.json`;
      try {
        const content = await storage.get(path);
        if (content) {
          logs[agentName] = JSON.parse(content);
        }
      } catch (error) {
        // Agent log doesn't exist - skip
        logs[agentName] = null;
      }
    }
    
    return res.status(200).json({
      success: true,
      run_id: runId,
      logs,
    });
  } catch (error) {
    Logger.error('❌ External API: Get logs failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

