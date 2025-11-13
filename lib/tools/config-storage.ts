/**
 * Configuration Storage - Persists dashboard settings
 */

import { StorageTool } from './storage';
import { Logger } from '../utils';

export interface DashboardConfig {
  version: number;
  updated_at: string;
  updated_by: string;
  
  // Topics
  topics: Array<{
    label: string;
    weight: number;
    sources?: string[];
    keywords?: string[];
  }>;
  
  // Schedule
  timezone: string;
  cron_schedule: string; // Read-only from vercel.json
  
  // Content filters
  rumor_filter: boolean;
  banned_domains: string[];
  min_content_length: number;
  max_stories_per_domain: number;
  
  // Voice & Style
  voices: {
    host: string;
    analyst: string;
    stinger: string;
  };
  pronunciation_glossary: Record<string, string>;
  
  // Podcast metadata
  podcast_title: string;
  podcast_description: string;
  podcast_author: string;
  podcast_email: string;
  podcast_language: string;
  podcast_category: string;
  podcast_base_url: string;
  
  // Operational
  window_hours: number;
  target_duration_sec: number;
  force_overwrite: boolean;
}

export class ConfigStorage {
  private storage: StorageTool;
  private configPath = 'config/config.json';
  
  constructor() {
    this.storage = new StorageTool();
  }
  
  /**
   * Load current configuration
   */
  async load(): Promise<DashboardConfig> {
    try {
      const exists = await this.storage.exists(this.configPath);
      
      if (!exists) {
        // Return default config
        return this.getDefaultConfig();
      }
      
      const data = await this.storage.get(this.configPath);
      const config = JSON.parse(data.toString('utf-8'));
      
      Logger.debug('Config loaded', { version: config.version });
      
      return config;
    } catch (error) {
      Logger.warn('Failed to load config, using defaults', {
        error: (error as Error).message,
      });
      return this.getDefaultConfig();
    }
  }
  
  /**
   * Save configuration
   */
  async save(config: DashboardConfig, user: string = 'system'): Promise<DashboardConfig> {
    // Validate config
    this.validate(config);
    
    // Increment version and update metadata
    config.version = (config.version || 0) + 1;
    config.updated_at = new Date().toISOString();
    config.updated_by = user;
    
    // Normalize topic weights
    config.topics = this.normalizeWeights(config.topics);
    
    // Save to storage
    await this.storage.put(
      this.configPath,
      JSON.stringify(config, null, 2),
      'application/json'
    );
    
    Logger.info('Config saved', {
      version: config.version,
      user,
    });
    
    return config;
  }
  
  /**
   * Validate configuration
   */
  private validate(config: DashboardConfig): void {
    // Check topics
    if (!config.topics || config.topics.length === 0) {
      throw new Error('At least one topic is required');
    }
    
    // Check for duplicate labels
    const labels = config.topics.map(t => t.label.toLowerCase());
    const uniqueLabels = new Set(labels);
    if (labels.length !== uniqueLabels.size) {
      throw new Error('Duplicate topic labels found');
    }
    
    // Check weights sum to 1.0 (±0.001)
    const totalWeight = config.topics.reduce((sum, t) => sum + t.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      throw new Error(`Topic weights must sum to 1.0 (currently ${totalWeight.toFixed(3)})`);
    }
    
    // Check weight bounds
    for (const topic of config.topics) {
      if (topic.weight < 0 || topic.weight > 1) {
        throw new Error(`Topic "${topic.label}" has invalid weight: ${topic.weight}`);
      }
    }
    
    // Validate timezone
    if (!config.timezone) {
      throw new Error('Timezone is required');
    }
    
    // Validate base URL
    if (!config.podcast_base_url || !config.podcast_base_url.startsWith('http')) {
      throw new Error('Invalid podcast base URL');
    }
  }
  
  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(topics: Array<{ label: string; weight: number }>): Array<{ label: string; weight: number }> {
    const totalWeight = topics.reduce((sum, t) => sum + t.weight, 0);
    
    if (totalWeight === 0) {
      // Equal weights
      const equalWeight = 1.0 / topics.length;
      return topics.map(t => ({ ...t, weight: equalWeight }));
    }
    
    // Normalize
    return topics.map(t => ({
      ...t,
      weight: t.weight / totalWeight,
    }));
  }
  
  /**
   * Get default configuration
   */
  private getDefaultConfig(): DashboardConfig {
    return {
      version: 0,
      updated_at: new Date().toISOString(),
      updated_by: 'system',
      
      topics: [
        {
          label: 'AI',
          weight: 0.5,
          sources: [
            'https://openai.com/blog/rss.xml',
            'https://blog.google/technology/ai/rss/',
            'https://www.anthropic.com/news/rss.xml',
            'https://ai.meta.com/blog/rss/',
            'https://news.google.com/rss/search?q=artificial+intelligence+OR+machine+learning+OR+AI&hl=en-US&gl=US&ceid=US:en',
          ],
          keywords: ['AI', 'artificial intelligence', 'machine learning', 'deep learning', 'LLM', 'ChatGPT', 'GPT', 'neural network'],
        },
        {
          label: 'Verizon',
          weight: 0.3,
          sources: [
            'https://www.verizon.com/about/rss/news',
            'https://news.google.com/rss/search?q=Verizon&hl=en-US&gl=US&ceid=US:en',
          ],
          keywords: ['Verizon', 'VZ', 'telecom', '5G', 'wireless', 'fiber'],
        },
        {
          label: 'Accenture',
          weight: 0.2,
          sources: [
            'https://newsroom.accenture.com/news/rss.xml',
            'https://news.google.com/rss/search?q=Accenture&hl=en-US&gl=US&ceid=US:en',
          ],
          keywords: ['Accenture', 'ACN', 'consulting', 'digital transformation'],
        },
      ],
      
      timezone: process.env.TIMEZONE || 'America/New_York',
      cron_schedule: '0 12 * * *', // 12:00 UTC daily
      
      rumor_filter: process.env.RUMOR_FILTER !== 'false',
      banned_domains: [],
      min_content_length: parseInt(process.env.MIN_CONTENT_LENGTH || '100', 10),
      max_stories_per_domain: parseInt(process.env.MAX_STORIES_PER_DOMAIN || '2', 10),
      
      voices: {
        host: 'alloy',
        analyst: 'nova',
        stinger: 'shimmer',
      },
      pronunciation_glossary: {
        'AI': 'A I',
        'GPT': 'G P T',
        'ML': 'M L',
      },
      
      podcast_title: process.env.PODCAST_TITLE || "Rohit's Daily AI & Corporate News Brief",
      podcast_description: process.env.PODCAST_DESCRIPTION || 
        'Your personalized 15-minute morning brief on AI, Verizon, and Accenture news. AI-generated narration powered by OpenAI.',
      podcast_author: process.env.PODCAST_AUTHOR || 'Rohit',
      podcast_email: process.env.PODCAST_EMAIL || 'podcast@example.com',
      podcast_language: process.env.PODCAST_LANGUAGE || 'en-us',
      podcast_category: process.env.PODCAST_CATEGORY || 'News',
      podcast_base_url: process.env.PODCAST_BASE_URL || 'http://localhost:3000',
      
      window_hours: parseInt(process.env.WINDOW_HOURS || '36', 10),
      target_duration_sec: parseInt(process.env.TARGET_DURATION_SECONDS || '900', 10),
      force_overwrite: process.env.FORCE_OVERWRITE === 'true',
    };
  }
}

