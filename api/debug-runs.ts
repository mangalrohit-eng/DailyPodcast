/**
 * Debug endpoint to inspect runs index
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate } from '../lib/middleware/auth';
import { StorageTool } from '../lib/tools/storage';
import { Logger } from '../lib/utils';

async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const storage = new StorageTool();
    
    // Check what exists in storage
    const indexExists = await storage.exists('runs/index.json');
    const feedExists = await storage.exists('feed.xml');
    
    let indexData = null;
    let episodeCount = 0;
    
    if (indexExists) {
      const data = await storage.get('runs/index.json');
      indexData = JSON.parse(data.toString('utf-8'));
      episodeCount = indexData.runs?.filter((r: any) => r.episode_url)?.length || 0;
    }
    
    // List all files in episodes directory
    const episodeFiles = await storage.list('episodes/');
    
    res.status(200).json({
      storage: {
        runs_index_exists: indexExists,
        feed_xml_exists: feedExists,
      },
      runs_index: indexData,
      episode_files: episodeFiles.map(f => ({
        path: f.path,
        url: f.url,
        uploadedAt: f.uploadedAt,
      })),
      summary: {
        total_runs: indexData?.runs?.length || 0,
        runs_with_episodes: episodeCount,
        episode_files_count: episodeFiles.length,
      },
    });
  } catch (error) {
    Logger.error('Debug runs failed', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

export default authenticate(handler);

