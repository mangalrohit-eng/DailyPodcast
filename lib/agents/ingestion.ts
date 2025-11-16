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
              // Logger.debug(`Story too old: ${story.title.substring(0, 50)}... (${story.published_at.toISOString()}, ${hoursOld}hrs old)`); // DISABLED: Too verbose
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
              // Logger.debug(`Story failed quality filter: ${story.title.substring(0, 50)}...`); // DISABLED: Too verbose
              continue;
            }
            
            // Filter by source tier - only allow Tier 1, 2, and 4
            const sourceTier = this.getSourceTier(story.domain);
            if (sourceTier === 3 || sourceTier === 5) {
              const tierName = sourceTier === 3 ? 'Tier 3 (Medium Authority)' : 'Tier 5 (Unknown Source)';
              const reason = `Source filtered out: ${tierName} - ${story.domain}`;
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
              // Logger.debug(`Story filtered by tier: ${story.title.substring(0, 50)}... (${tierName}: ${story.domain})`); // DISABLED: Too verbose
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
              // Logger.debug(`Story doesn't match topic keywords: ${story.title.substring(0, 50)}...`, { keywords: topic.keywords.slice(0, 3) }); // DISABLED: Too verbose
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
            // Logger.debug(`✓ Story accepted for ${topic.name}: ${story.title.substring(0, 60)}...`); // DISABLED: Too verbose
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
    
    // DEBUG: Log first few URLs to see format
    if (tracking && tracking.attempted === 0 && item.link.includes('news.google.com')) {
      Logger.info(`🔍 FIRST Google News URL encountered`, {
        full_url: item.link,
        matches_pattern: isGoogleNewsUrl,
        title: item.title
      });
    }
    
    let storyUrl: string;
    let domain: string;
    
    if (isGoogleNewsUrl) {
      // Extract source from title (Google News titles have format: "Title - Source")
      if (tracking) {
        tracking.attempted++;
      }
      
      const extractedSource = this.extractSourceFromTitle(item.title);
      
      if (extractedSource) {
        storyUrl = item.link;  // Keep Google News URL for now
        domain = extractedSource;
        if (tracking) {
          tracking.successful++;
        }
        // Logger.debug(`✅ Extracted source from title`, { title: item.title.substring(0, 60), domain: domain }); // DISABLED: Too verbose
      } else {
        // Fallback to news.google.com if title extraction fails
        storyUrl = item.link;
        domain = 'news.google.com';
        if (tracking) {
          tracking.failed++;
        }
        Logger.debug(`⚠️ Could not extract source from title, using fallback`, { 
          title: item.title.substring(0, 60),
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
   * Extract source domain from a Google News story title.
   * Google News RSS titles have format: "Story Title - Source Name"
   * This is instant and much more reliable than HTTP redirects or base64 decoding.
   * 
   * @param title The story title
   * @returns The source domain or null if not extractable
   */
  private extractSourceFromTitle(title: string): string | null {
    try {
      // Find the last occurrence of " - " in the title
      const lastDashIndex = title.lastIndexOf(' - ');
      
      if (lastDashIndex === -1) {
        return null;
      }
      
      // Extract everything after the last dash
      const source = title.substring(lastDashIndex + 3).trim();
      
      if (!source) {
        return null;
      }
      
      // Clean up the source:
      // 1. Convert to lowercase
      // 2. Remove "www." prefix if present
      let domain = source.toLowerCase();
      
      if (domain.startsWith('www.')) {
        domain = domain.substring(4);
      }
      
      return domain;
      
    } catch (error) {
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
  
  /**
   * Check source authority tier (1-5)
   * Returns tier number: 1 = highest authority, 5 = unknown/lowest
   */
  private getSourceTier(domain: string): number {
    const domainLower = domain.toLowerCase();
    
    // TIER 1: Highest Authority - Major news organizations & wire services
    const tier1 = [
      // Wire services
      'reuters.com', 'apnews.com', 'associated press',
      // Major US newspapers
      'wsj.com', 'wall street journal', 'nytimes.com', 'new york times', 
      'washingtonpost.com', 'washington post', 'usatoday',
      // Major international newspapers
      'ft.com', 'financial times', 'economist.com', 'bbc.com', 'theguardian.com',
      // Major US news networks
      'cnbc.com', 'cnn.com', 'abcnews.go.com', 'cbsnews.com', 'nbcnews.com',
      'foxnews.com', 'fox news', 'msnbc.com',
      // Public broadcasting
      'npr.org', 'pbs.org',
    ];
    if (tier1.some(auth => domainLower.includes(auth))) return 1;
    
    // TIER 2: High Authority - Business news, tech publications & major digital media
    const tier2 = [
      // Business & finance news
      'bloomberg.com', 'forbes.com', 'fortune.com', 'businessinsider.com', 
      'marketwatch.com', 'barrons.com', 'investopedia.com', 'fool.com',
      'seekingalpha.com', 'morningstar.com', 'benzinga.com',
      'yahoo', 'msn', 'money.cnn', // Aggregators that credit sources
      // Tech publications
      'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
      'venturebeat.com', 'zdnet.com', 'cnet.com', 'engadget.com',
      'theregister.com', 'computerworld.com', 'infoworld.com',
      'technologyreview.com', 'mit technology review',
      // Major magazines
      'newsweek.com', 'time.com', 'theatlantic.com', 'newyorker.com',
      'vanityfair.com', 'gq.com', 'vogue.com',
      // Digital-first quality journalism
      'vox.com', 'slate.com', 'salon.com', 'huffpost.com', 'buzzfeed news',
      'propublica.org', 'theintercept.com',
    ];
    if (tier2.some(auth => domainLower.includes(auth))) return 2;
    
    // TIER 3: Medium Authority - Regional news, industry publications & credible blogs
    const tier3 = [
      // Political news
      'axios.com', 'politico.com', 'thehill.com', 'rollcall.com', 'washingtonexaminer.com',
      // Major regional newspapers
      'latimes.com', 'chicagotribune.com', 'sfgate.com', 'mercurynews.com',
      'boston.com', 'bostonglobe.com', 'philly.com', 'dallasnews.com',
      'seattletimes.com', 'denverpost.com', 'star-telegram.com',
      'ajc.com', 'cleveland.com', 'oregonlive.com',
      // Industry trade publications
      'industryweek.com', 'manufacturing.net', 'sdxcentral.com',
      'channele2e.com', 'crn.com', 'theregister.com',
      'adweek.com', 'mediapost.com', 'digiday.com',
      // Fintech & payments
      'pymnts.com', 'finextra.com', 'fintechfutures.com',
      // Press release aggregators (lower quality but credited)
      'pr newswire', 'business wire', 'globe newswire', 'accesswire',
      // International regional
      'americanbazaar', 'scmp.com', 'japantimes', 'straitstimes',
    ];
    if (tier3.some(auth => domainLower.includes(auth))) return 3;
    
    // TIER 4: Company/Corporate Sources - Official company announcements & blogs
    const tier4 = [
      // Tech giants
      'microsoft.com', 'google.com', 'meta.com', 'apple.com', 'amazon.com',
      'openai.com', 'anthropic.com', 'deepmind.com',
      // Hardware & semiconductors
      'nvidia.com', 'intel.com', 'amd.com', 'arm.com', 'tsmc.com',
      'qualcomm.com', 'broadcom.com',
      // Enterprise software
      'ibm.com', 'oracle.com', 'salesforce.com', 'sap.com', 'servicenow.com',
      'workday.com', 'adobe.com', 'autodesk.com',
      // Telecom
      'verizon.com', 't-mobile.com', 'att.com', 'sprint.com', 'vodafone.com',
      // Consulting & services
      'accenture.com', 'deloitte.com', 'pwc.com', 'ey.com', 'kpmg.com',
      'mckinsey.com', 'bcg.com', 'bain.com',
      // Cloud providers
      'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com',
      // Social media companies
      'twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com',
    ];
    if (tier4.some(auth => domainLower.includes(auth))) return 4;
    
    // Google News aggregator
    if (domainLower.includes('news.google.com')) return 4; // Allow Google News
    
    // TIER 5: Unknown/Lower Authority - Default
    return 5;
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

