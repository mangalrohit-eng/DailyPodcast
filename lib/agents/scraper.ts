/**
 * ScraperAgent - Fetches full article content from URLs
 * 
 * Takes ranked stories and enriches them with full article text,
 * enabling more detailed and "meaty" podcast scripts.
 * 
 * Uses Puppeteer to resolve Google News URLs to actual article URLs.
 */

import { BaseAgent } from './base';
import { Story, Pick } from '../types';
import { Logger } from '../utils';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Node 18+ has fetch built-in globally (no import needed)

export interface ScraperInput {
  picks: Pick[];
}

export interface ScraperOutput {
  enriched_picks: Pick[];
  scraping_report: {
    total_articles: number;
    successful_scrapes: number;
    failed_scrapes: Array<{ url: string; reason: string }>;
    avg_content_length: number;
    all_scrape_attempts: Array<{
      title: string;
      topic: string;
      article_url: string;
      rss_source_url: string;
      status: 'success' | 'failed';
      content_length?: number;
      reason?: string;
    }>;
  };
}

export class ScraperAgent extends BaseAgent<ScraperInput, ScraperOutput> {
  private browser: puppeteer.Browser | null = null;
  
  constructor() {
    super({
      name: 'ScraperAgent',
      systemPrompt: `You are a web scraping agent that enriches stories with full article content.`,
      retries: 1, // Don't retry too much - some sites will always block
    });
    
    // Add stealth plugin to avoid detection
    puppeteer.use(StealthPlugin());
  }
  
  /**
   * Launch Puppeteer browser instance (reused across all scrapes)
   */
  private async launchBrowser(): Promise<any> {
    if (!this.browser) {
      Logger.info('Launching Puppeteer browser with stealth mode for URL resolution');
      
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage', // Overcome limited resource problems
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }
  
  /**
   * Close browser instance
   */
  private async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      Logger.debug('Puppeteer browser closed');
    }
  }
  
  /**
   * Check if URL is a Google News URL that needs resolution
   */
  private isGoogleNewsUrl(url: string): boolean {
    return url.includes('news.google.com/rss/articles/');
  }
  
  /**
   * Resolve Google News URL to actual article URL using Puppeteer
   */
  private async resolveGoogleNewsUrl(googleNewsUrl: string): Promise<string> {
    const browser = await this.launchBrowser();
    let page: any = null;
    
    try {
      page = await browser.newPage();
      
      // Set realistic viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Set realistic user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Intercept navigation to capture redirects (HTML documents only)
      let redirectedUrl: string | null = null;
      
      page.on('response', async (response: any) => {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // Only capture HTML documents, not CSS/JS/images
        if (!url.includes('news.google.com') && 
            !url.includes('googleapis.com') &&
            !url.includes('googleusercontent.com') &&
            !url.includes('gstatic.com') &&
            contentType.includes('text/html') &&
            (url.startsWith('http://') || url.startsWith('https://'))) {
          if (!redirectedUrl) {
            redirectedUrl = url;
            Logger.debug(`📍 Captured HTML redirect to: ${url.substring(0, 60)}...`);
          }
        }
      });
      
      // Navigate to Google News URL
      await page.goto(googleNewsUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 8000 
      });
      
      // Give time for JavaScript redirects
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Check if URL changed
      const finalUrl = page.url();
      
      // If we captured a redirect during navigation, use that
      if (redirectedUrl && !redirectedUrl.includes('news.google.com')) {
        Logger.debug(`✅ Resolved Google News URL via redirect capture`, {
          original: googleNewsUrl.substring(0, 60),
          resolved: redirectedUrl.substring(0, 60),
        });
        return redirectedUrl;
      }
      
      // If page URL changed and it's not Google News, use that
      if (!finalUrl.includes('news.google.com')) {
        Logger.debug(`✅ Resolved Google News URL via page navigation`, {
          original: googleNewsUrl.substring(0, 60),
          resolved: finalUrl.substring(0, 60),
        });
        return finalUrl;
      }
      
      // Last resort: Try to find article link in the page
      try {
        const articleLink = await page.evaluate(() => {
          // Look for main article link
          const link = document.querySelector('a[href*="http"]') as HTMLAnchorElement;
          return link ? link.href : null;
        });
        
        if (articleLink && !articleLink.includes('news.google.com')) {
          Logger.debug(`✅ Resolved Google News URL via link extraction`, {
            original: googleNewsUrl.substring(0, 60),
            resolved: articleLink.substring(0, 60),
          });
          return articleLink;
        }
      } catch (evalError) {
        Logger.debug('Failed to extract link from page', { error: evalError });
      }
      
      throw new Error('Failed to resolve - stayed on Google News');
    } catch (error) {
      throw new Error(`Failed to resolve Google News URL: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      // Always close page in finally block
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (closeError) {
          Logger.warn('Failed to close page', { error: closeError });
        }
      }
    }
  }

  protected async process(input: ScraperInput): Promise<ScraperOutput> {
    const { picks } = input;
    
    Logger.info('Starting article scraping', { total_articles: picks.length });
    
    try {
      const enrichedPicks: Pick[] = [];
      const failedScrapes: Array<{ url: string; reason: string }> = [];
      const allScrapeAttempts: Array<{
        title: string;
        topic: string;
        article_url: string;
        rss_source_url: string;
        status: 'success' | 'failed';
        content_length?: number;
        reason?: string;
      }> = [];
      let totalContentLength = 0;
      let successfulScrapes = 0;

      // Scrape each article sequentially
      for (const pick of picks) {
        try {
          const enrichedStory = await this.scrapeArticle(pick.story);
          
          if (enrichedStory.raw && enrichedStory.raw.length > 500) {
            // Successfully scraped meaningful content
            enrichedPicks.push({ ...pick, story: enrichedStory });
            totalContentLength += enrichedStory.raw.length;
            successfulScrapes++;
            allScrapeAttempts.push({
              title: pick.story.title,
              topic: pick.story.topic || 'General',
              article_url: enrichedStory.url, // Use resolved URL
              rss_source_url: pick.story.canonical || pick.story.url,
              status: 'success',
              content_length: enrichedStory.raw.length,
            });
            Logger.debug(`✅ Scraped ${enrichedStory.title.substring(0, 50)}...`, {
              content_length: enrichedStory.raw.length,
            });
          } else {
            // Failed or insufficient content - keep original summary
            enrichedPicks.push(pick);
            const reason = 'Content too short or empty';
            failedScrapes.push({
              url: pick.story.url,
              reason,
            });
            allScrapeAttempts.push({
              title: pick.story.title,
              topic: pick.story.topic || 'General',
              article_url: pick.story.url,
              rss_source_url: pick.story.canonical || pick.story.url,
              status: 'failed',
              reason,
            });
            Logger.debug(`⚠️ Insufficient content for ${pick.story.title.substring(0, 50)}...`);
          }
        } catch (error) {
          // Keep original pick with summary only
          enrichedPicks.push(pick);
          const reason = error instanceof Error ? error.message : String(error);
          failedScrapes.push({
            url: pick.story.url,
            reason,
          });
          allScrapeAttempts.push({
            title: pick.story.title,
            topic: pick.story.topic || 'General',
            article_url: pick.story.url,
            rss_source_url: pick.story.canonical || pick.story.url,
            status: 'failed',
            reason,
          });
          Logger.warn(`❌ Failed to scrape ${pick.story.url}`, { error: reason });
        }
      }

      const avgContentLength = successfulScrapes > 0 
        ? Math.round(totalContentLength / successfulScrapes)
        : 0;

      Logger.info('Scraping completed', {
        successful: successfulScrapes,
        failed: failedScrapes.length,
        avg_content_length: avgContentLength,
      });

      return {
        enriched_picks: enrichedPicks,
        scraping_report: {
          total_articles: picks.length,
          successful_scrapes: successfulScrapes,
          failed_scrapes: failedScrapes,
          avg_content_length: avgContentLength,
          all_scrape_attempts: allScrapeAttempts,
        },
      };
    } finally {
      // Always close browser
      await this.closeBrowser();
    }
  }

  /**
   * Scrape a single article and extract main content
   * Resolves Google News URLs first using Puppeteer
   */
  private async scrapeArticle(story: Story): Promise<Story> {
    let articleUrl = story.url;
    
    // Resolve Google News URL first if needed
    if (this.isGoogleNewsUrl(story.url)) {
      Logger.debug(`🔄 Resolving Google News URL for: ${story.title.substring(0, 50)}...`);
      articleUrl = await this.resolveGoogleNewsUrl(story.url);
    }
    
    try {
      // Fetch HTML with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(articleUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0; +https://daily-podcast.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow', // Follow any redirects
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      
      // Extract main content using simple heuristics
      const content = this.extractMainContent(html);

      Logger.debug(`✅ Scraped article`, {
        url: articleUrl.substring(0, 60),
        content_length: content.length
      });

      return {
        ...story,
        url: articleUrl, // Update with resolved URL
        raw: content,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Scrape failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Extract main article content from HTML using simple heuristics
   * This is a lightweight approach without external dependencies
   */
  private extractMainContent(html: string): string {
    // Remove script and style tags
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Try to find main content areas (common patterns)
    const contentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*class="[^"]*(?:article|post|content|entry|story)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="[^"]*(?:article|post|content|entry|story)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of contentPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        text = match[1];
        break;
      }
    }

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .trim();

    // Take first ~5000 chars (enough for context, not too much)
    if (text.length > 5000) {
      text = text.substring(0, 5000) + '...';
    }

    return text;
  }
}

