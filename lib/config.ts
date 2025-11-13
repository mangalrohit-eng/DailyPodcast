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
    'Your personalized 15-minute morning brief on AI, Verizon, and Accenture news. AI-generated narration powered by OpenAI.';
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
  static WINDOW_HOURS = parseInt(process.env.WINDOW_HOURS || '36', 10);
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
  
  static getTopicConfigs(): TopicConfig[] {
    return [
      {
        name: 'AI',
        weight: Config.parseTopicWeights()['ai'] || 0.5,
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
        name: 'Verizon',
        weight: Config.parseTopicWeights()['vz'] || 0.3,
        sources: [
          'https://www.verizon.com/about/rss/news',
          'https://news.google.com/rss/search?q=Verizon&hl=en-US&gl=US&ceid=US:en',
        ],
        keywords: ['Verizon', 'VZ', 'telecom', '5G', 'wireless', 'fiber'],
      },
      {
        name: 'Accenture',
        weight: Config.parseTopicWeights()['acn'] || 0.2,
        sources: [
          'https://newsroom.accenture.com/news/rss.xml',
          'https://news.google.com/rss/search?q=Accenture&hl=en-US&gl=US&ceid=US:en',
        ],
        keywords: ['Accenture', 'ACN', 'consulting', 'digital transformation'],
      },
    ];
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

