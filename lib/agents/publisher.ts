/**
 * Publisher Agent - Publishes episode and updates feed
 */

import { BaseAgent } from './base';
import { EpisodeManifest, PodcastConfig } from '../types';
import { FeedTool } from '../tools/feed';
import { Logger } from '../utils';

export interface PublisherInput {
  audio_buffer: Buffer;
  manifest: EpisodeManifest;
  podcast_config: PodcastConfig;
}

export interface PublisherOutput {
  episode_url: string;
  feed_url: string;
  published: boolean;
}

export class PublisherAgent extends BaseAgent<PublisherInput, PublisherOutput> {
  constructor() {
    super({
      name: 'PublisherAgent',
      systemPrompt: `You are a publishing agent responsible for making podcast episodes publicly accessible.`,
      retries: 3,
    });
  }
  
  protected async process(input: PublisherInput): Promise<PublisherOutput> {
    const { audio_buffer, manifest, podcast_config } = input;
    
    Logger.info('Publishing episode', { date: manifest.date });
    
    // Upload episode MP3
    const episodePath = `episodes/${manifest.date}_daily_rohit_news.mp3`;
    const episodeUrl = await this.storage.put(
      episodePath,
      audio_buffer,
      'audio/mpeg'
    );
    
    Logger.info('Episode uploaded', { url: episodeUrl });
    
    // Update manifest with public URL
    manifest.mp3_url = episodeUrl;
    
    // Store manifest
    const manifestPath = `episodes/${manifest.date}_manifest.json`;
    await this.storage.put(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      'application/json'
    );
    
    // Update feed.xml
    await this.updateFeed(manifest, podcast_config);
    
    const feedUrl = `${podcast_config.base_url}/podcast/feed.xml`;
    
    Logger.info('Publishing complete', {
      episode_url: episodeUrl,
      feed_url: feedUrl,
    });
    
    return {
      episode_url: episodeUrl,
      feed_url: feedUrl,
      published: true,
    };
  }
  
  private async updateFeed(
    manifest: EpisodeManifest,
    config: PodcastConfig
  ): Promise<void> {
    Logger.info('Updating podcast feed');
    
    // Get existing manifests
    const allManifests = await this.getAllManifests();
    
    // Sort by date (newest first)
    allManifests.sort((a, b) => b.date.localeCompare(a.date));
    
    // Keep last 30 episodes
    const recentManifests = allManifests.slice(0, 30);
    
    // Build feed items
    const items = recentManifests.map(m => ({
      title: `Daily Brief - ${m.date}`,
      description: this.buildEpisodeDescription(m),
      link: `${config.base_url}/podcast/episodes/${m.date}.mp3`,
      enclosureUrl: m.mp3_url,
      enclosureLength: 0, // Will be estimated or actual if available
      pubDate: new Date(m.created_at),
      duration: m.duration_sec,
      guid: `daily-brief-${m.date}`,
    }));
    
    // Generate feed XML
    const feedXml = FeedTool.buildPodcastFeed({
      title: config.title,
      description: config.description,
      link: config.base_url,
      language: config.language,
      author: config.author,
      email: config.email,
      category: config.category,
      imageUrl: config.image_url,
      items,
    });
    
    // Store feed
    await this.storage.put('feed.xml', feedXml, 'application/rss+xml');
    
    Logger.info('Feed updated', { episodes: items.length });
  }
  
  private async getAllManifests(): Promise<EpisodeManifest[]> {
    try {
      const objects = await this.storage.list('episodes/');
      const manifestObjects = objects.filter(obj => obj.path.endsWith('_manifest.json'));
      
      const manifests: EpisodeManifest[] = [];
      
      for (const obj of manifestObjects) {
        try {
          const content = await this.storage.get(obj.path);
          const manifest = JSON.parse(content.toString('utf-8'));
          manifests.push(manifest);
        } catch (error) {
          Logger.warn('Failed to load manifest', { path: obj.path });
        }
      }
      
      return manifests;
    } catch (error) {
      Logger.warn('Failed to list manifests', { error: (error as Error).message });
      return [];
    }
  }
  
  private buildEpisodeDescription(manifest: EpisodeManifest): string {
    const topicCounts: Record<string, number> = {};
    
    for (const pick of manifest.picks) {
      topicCounts[pick.topic] = (topicCounts[pick.topic] || 0) + 1;
    }
    
    const topicSummary = Object.entries(topicCounts)
      .map(([topic, count]) => `${count} ${topic}`)
      .join(', ');
    
    return `Your personalized morning brief for ${manifest.date}. Covering: ${topicSummary} stories. Duration: ${Math.round(manifest.duration_sec / 60)} minutes. AI-generated narration powered by OpenAI.`;
  }
}

