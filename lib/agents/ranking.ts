/**
 * Ranking Agent - Ranks and selects stories based on relevance, diversity, and recency
 */

import { BaseAgent } from './base';
import { Story, Pick } from '../types';
import { EmbeddingsTool } from '../tools/embeddings';
import { Logger, cosineSimilarity } from '../utils';
import { Config } from '../config';

export interface RankingInput {
  stories: Story[];
  topic_weights: Record<string, number>;
  target_count: number; // e.g., 8-12
}

export interface RankingOutput {
  picks: Pick[];
  topic_distribution: Record<string, number>;
}

export class RankingAgent extends BaseAgent<RankingInput, RankingOutput> {
  private embeddingsTool: EmbeddingsTool;
  
  // Pre-computed topic vectors (in production, cache these)
  private topicVectors: Map<string, number[]> = new Map();
  
  constructor() {
    super({
      name: 'RankingAgent',
      systemPrompt: `You are a ranking agent responsible for selecting the most relevant, diverse, and timely news stories.`,
      retries: 2,
    });
    
    this.embeddingsTool = new EmbeddingsTool();
  }
  
  protected async process(input: RankingInput): Promise<RankingOutput> {
    const { stories, topic_weights, target_count } = input;
    
    if (stories.length === 0) {
      return { picks: [], topic_distribution: {} };
    }
    
    Logger.info('Ranking stories', { count: stories.length, target: target_count });
    
    // Generate embeddings for all stories
    const storyTexts = stories.map(s => `${s.title}. ${s.summary || ''}`);
    const storyEmbeddings = await this.embeddingsTool.embed(storyTexts);
    
    // Get topic embeddings
    await this.initializeTopicVectors();
    
    // Score each story with null safety
    const scoredStories = stories
      .map((story, idx) => {
        const embedding = storyEmbeddings[idx];
        if (!embedding) {
          Logger.warn('Missing embedding for story', { story_id: story.id, title: story.title });
          return null;
        }
        const score = this.calculateScore(story, embedding, topic_weights);
      
        return {
          story,
          embedding,
          score,
        };
      })
      .filter(Boolean) as Array<{ story: Story; embedding: number[]; score: number }>;
    
    // Sort by score
    scoredStories.sort((a, b) => b.score - a.score);
    
    // Diversify and select
    const picks = this.diversifySelection(scoredStories, target_count);
    
    // Calculate topic distribution
    const topicDistribution: Record<string, number> = {};
    for (const pick of picks) {
      topicDistribution[pick.topic] = (topicDistribution[pick.topic] || 0) + 1;
    }
    
    Logger.info('Ranking complete', {
      picks: picks.length,
      distribution: topicDistribution,
    });
    
    return {
      picks,
      topic_distribution: topicDistribution,
    };
  }
  
  private async initializeTopicVectors(): Promise<void> {
    if (this.topicVectors.size > 0) {
      return; // Already initialized
    }
    
    const topics = Config.getTopicConfigs();
    const topicDescriptions = topics.map(
      t => `${t.name}: ${t.keywords.join(', ')}`
    );
    
    const embeddings = await this.embeddingsTool.embed(topicDescriptions);
    
    for (let i = 0; i < topics.length; i++) {
      this.topicVectors.set(topics[i].name, embeddings[i]);
    }
  }
  
  private calculateScore(
    story: Story,
    embedding: number[],
    topicWeights: Record<string, number>
  ): number {
    // Recency score (0-1, with 1 being very recent)
    const ageHours = (Date.now() - story.published_at.getTime()) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - ageHours / 48); // Decay over 48 hours
    
    // Topic match score (0-1)
    let topicScore = 0;
    const storyTopic = story.topic || 'AI';
    
    if (this.topicVectors.has(storyTopic)) {
      const topicVector = this.topicVectors.get(storyTopic)!;
      topicScore = cosineSimilarity(embedding, topicVector);
    }
    
    // Apply topic weight
    const topicWeight = topicWeights[storyTopic.toLowerCase()] || 0.3;
    
    // Authority score (simple heuristic based on domain)
    const authorityScore = this.getAuthorityScore(story.domain);
    
    // Combined score
    const score =
      0.3 * recencyScore +
      0.5 * topicScore * topicWeight +
      0.2 * authorityScore;
    
    return score;
  }
  
  private getAuthorityScore(domain: string): number {
    // Simple authority scoring based on known sources
    const highAuthority = [
      'openai.com',
      'anthropic.com',
      'google.com',
      'meta.com',
      'microsoft.com',
      'verizon.com',
      'accenture.com',
      'reuters.com',
      'bloomberg.com',
      'wsj.com',
      'nytimes.com',
      'techcrunch.com',
    ];
    
    if (highAuthority.some(auth => domain.includes(auth))) {
      return 1.0;
    }
    
    if (domain.includes('news.google.com')) {
      return 0.7;
    }
    
    return 0.5;
  }
  
  private diversifySelection(
    scoredStories: Array<{ story: Story; embedding: number[]; score: number }>,
    targetCount: number
  ): Pick[] {
    const picks: Pick[] = [];
    const selectedEmbeddings: number[] = [];
    const topicCounts = new Map<string, number>();
    
    // Ensure at least one story per topic if available
    const topics = new Set(scoredStories.map(s => s.story.topic));
    
    for (const topic of topics) {
      const topicStories = scoredStories.filter(s => s.story.topic === topic);
      if (topicStories.length > 0) {
        const best = topicStories[0];
        picks.push(this.createPick(best.story, best.score, picks.length));
        selectedEmbeddings.push(...best.embedding);
        topicCounts.set(topic!, (topicCounts.get(topic!) || 0) + 1);
      }
    }
    
    // Fill remaining slots with diversity consideration
    for (const candidate of scoredStories) {
      if (picks.length >= targetCount) break;
      
      // Skip if already selected
      if (picks.some(p => p.story_id === candidate.story.id)) continue;
      
      // Check diversity (avoid similar stories)
      let isDiverse = true;
      for (let i = 0; i < picks.length; i++) {
        const pickEmbedding = scoredStories.find(
          s => s.story.id === picks[i].story_id
        )?.embedding;
        
        if (pickEmbedding) {
          const similarity = cosineSimilarity(candidate.embedding, pickEmbedding);
          if (similarity > 0.85) {
            isDiverse = false;
            break;
          }
        }
      }
      
      if (isDiverse) {
        picks.push(this.createPick(candidate.story, candidate.score, picks.length));
        topicCounts.set(
          candidate.story.topic!,
          (topicCounts.get(candidate.story.topic!) || 0) + 1
        );
      }
    }
    
    return picks;
  }
  
  private createPick(story: Story, score: number, index: number): Pick {
    return {
      story_id: story.id,
      story,
      topic: story.topic || 'AI',
      score,
      cluster_id: index,
      rationale: `Selected for ${story.topic} coverage with score ${score.toFixed(3)}`,
    };
  }
}

