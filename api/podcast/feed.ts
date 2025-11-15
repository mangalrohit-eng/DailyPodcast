/**
 * Podcast Feed API endpoint
 * 
 * GET /api/podcast/feed
 * Serves the RSS feed XML from storage
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../../lib/tools/storage';
import { ConfigStorage } from '../../lib/tools/config-storage';
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
        
        // Load config for empty feed
        const configStorage = new ConfigStorage();
        let config;
        try {
          config = await configStorage.load();
        } catch (error) {
          config = {
            podcast_title: "Rohit's Daily AI & Corporate News Brief",
            podcast_description: 'Your personalized daily news brief',
            podcast_author: 'Rohit',
            podcast_email: 'podcast@example.com',
            podcast_language: 'en-us',
            podcast_category: 'News',
          };
        }
        
        // Helper to escape XML
        const escapeXml = (str: string): string => {
          if (!str) return '';
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        };
        
        // Return a minimal valid RSS feed with helpful message
        const baseUrl = config.podcast_base_url || process.env.PODCAST_BASE_URL || 'https://daily-podcast-brown.vercel.app';
        const imageUrl = config.podcast_image_url || `${baseUrl}/podcast-artwork.jpg`;
        const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.podcast_title)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(config.podcast_description)}</description>
    <language>${config.podcast_language || 'en-us'}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/podcast/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>${escapeXml(config.podcast_author)}</itunes:author>
    <itunes:summary>${escapeXml(config.podcast_description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(config.podcast_author)}</itunes:name>
      <itunes:email>${config.podcast_email}</itunes:email>
    </itunes:owner>
    <itunes:image href="${imageUrl}"/>
    <itunes:category text="${config.podcast_category || 'News'}"/>
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
    // Load dashboard config for podcast metadata
    const configStorage = new ConfigStorage();
    let config;
    try {
      config = await configStorage.load();
      Logger.info('Loaded dashboard config for feed generation');
    } catch (error) {
      Logger.warn('Failed to load dashboard config, using defaults', { error });
      config = {
        podcast_title: "Rohit's Daily AI & Corporate News Brief",
        podcast_description: 'Your personalized daily news brief',
        podcast_author: 'Rohit',
        podcast_email: 'podcast@example.com',
        podcast_language: 'en-us',
        podcast_category: 'News',
      };
    }
    
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
    const episodes = index.runs.filter((r: any) => {
      // Must have URL, status success, and URL must be valid
      return r.episode_url && 
             r.status === 'success' && 
             r.episode_url.startsWith('http');
    });
    
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
      Logger.warn('No episodes with valid URLs found in index');
      return null;
    }
    
    const baseUrl = config.podcast_base_url || process.env.PODCAST_BASE_URL || 'https://daily-podcast-brown.vercel.app';
    const imageUrl = config.podcast_image_url || `${baseUrl}/podcast-artwork.jpg`;
    const now = new Date().toUTCString();
    
    // Helper to escape XML special characters
    const escapeXml = (str: string): string => {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };
    
    // Generate RSS feed XML using dashboard config
    const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(config.podcast_title)}</title>
    <link>${baseUrl}</link>
    <description>${escapeXml(config.podcast_description)}</description>
    <language>${config.podcast_language || 'en-us'}</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${baseUrl}/podcast/feed.xml" rel="self" type="application/rss+xml"/>
    <itunes:author>${escapeXml(config.podcast_author)}</itunes:author>
    <itunes:summary>${escapeXml(config.podcast_description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(config.podcast_author)}</itunes:name>
      <itunes:email>${config.podcast_email}</itunes:email>
    </itunes:owner>
    <itunes:image href="${imageUrl}"/>
    <itunes:category text="${config.podcast_category || 'News'}"/>
    <itunes:explicit>no</itunes:explicit>
${episodes.map((ep: any) => {
      const episodeDate = escapeXml(ep.date || 'Unknown Date');
      const episodeTitle = escapeXml(ep.title || `Daily News - ${episodeDate}`);
      const episodeDescription = escapeXml(ep.description || `Your daily news brief for ${episodeDate}`);
      const episodeUrl = ep.episode_url; // URLs don't need escaping in XML
      const fileSize = ep.file_size || 5000000;
      const duration = ep.duration_ms ? Math.round(ep.duration_ms / 1000) : 900;
      const pubDate = ep.completed_at ? new Date(ep.completed_at).toUTCString() : now;
      
      return `    <item>
      <title>${episodeTitle}</title>
      <description>${episodeDescription}</description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${episodeUrl}" length="${fileSize}" type="audio/mpeg"/>
      <guid isPermaLink="false">${escapeXml(ep.run_id)}</guid>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:explicit>no</itunes:explicit>
    </item>`;
    }).join('\n')}
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

