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
    google_news_domain_extraction?: {
      attempted: number;
      successful: number;
      failed: number;
      success_rate: string;
    };
    all_stories_detailed: Array<{ 
      title: string; 
      topic: string; 
      url: string;
      domain: string;
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
    const allStoriesDetailed: Array<{ title: string; topic: string; url: string; domain: string; published_at: string; status: 'accepted' | 'rejected'; reason?: string }> = [];
    
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
                domain: story.domain,
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
                domain: story.domain,
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
                domain: story.domain,
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
                domain: story.domain,
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
              domain: story.domain,
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
          domain: story.domain,
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
      google_news_domain_extraction: {
        attempted: googleNewsRedirectsAttempted,
        successful: googleNewsRedirectsSuccessful,
        failed: googleNewsRedirectsFailed,
        success_rate: googleNewsRedirectsAttempted > 0 
          ? `${((googleNewsRedirectsSuccessful / googleNewsRedirectsAttempted) * 100).toFixed(1)}%`
          : 'N/A',
        method: 'Base64 URL decoding (no HTTP requests)'
      }
    });
    
    // CRITICAL WARNING if domain extraction is failing
    if (googleNewsRedirectsFailed > 0) {
      Logger.warn(`⚠️ WARNING: ${googleNewsRedirectsFailed} Google News URLs failed to decode!`, {
        impact: 'Stories will be grouped under news.google.com domain',
        consequence: 'Deduplication will treat all Google News stories as same domain',
        action_needed: 'Check base64 decoding logs above'
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
        google_news_domain_extraction: {
          attempted: googleNewsRedirectsAttempted,
          successful: googleNewsRedirectsSuccessful,
          failed: googleNewsRedirectsFailed,
          success_rate: googleNewsRedirectsAttempted > 0 
            ? `${((googleNewsRedirectsSuccessful / googleNewsRedirectsAttempted) * 100).toFixed(1)}%`
            : 'N/A'
        },
        all_stories_detailed: allStoriesDetailed,
      },
    };
  }
  
  private async normalizeItem(item: FeedItem, topic: string, tracking?: { attempted: number; successful: number; failed: number }): Promise<Story | null> {
    if (!item.link || !item.title) {
      return null;
    }
    
    // Extract BOTH actual URL and domain from Google News URLs by decoding the base64-encoded URL
    const isGoogleNewsUrl = item.link.includes('news.google.com/rss/articles/');
    let storyUrl: string;
    let domain: string;
    
    if (isGoogleNewsUrl) {
      // ALWAYS extract for Google News URLs (tracking is optional)
      if (tracking) {
        tracking.attempted++;
      }
      
      const extracted = this.extractFromGoogleNewsUrl(item.link);
      
      if (extracted) {
        storyUrl = extracted.url;  // Use actual article URL for scraping!
        domain = extracted.domain;
        if (tracking) {
          tracking.successful++;
        }
        Logger.debug(`✅ Decoded Google News URL`, { 
          original: item.link.substring(0, 60),
          actual_url: storyUrl.substring(0, 60),
          domain: domain
        });
      } else {
        // Fallback to Google News URL if decoding fails
        storyUrl = item.link;
        domain = extractDomain(item.link);
        if (tracking) {
          tracking.failed++;
        }
        Logger.warn(`⚠️ Failed to decode Google News URL, using fallback`, { 
          url: item.link.substring(0, 60),
          fallback_domain: domain
        });
      }
    } else {
      // Non-Google News URLs: use as-is
      storyUrl = item.link;
      domain = extractDomain(item.link);
    }
    
    const pubDate = item.pubDate || new Date();
    
    const story: Story = {
      id: Crypto.sha256(storyUrl).substring(0, 16),
      url: storyUrl, // Use actual article URL (decoded from Google News or direct)
      title: cleanText(item.title),
      source: domain,
      published_at: pubDate,
      summary: item.contentSnippet ? cleanText(item.contentSnippet) : undefined,
      raw: item.content,
      canonical: item.link, // Keep original RSS link for reference
      domain, // Use decoded domain for deduplication
      topic,
    };
    
    return story;
  }
  
  /**
   * Extract actual article URL and domain from a Google News RSS URL by decoding the base64-encoded URL.
   * Google News RSS URLs contain the actual article URL encoded in the path.
   * This is MUCH more reliable than following HTTP redirects!
   * Returns both the full article URL (for scraping) and the domain (for deduplication).
   */
  private extractFromGoogleNewsUrl(googleNewsUrl: string): { url: string; domain: string } | null {
    try {
      const url = new URL(googleNewsUrl);
      const parts = url.pathname.split('/');
      
      // Check if the URL structure matches: /rss/articles/[encoded_string]
      const articlesIndex = parts.indexOf('articles');
      if (url.hostname !== 'news.google.com' || articlesIndex === -1 || articlesIndex + 1 >= parts.length) {
        Logger.warn(`⚠️ Not a Google News RSS article URL`, { 
          url: googleNewsUrl.substring(0, 80),
          hostname: url.hostname,
          has_articles: parts.includes('articles')
        });
        return null;
      }
      
      let encodedUrl = parts[articlesIndex + 1];
      const originalEncoded = encodedUrl;
      
      // Extract Base64 String: Remove prefixes like 'CBM', 'CBMi', 'CBA', etc.
      // Common patterns: CBM, CBMi, CBAi, CBAU, etc.
      encodedUrl = encodedUrl.replace(/^[A-Z]{2,4}[a-z]?/, '');
      
      Logger.debug(`🔍 Decoding Google News URL`, {
        original_encoded: originalEncoded.substring(0, 40),
        after_prefix_removal: encodedUrl.substring(0, 40),
        prefix_removed: originalEncoded.substring(0, originalEncoded.length - encodedUrl.length)
      });
      
      // Fix Base64 Padding: Add '=' characters to make length a multiple of 4
      while (encodedUrl.length % 4 !== 0) {
        encodedUrl += '=';
      }
      
      // Base64 URL-Safe Decode
      const decodedBuffer = Buffer.from(encodedUrl, 'base64url');
      const decodedString = decodedBuffer.toString('utf8');
      
      Logger.debug(`🔍 Decoded string preview`, {
        decoded_length: decodedString.length,
        first_100_chars: decodedString.substring(0, 100)
      });
      
      // Extract Actual URL: Look for http/https URL in the decoded string
      const urlMatch = decodedString.match(/(https?:\/\/[^\s\x00-\x1f\x7f]+)/);
      
      if (urlMatch && urlMatch[0]) {
        const actualUrl = urlMatch[0];
        const hostname = new URL(actualUrl).hostname;
        
        // Strip 'www.' for cleaner domain
        const cleanDomain = hostname.startsWith('www.') ? hostname.substring(4) : hostname;
        
        Logger.info(`✅ Successfully decoded Google News URL`, { 
          original: googleNewsUrl.substring(0, 60),
          actual_url: actualUrl.substring(0, 60),
          domain: cleanDomain
        });
        
        return { url: actualUrl, domain: cleanDomain };
      }
      
      Logger.warn(`⚠️ Could not extract URL from decoded string`, {
        decoded_preview: decodedString.substring(0, 200)
      });
      return null;
    } catch (error) {
      Logger.error(`❌ Failed to decode Google News URL`, { 
        url: googleNewsUrl.substring(0, 80),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
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

