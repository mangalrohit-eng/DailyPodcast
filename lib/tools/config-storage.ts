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
  
  // Audio branding
  intro_music_file?: string;  // S3 path or URL to intro music (e.g., 'music/intro.mp3')
  outro_music_file?: string;  // S3 path or URL to outro music (e.g., 'music/outro.mp3')
  use_intro_music?: boolean;
  use_outro_music?: boolean;
  podcast_base_url: string;
  
  // Operational
  window_hours: number;
  target_duration_sec: number;
  force_overwrite: boolean;
  
  // Podcast Production Settings
  podcast_production: {
    intro_text: string; // Template for intro
    outro_text: string; // Template for outro
    enable_intro_music: boolean;
    enable_outro_music: boolean;
    intro_music_duration_ms: number;
    outro_music_duration_ms: number;
    pause_after_intro_ms: number;
    pause_between_stories_ms: number;
    pause_before_outro_ms: number;
    num_stories_min: number;
    num_stories_max: number;
    style: 'executive' | 'casual' | 'technical'; // Tone/style
  };
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
        // Empty by default - user must configure topics in dashboard
        // Example topic structure:
        // {
        //   label: 'Your Topic Name',
        //   weight: 1.0,
        //   sources: [
        //     'https://example.com/rss',
        //     'https://news.google.com/rss/search?q=YourTopic',
        //   ],
        //   keywords: ['keyword1', 'keyword2', 'keyword3'],
        // },
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
        'Your personalized daily news brief. AI-generated narration powered by OpenAI.',
      podcast_author: process.env.PODCAST_AUTHOR || 'Rohit',
      podcast_email: process.env.PODCAST_EMAIL || 'podcast@example.com',
      podcast_language: process.env.PODCAST_LANGUAGE || 'en-us',
      podcast_category: process.env.PODCAST_CATEGORY || 'News',
      podcast_base_url: process.env.PODCAST_BASE_URL || 'http://localhost:3000',
      
      // Audio branding defaults
      intro_music_file: process.env.INTRO_MUSIC_FILE || 'music/intro.mp3',
      outro_music_file: process.env.OUTRO_MUSIC_FILE || 'music/outro.mp3',
      use_intro_music: process.env.USE_INTRO_MUSIC !== 'false', // Default true
      use_outro_music: process.env.USE_OUTRO_MUSIC !== 'false', // Default true
      
      window_hours: parseInt(process.env.WINDOW_HOURS || '36', 10),
      target_duration_sec: parseInt(process.env.TARGET_DURATION_SECONDS || '900', 10),
      force_overwrite: process.env.FORCE_OVERWRITE === 'true',
      
      podcast_production: {
        intro_text: 'This is your daily podcast to recap recent news. Today we\'ll cover:',
        outro_text: 'That\'s your executive brief. Stay informed, stay ahead.',
        enable_intro_music: true,
        enable_outro_music: true,
        intro_music_duration_ms: 3000,
        outro_music_duration_ms: 2000,
        pause_after_intro_ms: 800,
        pause_between_stories_ms: 1200,
        pause_before_outro_ms: 500,
        num_stories_min: 3,
        num_stories_max: 5,
        style: 'executive',
      },
    };
  }
}

