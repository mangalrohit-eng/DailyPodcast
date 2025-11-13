/**
 * Podcast Feed API endpoint
 * 
 * GET /api/podcast/feed
 * Serves the RSS feed XML from storage
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../../lib/tools/storage';
import { Logger } from '../../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const storage = new StorageTool();
    
    // Check if feed exists
    const exists = await storage.exists('feed.xml');
    
    if (!exists) {
      Logger.warn('Feed not found');
      return res.status(404).send('Feed not found. Please run the generator first.');
    }
    
    // Fetch feed from storage
    const feedData = await storage.get('feed.xml');
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    
    return res.status(200).send(feedData);
  } catch (error) {
    Logger.error('Failed to serve feed', {
      error: (error as Error).message,
    });
    
    return res.status(500).json({
      error: 'Failed to load feed',
    });
  }
}

