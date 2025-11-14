/**
 * Episode Streaming API endpoint
 * 
 * GET /api/podcast/episodes?date=YYYY-MM-DD
 * Streams episode MP3 with Range support
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
  
  const date = req.query.date as string;
  
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: 'Invalid date parameter. Use format: YYYY-MM-DD',
    });
  }
  
  try {
    const storage = new StorageTool();
    const episodePath = `episodes/${date}_daily_rohit_news.mp3`;
    
    // Check if episode exists
    const exists = await storage.exists(episodePath);
    
    if (!exists) {
      Logger.warn('Episode not found', { date });
      return res.status(404).json({
        error: `Episode for ${date} not found`,
      });
    }
    
    // Fetch episode from storage
    const audioBuffer = await storage.get(episodePath);
    
    // Handle Range requests for podcast players
    const range = req.headers.range;
    
    if (range) {
      // Parse range header
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : audioBuffer.length - 1;
      const chunkSize = end - start + 1;
      
      // Send partial content
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${audioBuffer.length}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      
      return res.send(audioBuffer.slice(start, end + 1));
    } else {
      // Send entire file
      res.status(200);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', audioBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      
      return res.send(audioBuffer);
    }
  } catch (error) {
    Logger.error('Failed to serve episode', {
      date,
      error: (error as Error).message,
    });
    
    return res.status(500).json({
      error: 'Failed to load episode',
    });
  }
}



