/**
 * ScraperAgent - Fetches full article content from URLs
 * 
 * Takes ranked stories and enriches them with full article text,
 * enabling more detailed and "meaty" podcast scripts.
 */

import { BaseAgent } from './base';
import { Story, Pick } from '../types';
import { Logger } from '../utils';
import fetch from 'node-fetch';

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
  };
}

export class ScraperAgent extends BaseAgent<ScraperInput, ScraperOutput> {
  constructor() {
    super({
      name: 'ScraperAgent',
      systemPrompt: `You are a web scraping agent that enriches stories with full article content.`,
      retries: 1, // Don't retry too much - some sites will always block
    });
  }

  protected async process(input: ScraperInput): Promise<ScraperOutput> {
    const { picks } = input;
    
    Logger.info('Starting article scraping', { total_articles: picks.length });
    
    const enrichedPicks: Pick[] = [];
    const failedScrapes: Array<{ url: string; reason: string }> = [];
    let totalContentLength = 0;
    let successfulScrapes = 0;

    // Scrape each article in parallel (with limits)
    const scrapePromises = picks.map(pick => 
      this.scrapeArticle(pick.story)
        .then(enrichedStory => {
          if (enrichedStory.raw && enrichedStory.raw.length > 500) {
            // Successfully scraped meaningful content
            enrichedPicks.push({ ...pick, story: enrichedStory });
            totalContentLength += enrichedStory.raw.length;
            successfulScrapes++;
            Logger.debug(`✅ Scraped ${enrichedStory.title.substring(0, 50)}...`, {
              content_length: enrichedStory.raw.length,
            });
          } else {
            // Failed or insufficient content - keep original summary
            enrichedPicks.push(pick);
            failedScrapes.push({
              url: pick.story.url,
              reason: 'Content too short or empty',
            });
            Logger.debug(`⚠️ Insufficient content for ${pick.story.title.substring(0, 50)}...`);
          }
        })
        .catch(error => {
          // Keep original pick with summary only
          enrichedPicks.push(pick);
          failedScrapes.push({
            url: pick.story.url,
            reason: error.message,
          });
          Logger.warn(`❌ Failed to scrape ${pick.story.url}`, { error: error.message });
        })
    );

    await Promise.all(scrapePromises);

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
      },
    };
  }

  /**
   * Scrape a single article and extract main content
   */
  private async scrapeArticle(story: Story): Promise<Story> {
    try {
      // Fetch HTML with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(story.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PodcastBot/1.0; +https://daily-podcast.vercel.app)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      
      // Extract main content using simple heuristics
      const content = this.extractMainContent(html);

      return {
        ...story,
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

