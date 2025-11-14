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
    all_stories_detailed: Array<{ 
      title: string; 
      topic: string; 
      url: string;
      published_at: string;
      status: 'accepted' | 'rejected'; 
      reason?: string;
    }>;
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
    const allStoriesDetailed: Array<{ title: string; topic: string; url: string; published_at: string; status: 'accepted' | 'rejected'; reason?: string }> = [];
    
    // Track Google News redirect resolution success/failure
    let googleNewsRedirectsAttempted = 0;
    let googleNewsRedirectsSuccessful = 0;
    let googleNewsRedirectsFailed = 0;
    
    // Fetch from all topic sources
    for (const topic of topics) {
      Logger.info(`Fetching ${topic.name} sources`, { count: topic.sources.length });
      let topicStoriesCount = 0;
      
      for (const sourceUrl of topic.sources) {
        try {
          sourcesFetched++;
          const items = await this.feedTool.parseFeed(sourceUrl);
          itemsFound += items.length;
          
          // Log date distribution for debugging
          if (items.length > 0) {
            const dates = items.map(item => item.pubDate?.toISOString().split('T')[0] || 'no-date');
            const dateCount: Record<string, number> = {};
            dates.forEach(d => dateCount[d] = (dateCount[d] || 0) + 1);
            Logger.info(`📅 Date distribution for ${topic.name} from ${sourceUrl.substring(0, 60)}`, { dateCount });
          }
          
          sourcesScanned.push({
            name: topic.name,
            url: sourceUrl,
            items_found: items.length,
            status: 'success',
          });
          
          Logger.debug(`Fetched ${items.length} items from ${sourceUrl.substring(0, 50)}...`);
          
          let beforeFilter = 0;
          const redirectTracking = { attempted: 0, successful: 0, failed: 0 };
          for (const item of items) {
            const story = await this.normalizeItem(item, topic.name, redirectTracking);
            
            if (!story) {
              // Track items that couldn't be normalized
              filteredOut.push({ 
                title: item.title || 'No title', 
                reason: 'Invalid story (missing link or title)' 
              });
              continue;
            }
            beforeFilter++;
            
            // Apply filters with detailed tracking
            if (seenUrls.has(story.url)) {
              const reason = 'Duplicate URL';
              filteredOut.push({ title: story.title, reason });
              allStoriesDetailed.push({ 
                title: story.title, 
                topic: topic.name, 
                url: story.url,
                published_at: story.published_at.toISOString(),
                status: 'rejected', 
                reason 
              });
              continue;
            }
            if (story.published_at < cutoff_date) {
              const hoursOld = Math.round((Date.now() - story.published_at.getTime()) / (1000 * 60 * 60));
              const reason = `Too old (${hoursOld}hrs old, cutoff: ${input.window_hours}hrs)`;
              filteredOut.push({ title: story.title, reason });
              allStoriesDetailed.push({ 
                title: story.title, 
                topic: topic.name, 
                url: story.url,
                published_at: story.published_at.toISOString(),
                status: 'rejected', 
                reason 
              });
              Logger.debug(`Story too old: ${story.title.substring(0, 50)}... (${story.published_at.toISOString()}, ${hoursOld}hrs old)`);
              continue;
            }
            
            // Check if this is Google News (already curated, high-quality)
            const isGoogleNews = sourceUrl.includes('news.google.com');
            
            // Skip quality filter for Google News - RSS summaries are short snippets, 
            // but actual articles are full-length
            if (!isGoogleNews && !this.passesQualityFilter(story)) {
              const reason = 'Failed quality filter (content too short)';
              filteredOut.push({ title: story.title, reason });
              allStoriesDetailed.push({ 
                title: story.title, 
                topic: topic.name, 
                url: story.url,
                published_at: story.published_at.toISOString(),
                status: 'rejected', 
                reason 
              });
              Logger.debug(`Story failed quality filter: ${story.title.substring(0, 50)}...`);
              continue;
            }
            
            // Skip keyword matching for Google News RSS - it's already topic-filtered
            
            if (!isGoogleNews && !this.matchesTopic(story, topic.keywords)) {
              const reason = `No keyword match for ${topic.name}`;
              filteredOut.push({ title: story.title, reason });
              allStoriesDetailed.push({ 
                title: story.title, 
                topic: topic.name, 
                url: story.url,
                published_at: story.published_at.toISOString(),
                status: 'rejected', 
                reason 
              });
              Logger.debug(`Story doesn't match topic keywords: ${story.title.substring(0, 50)}...`, {
                keywords: topic.keywords.slice(0, 3),
              });
              continue;
            }
            
            // Story accepted!
            seenUrls.add(story.url);
            allStories.push(story);
            topicStoriesCount++;
            allStoriesDetailed.push({ 
              title: story.title, 
              topic: topic.name, 
              url: story.url,
              published_at: story.published_at.toISOString(),
              status: 'accepted'
            });
            Logger.debug(`✓ Story accepted for ${topic.name}: ${story.title.substring(0, 60)}...`);
          }
          
          // Update global redirect tracking
          googleNewsRedirectsAttempted += redirectTracking.attempted;
          googleNewsRedirectsSuccessful += redirectTracking.successful;
          googleNewsRedirectsFailed += redirectTracking.failed;
          
          Logger.info(`${topic.name} - Source processed`, { 
            stories_processed: beforeFilter, 
            accepted_so_far: topicStoriesCount,
            google_redirects_attempted: redirectTracking.attempted,
            google_redirects_successful: redirectTracking.successful,
            google_redirects_failed: redirectTracking.failed
          });
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
    Logger.info('Before deduplication', { total_stories: allStories.length });
    const { dedupedStories, removedStories } = this.deduplicateStoriesWithTracking(allStories);
    Logger.info('After deduplication', { 
      deduplicated_stories: dedupedStories.length, 
      removed_by_dedup: removedStories.length 
    });
    
    // Update status for stories removed by deduplication
    // Build a Set of kept story URLs for quick lookup
    const keptUrls = new Set(dedupedStories.map(s => s.url));
    
    // Update allStoriesDetailed to mark removed stories as rejected
    removedStories.forEach(story => {
      const reason = `Duplicate domain+topic (max ${Config.MAX_STORIES_PER_DOMAIN} per domain per topic)`;
      filteredOut.push({ title: story.title, reason });
      
      // Find and update the existing entry in allStoriesDetailed
      const existingEntry = allStoriesDetailed.find(s => s.url === story.url);
      if (existingEntry) {
        existingEntry.status = 'rejected';
        existingEntry.reason = reason;
      } else {
        // Shouldn't happen, but add it just in case
        allStoriesDetailed.push({
          title: story.title,
          topic: story.topic || 'General',
          url: story.url,
          published_at: story.published_at.toISOString(),
          status: 'rejected',
          reason
        });
      }
    });
    
    // Count stories by topic
    const topicsBreakdown: Record<string, number> = {};
    for (const story of dedupedStories) {
      topicsBreakdown[story.topic || 'General'] = (topicsBreakdown[story.topic || 'General'] || 0) + 1;
    }
    
    Logger.info('========== INGESTION COMPLETE ==========', {
      sources_fetched: sourcesFetched,
      items_found: itemsFound,
      stories_after_filter: dedupedStories.length,
      topics_breakdown: topicsBreakdown,
      google_news_redirect_resolution: {
        attempted: googleNewsRedirectsAttempted,
        successful: googleNewsRedirectsSuccessful,
        failed: googleNewsRedirectsFailed,
        success_rate: googleNewsRedirectsAttempted > 0 
          ? `${((googleNewsRedirectsSuccessful / googleNewsRedirectsAttempted) * 100).toFixed(1)}%`
          : 'N/A'
      }
    });
    
    // CRITICAL WARNING if redirect resolution is failing
    if (googleNewsRedirectsFailed > 0) {
      Logger.warn(`⚠️ CRITICAL: ${googleNewsRedirectsFailed} Google News redirects failed to resolve!`, {
        impact: 'Stories will be grouped under news.google.com domain',
        consequence: 'Deduplication will treat all Google News stories as same domain',
        action_needed: 'Check logs above for resolution errors'
      });
    }
    
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
        all_stories_detailed: allStoriesDetailed,
      },
    };
  }
  
  private async normalizeItem(item: FeedItem, topic: string, tracking?: { attempted: number; successful: number; failed: number }): Promise<Story | null> {
    if (!item.link || !item.title) {
      return null;
    }
    
    // Resolve Google News redirects to get the actual article URL
    let actualUrl = item.link;
    const isGoogleNewsRedirect = item.link.includes('news.google.com/rss/articles/');
    
    if (isGoogleNewsRedirect && tracking) {
      tracking.attempted++;
      try {
        actualUrl = await this.resolveGoogleNewsRedirect(item.link);
        
        // Check if resolution actually worked (URL changed and is not Google)
        if (actualUrl !== item.link && !actualUrl.includes('news.google.com')) {
          tracking.successful++;
          Logger.debug(`✅ Resolved Google News redirect`, { 
            original: item.link.substring(0, 60),
            resolved: actualUrl.substring(0, 60),
            domain: extractDomain(actualUrl)
          });
        } else {
          tracking.failed++;
          Logger.warn(`⚠️ Google News redirect resolution failed - URL unchanged`, { 
            url: item.link.substring(0, 60)
          });
        }
      } catch (error) {
        tracking.failed++;
        Logger.error(`❌ Exception while resolving Google News redirect`, { 
          url: item.link.substring(0, 60),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const domain = extractDomain(actualUrl);
    const pubDate = item.pubDate || new Date();
    
    const story: Story = {
      id: Crypto.sha256(actualUrl).substring(0, 16),
      url: actualUrl, // Use resolved URL
      title: cleanText(item.title),
      source: domain,
      published_at: pubDate,
      summary: item.contentSnippet ? cleanText(item.contentSnippet) : undefined,
      raw: item.content,
      canonical: item.link, // Keep original for reference
      domain,
      topic,
    };
    
    return story;
  }
  
  /**
   * Resolve Google News redirect URL to actual article URL
   * CRITICAL: This must work or all stories will be grouped under news.google.com domain
   */
  private async resolveGoogleNewsRedirect(googleUrl: string): Promise<string> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout (increased)
      
      // Try GET request (some servers don't respond to HEAD properly)
      // We won't read the body, just get the final URL after redirects
      const response = await fetch(googleUrl, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      
      clearTimeout(timeout);
      
      // Check if we got redirected
      const resolvedUrl = response.url;
      
      if (resolvedUrl && resolvedUrl !== googleUrl && !resolvedUrl.includes('news.google.com')) {
        Logger.info(`✅ Successfully resolved Google News redirect`, { 
          original: googleUrl.substring(0, 80),
          resolved: resolvedUrl.substring(0, 80),
          domain: extractDomain(resolvedUrl)
        });
        return resolvedUrl;
      } else {
        Logger.warn(`⚠️ Redirect resolution returned Google URL or same URL`, { 
          original: googleUrl.substring(0, 80),
          resolved: resolvedUrl?.substring(0, 80),
          will_use: 'Fallback to Google URL - stories will be grouped under news.google.com'
        });
        return googleUrl;
      }
    } catch (error) {
      Logger.error(`❌ CRITICAL: Failed to resolve Google News redirect`, { 
        url: googleUrl.substring(0, 80),
        error: error instanceof Error ? error.message : 'Unknown error',
        impact: 'Story will be grouped under news.google.com domain, may be deduplicated incorrectly'
      });
      // If redirect resolution fails, return original URL as last resort
      return googleUrl;
    }
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
  
  private deduplicateStoriesWithTracking(stories: Story[]): { dedupedStories: Story[]; removedStories: Story[] } {
    // Group by domain+topic combination (not just domain!)
    // This allows same domain to provide stories for multiple topics
    const byDomainAndTopic = new Map<string, Story[]>();
    
    for (const story of stories) {
      // Key: "domain:topic" - e.g. "cnbc.com:Verizon"
      const key = `${story.domain}:${story.topic || 'General'}`;
      const existing = byDomainAndTopic.get(key) || [];
      existing.push(story);
      byDomainAndTopic.set(key, existing);
    }
    
    const deduplicated: Story[] = [];
    const removed: Story[] = [];
    const maxPerDomainPerTopic = Config.MAX_STORIES_PER_DOMAIN;
    
    for (const [key, domainTopicStories] of byDomainAndTopic.entries()) {
      // Sort by recency and take top N per domain+topic
      const sorted = domainTopicStories.sort(
        (a, b) => b.published_at.getTime() - a.published_at.getTime()
      );
      
      deduplicated.push(...sorted.slice(0, maxPerDomainPerTopic));
      removed.push(...sorted.slice(maxPerDomainPerTopic)); // Track removed stories
      
      if (sorted.length > maxPerDomainPerTopic) {
        Logger.debug(`${key}: kept ${maxPerDomainPerTopic} stories, removed ${sorted.length - maxPerDomainPerTopic}`);
      }
    }
    
    return { dedupedStories: deduplicated, removedStories: removed };
  }
  
  // Keep old method for backward compatibility
  private deduplicateStories(stories: Story[]): Story[] {
    return this.deduplicateStoriesWithTracking(stories).dedupedStories;
  }
}

