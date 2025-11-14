/**
 * Memory & Feedback Agent - Learns from past runs for continuous improvement
 */

import { BaseAgent } from './base';
import { EpisodeManifest, Pick } from '../types';
import { Logger } from '../utils';

export interface MemoryInput {
  manifest: EpisodeManifest;
  feedback?: {
    listener_rating?: number; // 1-5
    topics_adjustment?: Record<string, number>; // e.g., {"ai": 0.05}
    skipped_sections?: string[];
  };
}

export interface MemoryOutput {
  profile_updated: boolean;
  insights: string[];
}

interface ListenerProfile {
  topic_weights: Record<string, number>;
  preferred_sources: string[];
  avoided_sources: string[];
  pronunciation_glossary: Record<string, string>;
  skipped_story_patterns: string[];
  average_rating: number;
  total_episodes: number;
  last_updated: string;
}

export class MemoryAgent extends BaseAgent<MemoryInput, MemoryOutput> {
  private readonly profilePath = 'memory/listener_profile.json';
  
  constructor() {
    super({
      name: 'MemoryAgent',
      systemPrompt: `You are a memory and feedback agent that learns from listener behavior to improve future episodes.`,
      retries: 2,
    });
  }
  
  protected async process(input: MemoryInput): Promise<MemoryOutput> {
    const { manifest, feedback } = input;
    
    Logger.info('Updating listener memory', { date: manifest.date });
    
    // Load existing profile
    const profile = await this.loadProfile();
    
    // Update profile with new data
    const insights: string[] = [];
    
    // Update episode count
    profile.total_episodes += 1;
    
    // Update topic preferences based on feedback
    if (feedback?.topics_adjustment) {
      for (const [topic, adjustment] of Object.entries(feedback.topics_adjustment)) {
        profile.topic_weights[topic] =
          (profile.topic_weights[topic] || 0.33) + adjustment;
        
        // Normalize weights
        const total = Object.values(profile.topic_weights).reduce((a, b) => a + b, 0);
        for (const key of Object.keys(profile.topic_weights)) {
          profile.topic_weights[key] /= total;
        }
        
        insights.push(`Adjusted ${topic} weight by ${adjustment > 0 ? '+' : ''}${adjustment}`);
      }
    }
    
    // Track source performance
    const sources = manifest.picks.map(p => p.story.source);
    for (const source of sources) {
      if (!profile.preferred_sources.includes(source)) {
        profile.preferred_sources.push(source);
      }
    }
    
    // Keep top 50 sources
    profile.preferred_sources = profile.preferred_sources.slice(-50);
    
    // Update average rating
    if (feedback?.listener_rating) {
      const currentTotal = profile.average_rating * (profile.total_episodes - 1);
      profile.average_rating = (currentTotal + feedback.listener_rating) / profile.total_episodes;
      insights.push(`Episode rated ${feedback.listener_rating}/5, average now ${profile.average_rating.toFixed(2)}`);
    }
    
    // Track skipped sections for future optimization
    if (feedback?.skipped_sections && feedback.skipped_sections.length > 0) {
      insights.push(`Listener skipped: ${feedback.skipped_sections.join(', ')}`);
    }
    
    // Update timestamp
    profile.last_updated = new Date().toISOString();
    
    // Save updated profile
    await this.saveProfile(profile);
    
    Logger.info('Memory updated', { insights: insights.length });
    
    return {
      profile_updated: true,
      insights,
    };
  }
  
  private async loadProfile(): Promise<ListenerProfile> {
    try {
      const exists = await this.storage.exists(this.profilePath);
      
      if (exists) {
        const data = await this.storage.get(this.profilePath);
        return JSON.parse(data.toString('utf-8'));
      }
    } catch (error) {
      Logger.warn('Failed to load profile, using defaults', {
        error: (error as Error).message,
      });
    }
    
    // Return default profile
    return {
      topic_weights: {
        ai: 0.5,
        vz: 0.3,
        acn: 0.2,
      },
      preferred_sources: [],
      avoided_sources: [],
      pronunciation_glossary: {
        // Pronunciation guide loaded from dashboard settings
        'AI': 'A I',
        'GPT': 'G P T',
        'API': 'A P I',
      },
      skipped_story_patterns: [],
      average_rating: 0,
      total_episodes: 0,
      last_updated: new Date().toISOString(),
    };
  }
  
  private async saveProfile(profile: ListenerProfile): Promise<void> {
    try {
      await this.storage.put(
        this.profilePath,
        JSON.stringify(profile, null, 2),
        'application/json'
      );
      Logger.debug('Profile saved');
    } catch (error) {
      Logger.error('Failed to save profile', {
        error: (error as Error).message,
      });
    }
  }
  
  /**
   * Get current profile (used by orchestrator to inform ranking)
   */
  async getProfile(): Promise<ListenerProfile> {
    return this.loadProfile();
  }
}

