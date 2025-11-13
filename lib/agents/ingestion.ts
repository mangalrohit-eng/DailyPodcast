/**
 * Ingestion Agent - Fetches news from multiple sources
 */

import { BaseAgent } from './base';
import { Story } from '../types';
import { FeedTool, FeedItem } from '../tools/feed';
import { HttpTool } from '../tools/http';
import { Config } from '../config';
import { Logger, Crypto, extractDomain, cleanText, Clock } from '../utils';

export interface IngestionInput {
  topics: Array<{
    name: string;
    sources: string[];
    keywords: string[];
  }>;
  window_hours: number;
  cutoff_date: Date;
}

export interface IngestionOutput {
  stories: Story[];
  sources_fetched: number;
  items_found: number;
  items_filtered: number;
}

export class IngestionAgent extends BaseAgent<IngestionInput, IngestionOutput> {
  private feedTool: FeedTool;
  
  constructor() {
    super({
      name: 'IngestionAgent',
      systemPrompt: `You are a news ingestion agent. Your role is to fetch and normalize news articles from various sources.`,
      retries: 2,
    });
    
    this.feedTool = new FeedTool();
  }
  
  protected async process(input: IngestionInput): Promise<IngestionOutput> {
    const { topics, window_hours, cutoff_date } = input;
    
    const allStories: Story[] = [];
    const seenUrls = new Set<string>();
    let sourcesFetched = 0;
    let itemsFound = 0;
    
    // Fetch from all topic sources
    for (const topic of topics) {
      Logger.info(`Fetching ${topic.name} sources`, { count: topic.sources.length });
      
      for (const sourceUrl of topic.sources) {
        try {
          sourcesFetched++;
          const items = await this.feedTool.parseFeed(sourceUrl);
          itemsFound += items.length;
          
          for (const item of items) {
            const story = this.normalizeItem(item, topic.name);
            
            if (!story) continue;
            
            // Apply filters
            if (seenUrls.has(story.url)) continue;
            if (story.published_at < cutoff_date) continue;
            if (!this.passesQualityFilter(story)) continue;
            if (!this.matchesTopic(story, topic.keywords)) continue;
            
            seenUrls.add(story.url);
            allStories.push(story);
          }
        } catch (error) {
          Logger.warn(`Failed to fetch source`, {
            url: sourceUrl,
            error: (error as Error).message,
          });
        }
      }
    }
    
    // Deduplicate by content similarity (simple domain-based approach)
    const dedupedStories = this.deduplicateStories(allStories);
    
    Logger.info('Ingestion complete', {
      sources_fetched: sourcesFetched,
      items_found: itemsFound,
      stories_after_filter: dedupedStories.length,
    });
    
    return {
      stories: dedupedStories,
      sources_fetched: sourcesFetched,
      items_found: itemsFound,
      items_filtered: itemsFound - dedupedStories.length,
    };
  }
  
  private normalizeItem(item: FeedItem, topic: string): Story | null {
    if (!item.link || !item.title) {
      return null;
    }
    
    const domain = extractDomain(item.link);
    const pubDate = item.pubDate || new Date();
    
    const story: Story = {
      id: Crypto.sha256(item.link).substring(0, 16),
      url: item.link,
      title: cleanText(item.title),
      source: domain,
      published_at: pubDate,
      summary: item.contentSnippet ? cleanText(item.contentSnippet) : undefined,
      raw: item.content,
      canonical: item.link,
      domain,
      topic,
    };
    
    return story;
  }
  
  private passesQualityFilter(story: Story): boolean {
    // Content length check
    const contentLength = (story.summary || story.title).length;
    if (contentLength < Config.MIN_CONTENT_LENGTH) {
      return false;
    }
    
    // Basic spam/quality heuristics
    const title = story.title.toLowerCase();
    const spamKeywords = ['click here', 'you won\'t believe', 'shocking', 'one weird trick'];
    if (spamKeywords.some(keyword => title.includes(keyword))) {
      return false;
    }
    
    // Filter non-English (basic check)
    const englishPattern = /^[\x00-\x7F\s]*$/;
    const textToCheck = story.title + (story.summary || '');
    const nonAsciiRatio = (textToCheck.length - textToCheck.replace(/[^\x00-\x7F]/g, '').length) / textToCheck.length;
    if (nonAsciiRatio > 0.3) {
      return false; // More than 30% non-ASCII suggests non-English
    }
    
    return true;
  }
  
  private matchesTopic(story: Story, keywords: string[]): boolean {
    const text = `${story.title} ${story.summary || ''}`.toLowerCase();
    
    // At least one keyword must match
    return keywords.some(keyword => text.includes(keyword.toLowerCase()));
  }
  
  private deduplicateStories(stories: Story[]): Story[] {
    // Group by domain and limit per domain
    const byDomain = new Map<string, Story[]>();
    
    for (const story of stories) {
      const existing = byDomain.get(story.domain) || [];
      existing.push(story);
      byDomain.set(story.domain, existing);
    }
    
    const deduplicated: Story[] = [];
    const maxPerDomain = Config.MAX_STORIES_PER_DOMAIN;
    
    for (const [domain, domainStories] of byDomain.entries()) {
      // Sort by recency and take top N
      const sorted = domainStories.sort(
        (a, b) => b.published_at.getTime() - a.published_at.getTime()
      );
      
      deduplicated.push(...sorted.slice(0, maxPerDomain));
    }
    
    return deduplicated;
  }
}

