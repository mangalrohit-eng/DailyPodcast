/**
 * Tests for RSS Feed generation
 */

import { describe, it, expect } from 'vitest';
import { FeedTool } from '../lib/tools/feed';

describe('FeedTool.buildPodcastFeed', () => {
  it('should generate valid RSS XML', () => {
    const feedXml = FeedTool.buildPodcastFeed({
      title: 'Test Podcast',
      description: 'A test podcast',
      link: 'https://example.com',
      language: 'en-us',
      author: 'Test Author',
      email: 'test@example.com',
      category: 'News',
      items: [{
        title: 'Episode 1',
        description: 'First episode',
        link: 'https://example.com/ep1',
        enclosureUrl: 'https://example.com/ep1.mp3',
        enclosureLength: 1000000,
        pubDate: new Date('2024-01-01'),
        duration: 900,
        guid: 'ep1',
      }],
    });
    
    expect(feedXml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(feedXml).toContain('<rss version="2.0"');
    expect(feedXml).toContain('<title>Test Podcast</title>');
    expect(feedXml).toContain('<item>');
    expect(feedXml).toContain('<enclosure');
    expect(feedXml).toContain('type="audio/mpeg"');
  });
  
  it('should escape XML entities', () => {
    const feedXml = FeedTool.buildPodcastFeed({
      title: 'Test & Podcast',
      description: 'A <test> podcast',
      link: 'https://example.com',
      language: 'en-us',
      author: 'Test Author',
      email: 'test@example.com',
      category: 'News',
      items: [],
    });
    
    expect(feedXml).toContain('Test &amp; Podcast');
    expect(feedXml).toContain('&lt;test&gt;');
  });
  
  it('should format duration correctly', () => {
    const feedXml = FeedTool.buildPodcastFeed({
      title: 'Test',
      description: 'Test',
      link: 'https://example.com',
      language: 'en-us',
      author: 'Test',
      email: 'test@example.com',
      category: 'News',
      items: [{
        title: 'Episode',
        description: 'Desc',
        link: 'https://example.com/ep',
        enclosureUrl: 'https://example.com/ep.mp3',
        enclosureLength: 1000,
        pubDate: new Date(),
        duration: 3665, // 1 hour, 1 minute, 5 seconds
        guid: 'ep',
      }],
    });
    
    expect(feedXml).toContain('<itunes:duration>1:01:05</itunes:duration>');
  });
});



