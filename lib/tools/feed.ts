/**
 * Feed Tool - Parse and generate RSS/Atom feeds
 */

import Parser from 'rss-parser';
import { HttpTool } from './http';
import { Logger } from '../utils';

export interface FeedItem {
  title: string;
  link: string;
  pubDate?: Date;
  content?: string;
  contentSnippet?: string;
  guid?: string;
}

export class FeedTool {
  private parser: Parser;
  
  constructor() {
    this.parser = new Parser({
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DailyPodcastBot/1.0)',
      },
    });
  }
  
  async parseFeed(url: string): Promise<FeedItem[]> {
    try {
      Logger.debug('Parsing feed', { url });
      
      const feed = await this.parser.parseURL(url);
      
      return (feed.items || []).map(item => ({
        title: item.title || '',
        link: item.link || item.guid || '',
        pubDate: item.pubDate ? new Date(item.pubDate) : undefined,
        content: item.content || item['content:encoded'],
        contentSnippet: item.contentSnippet,
        guid: item.guid || item.link,
      }));
    } catch (error) {
      Logger.error('Failed to parse feed', { url, error: (error as Error).message });
      return [];
    }
  }
  
  async parseMultipleFeeds(urls: string[]): Promise<FeedItem[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.parseFeed(url))
    );
    
    const allItems: FeedItem[] = [];
    
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      }
    }
    
    return allItems;
  }
  
  static buildPodcastFeed(options: {
    title: string;
    description: string;
    link: string;
    language: string;
    author: string;
    email: string;
    category: string;
    imageUrl?: string;
    items: Array<{
      title: string;
      description: string;
      link: string;
      enclosureUrl: string;
      enclosureLength: number;
      pubDate: Date;
      duration: number;
      guid: string;
    }>;
  }): string {
    const { title, description, link, language, author, email, category, imageUrl, items } = options;
    
    const escapeXml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };
    
    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    const itemsXml = items
      .map(
        item => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${item.pubDate.toUTCString()}</pubDate>
      <enclosure url="${escapeXml(item.enclosureUrl)}" length="${item.enclosureLength}" type="audio/mpeg"/>
      <itunes:duration>${formatDuration(item.duration)}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`
      )
      .join('\n');
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(title)}</title>
    <description>${escapeXml(description)}</description>
    <link>${escapeXml(link)}</link>
    <language>${language}</language>
    <copyright>Copyright ${new Date().getFullYear()}</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${escapeXml(author)}</itunes:author>
    <itunes:summary>${escapeXml(description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(author)}</itunes:name>
      <itunes:email>${email}</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="${escapeXml(category)}"/>
    ${imageUrl ? `<itunes:image href="${escapeXml(imageUrl)}"/>` : ''}
    ${imageUrl ? `<image>\n      <url>${escapeXml(imageUrl)}</url>\n      <title>${escapeXml(title)}</title>\n      <link>${escapeXml(link)}</link>\n    </image>` : ''}
${itemsXml}
  </channel>
</rss>`;
  }
}

