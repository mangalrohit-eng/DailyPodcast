/**
 * Index Existing Episodes API
 * 
 * POST /api/index-episodes - Scan and index pre-dashboard episodes
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { StorageTool } from '../lib/tools/storage';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  return AuthMiddleware.protect(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const storage = new StorageTool();
      
      Logger.info('Scanning for existing episodes...');
      
      // List all objects in episodes directory
      const objects = await storage.list('episodes/');
      
      // Find MP3 files
      const mp3Objects = objects.filter(obj => obj.path.endsWith('.mp3'));
      
      Logger.info(`Found ${mp3Objects.length} episode files`);
      
      const indexed: any[] = [];
      const skipped: string[] = [];
      
      // Load or create runs index
      let runsIndex: any = { runs: [], last_updated: new Date().toISOString() };
      
      try {
        const existingIndex = await storage.get('runs/index.json');
        runsIndex = JSON.parse(existingIndex.toString('utf-8'));
      } catch {
        // Index doesn't exist yet, will create new one
        Logger.info('Creating new runs index');
      }
      
      for (const mp3Obj of mp3Objects) {
        const filename = mp3Obj.path.split('/').pop() || '';
        const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})_/);
        
        if (!dateMatch) {
          skipped.push(filename);
          continue;
        }
        
        const date = dateMatch[1];
        
        // Check if already in index
        const existing = runsIndex.runs.find((r: any) => r.run_id === date);
        
        if (existing) {
          skipped.push(`${date} (already indexed)`);
          continue;
        }
        
        // Add to index
        const runSummary = {
          run_id: date,
          date: date,
          status: 'success',
          started_at: mp3Obj.uploadedAt.toISOString(),
          completed_at: mp3Obj.uploadedAt.toISOString(),
          episode_url: mp3Obj.url,
          stories_count: 0, // Unknown for pre-dashboard episodes
          duration_ms: 0, // Unknown
        };
        
        runsIndex.runs.unshift(runSummary);
        indexed.push(runSummary);
        
        Logger.info(`Indexed episode: ${date}`);
      }
      
      // Save updated index
      if (indexed.length > 0) {
        runsIndex.last_updated = new Date().toISOString();
        
        await storage.put(
          'runs/index.json',
          JSON.stringify(runsIndex, null, 2),
          'application/json'
        );
        
        Logger.info(`Saved runs index with ${runsIndex.runs.length} total runs`);
      }
      
      res.status(200).json({
        success: true,
        indexed: indexed.length,
        skipped: skipped.length,
        episodes: indexed.map(e => ({
          date: e.date,
          url: e.episode_url,
        })),
        message: `Indexed ${indexed.length} episodes. Refresh the dashboard to see them.`,
      });
      
    } catch (error) {
      Logger.error('Failed to index episodes', {
        error: (error as Error).message,
      });
      
      res.status(500).json({
        error: 'Failed to index episodes',
        message: (error as Error).message,
      });
    }
  });
}

