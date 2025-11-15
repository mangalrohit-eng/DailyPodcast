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
      Logger.warn('Feed not found, generating from runs index');
      
      // Try to generate feed from runs index
      const feedXml = await generateFeedFromIndex(storage);
      
      if (!feedXml) {
        Logger.warn('Could not generate feed from index');
        
        // Return a minimal valid RSS feed with helpful message
        const baseUrl = process.env.PODCAST_BASE_URL || 'https://daily-podcast-brown.vercel.app';
        const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Daily Rohit News</title>
    <link>${baseUrl}</link>
    <description>Your personalized daily news brief</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/podcast/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>Daily Rohit News</itunes:author>
    <itunes:summary>Your personalized daily news brief</itunes:summary>
    <itunes:owner>
      <itunes:name>Daily Rohit News</itunes:name>
      <itunes:email>podcast@daily-rohit.com</itunes:email>
    </itunes:owner>
    <itunes:image href="${baseUrl}/podcast-artwork.jpg"/>
    <itunes:category text="News"/>
    <itunes:explicit>no</itunes:explicit>
  </channel>
</rss>`;
        
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
        return res.status(200).send(emptyFeed);
      }
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300'); // Shorter cache for generated feeds
      
      return res.status(200).send(feedXml);
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

/**
 * Generate RSS feed from runs index (fallback for when feed.xml doesn't exist)
 */
async function generateFeedFromIndex(storage: StorageTool): Promise<string | null> {
  try {
    // Load runs index
    Logger.info('Checking for runs/index.json');
    const indexExists = await storage.exists('runs/index.json');
    if (!indexExists) {
      Logger.warn('runs/index.json does not exist');
      return null;
    }
    
    Logger.info('Loading runs/index.json');
    const indexData = await storage.get('runs/index.json');
    const index = JSON.parse(indexData.toString('utf-8'));
    
    Logger.info('Loaded runs index', { totalRuns: index.runs?.length || 0 });
    
    // Get episodes (runs with episode URLs)
    const episodes = index.runs.filter((r: any) => r.episode_url && r.status === 'success');
    
    Logger.info('Filtered episodes', { 
      totalRuns: index.runs?.length || 0,
      episodesWithUrls: episodes.length,
      runs: index.runs?.map((r: any) => ({
        id: r.run_id,
        hasUrl: !!r.episode_url,
        status: r.status,
        url: r.episode_url?.substring(0, 50) + '...',
      }))
    });
    
    if (episodes.length === 0) {
      Logger.warn('No episodes with URLs found in index');
      return null;
    }
    
    const baseUrl = process.env.PODCAST_BASE_URL || 'https://daily-podcast-brown.vercel.app';
    const now = new Date().toUTCString();
    
    // Generate RSS feed XML
    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Daily Rohit News</title>
    <link>${baseUrl}</link>
    <description>Your personalized daily news brief</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/podcast/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>Daily Rohit News</itunes:author>
    <itunes:summary>Your personalized daily news brief</itunes:summary>
    <itunes:owner>
      <itunes:name>Daily Rohit News</itunes:name>
      <itunes:email>podcast@daily-rohit.com</itunes:email>
    </itunes:owner>
    <itunes:image href="${baseUrl}/podcast-artwork.jpg"/>
    <itunes:category text="News"/>
    <itunes:explicit>no</itunes:explicit>
${episodes.map((ep: any) => `    <item>
      <title>Daily News - ${ep.date}</title>
      <description>Your daily news brief for ${ep.date}</description>
      <pubDate>${new Date(ep.completed_at).toUTCString()}</pubDate>
      <enclosure url="${ep.episode_url}" length="${ep.file_size || 5000000}" type="audio/mpeg"/>
      <guid isPermaLink="false">${ep.run_id}</guid>
      <itunes:duration>${ep.duration_ms ? Math.round(ep.duration_ms / 1000) : 900}</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
    </item>`).join('\n')}
  </channel>
</rss>`;
    
    Logger.info('Generated RSS feed from index', { episodeCount: episodes.length });
    
    return feedXml;
  } catch (error) {
    Logger.error('Failed to generate feed from index', {
      error: (error as Error).message,
    });
    return null;
  }
}

