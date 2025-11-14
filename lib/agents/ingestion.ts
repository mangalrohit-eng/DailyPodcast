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
  detailed_report: {
    sources_scanned: Array<{ name: string; url: string; items_found: number; status: string }>;
    total_items_before_filter: number;
    filtered_out: Array<{ title: string; reason: string }>;
    topics_breakdown: Record<string, number>;
  };
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
    
    // Detailed tracking
    const sourcesScanned: Array<{ name: string; url: string; items_found: number; status: string }> = [];
    const filteredOut: Array<{ title: string; reason: string }> = [];
    
    // Fetch from all topic sources
    for (const topic of topics) {
      Logger.info(`Fetching ${topic.name} sources`, { count: topic.sources.length });
      let topicStoriesCount = 0;
      
      for (const sourceUrl of topic.sources) {
        try {
          sourcesFetched++;
          const items = await this.feedTool.parseFeed(sourceUrl);
          itemsFound += items.length;
          
          sourcesScanned.push({
            name: topic.name,
            url: sourceUrl,
            items_found: items.length,
            status: 'success',
          });
          
          Logger.debug(`Fetched ${items.length} items from ${sourceUrl.substring(0, 50)}...`);
          
          let beforeFilter = 0;
          for (const item of items) {
            const story = this.normalizeItem(item, topic.name);
            
            if (!story) continue;
            beforeFilter++;
            
            // Apply filters with detailed tracking
            if (seenUrls.has(story.url)) {
              filteredOut.push({ title: story.title, reason: 'Duplicate URL' });
              continue;
            }
            if (story.published_at < cutoff_date) {
              filteredOut.push({ title: story.title, reason: `Too old (${story.published_at.toISOString()})` });
              Logger.debug(`Story too old: ${story.title.substring(0, 50)}... (${story.published_at.toISOString()})`);
              continue;
            }
            
            // Check if this is Google News (already curated, high-quality)
            const isGoogleNews = sourceUrl.includes('news.google.com');
            
            // Skip quality filter for Google News - RSS summaries are short snippets, 
            // but actual articles are full-length
            if (!isGoogleNews && !this.passesQualityFilter(story)) {
              filteredOut.push({ title: story.title, reason: 'Failed quality filter (content too short)' });
              Logger.debug(`Story failed quality filter: ${story.title.substring(0, 50)}...`);
              continue;
            }
            
            // Skip keyword matching for Google News RSS - it's already topic-filtered
            
            if (!isGoogleNews && !this.matchesTopic(story, topic.keywords)) {
              filteredOut.push({ title: story.title, reason: `No keyword match for ${topic.name}` });
              Logger.debug(`Story doesn't match topic keywords: ${story.title.substring(0, 50)}...`, {
                keywords: topic.keywords.slice(0, 3),
              });
              continue;
            }
            
            seenUrls.add(story.url);
            allStories.push(story);
            topicStoriesCount++;
            Logger.debug(`✓ Story accepted for ${topic.name}: ${story.title.substring(0, 60)}...`);
          }
          
          Logger.info(`${topic.name} - Source processed: ${beforeFilter} stories, ${topicStoriesCount} accepted so far`);
        } catch (error) {
          sourcesScanned.push({
            name: topic.name,
            url: sourceUrl,
            items_found: 0,
            status: `Failed: ${(error as Error).message}`,
          });
          Logger.warn(`Failed to fetch source`, {
            url: sourceUrl.substring(0, 60),
            error: (error as Error).message,
          });
        }
      }
      
      Logger.info(`${topic.name} total: ${topicStoriesCount} stories found`);
    }
    
    // Deduplicate by content similarity (simple domain-based approach)
    const dedupedStories = this.deduplicateStories(allStories);
    
    // Count stories by topic
    const topicsBreakdown: Record<string, number> = {};
    for (const story of dedupedStories) {
      topicsBreakdown[story.topic || 'General'] = (topicsBreakdown[story.topic || 'General'] || 0) + 1;
    }
    
    Logger.info('Ingestion complete', {
      sources_fetched: sourcesFetched,
      items_found: itemsFound,
      stories_after_filter: dedupedStories.length,
      topics_breakdown: topicsBreakdown,
    });
    
    return {
      stories: dedupedStories,
      sources_fetched: sourcesFetched,
      items_found: itemsFound,
      items_filtered: itemsFound - dedupedStories.length,
      detailed_report: {
        sources_scanned: sourcesScanned,
        total_items_before_filter: itemsFound,
        filtered_out: filteredOut,
        topics_breakdown: topicsBreakdown,
      },
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
    
    // At least one keyword must match (case-insensitive)
    return keywords.some(keyword => {
      const normalizedKeyword = keyword.toLowerCase();
      return text.includes(normalizedKeyword);
    });
  }
  
  /**
   * More lenient topic matching for fallback
   * Matches if ANY word from keywords appears
   */
  private matchesTopicLoose(story: Story, keywords: string[]): boolean {
    const text = `${story.title} ${story.summary || ''}`.toLowerCase();
    const words = text.split(/\s+/);
    
    return keywords.some(keyword => {
      const keywordWords = keyword.toLowerCase().split(/\s+/);
      return keywordWords.some(kw => words.some(w => w.includes(kw) || kw.includes(w)));
    });
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

