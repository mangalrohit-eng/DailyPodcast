/**
 * Configuration management for the podcast system
 */

import { TopicConfig, PodcastConfig } from './types';

export class Config {
  // OpenAI
  static OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  
  // Storage
  static STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'vercel-blob';
  static BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
  static S3_ENDPOINT = process.env.S3_ENDPOINT || '';
  static S3_BUCKET = process.env.S3_BUCKET || '';
  static S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || '';
  static S3_SECRET_KEY = process.env.S3_SECRET_KEY || '';
  static S3_REGION = process.env.S3_REGION || 'auto';
  
  // Podcast
  static PODCAST_BASE_URL = process.env.PODCAST_BASE_URL || 'http://localhost:3000';
  static PODCAST_TITLE = process.env.PODCAST_TITLE || "Rohit's Daily AI & Corporate News Brief";
  static PODCAST_DESCRIPTION = process.env.PODCAST_DESCRIPTION || 
    'Your personalized daily news brief. AI-generated narration powered by OpenAI.';
  static PODCAST_AUTHOR = process.env.PODCAST_AUTHOR || 'Rohit';
  static PODCAST_EMAIL = process.env.PODCAST_EMAIL || 'podcast@example.com';
  static PODCAST_LANGUAGE = process.env.PODCAST_LANGUAGE || 'en-us';
  static PODCAST_CATEGORY = process.env.PODCAST_CATEGORY || 'News';
  
  // Timezone
  static TIMEZONE = process.env.TIMEZONE || 'America/New_York';
  
  // Content
  static RUMOR_FILTER = process.env.RUMOR_FILTER !== 'false';
  static MIN_CONTENT_LENGTH = parseInt(process.env.MIN_CONTENT_LENGTH || '100', 10);
  static MAX_STORIES_PER_DOMAIN = parseInt(process.env.MAX_STORIES_PER_DOMAIN || '2', 10);
  
  // Operational
  static FORCE_OVERWRITE = process.env.FORCE_OVERWRITE === 'true';
  static WINDOW_HOURS = parseInt(process.env.WINDOW_HOURS || '72', 10);
  static TARGET_DURATION_SECONDS = parseInt(process.env.TARGET_DURATION_SECONDS || '900', 10);
  
  static parseTopicWeights(): Record<string, number> {
    const weightsStr = process.env.TOPIC_WEIGHTS || 'ai:0.5,vz:0.3,acn:0.2';
    const weights: Record<string, number> = {};
    weightsStr.split(',').forEach(pair => {
      const [key, val] = pair.split(':');
      if (key && val) {
        weights[key.trim()] = parseFloat(val.trim());
      }
    });
    return weights;
  }
  
  /**
   * This method is DEPRECATED and should not be used.
   * Topics should be loaded from ConfigStorage (dashboard settings) instead.
   * This is kept only as an emergency fallback.
   */
  static getTopicConfigs(): TopicConfig[] {
    // Return empty array - force loading from dashboard
    // If dashboard config doesn't exist, orchestrator will fail early with clear error
    return [];
  }
  
  static getPodcastConfig(): PodcastConfig {
    return {
      title: Config.PODCAST_TITLE,
      description: Config.PODCAST_DESCRIPTION,
      author: Config.PODCAST_AUTHOR,
      email: Config.PODCAST_EMAIL,
      language: Config.PODCAST_LANGUAGE,
      category: Config.PODCAST_CATEGORY,
      base_url: Config.PODCAST_BASE_URL,
    };
  }
}

