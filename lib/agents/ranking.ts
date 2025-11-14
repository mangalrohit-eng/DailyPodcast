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
  detailed_report: {
    stories_ranked: number;
    top_picks: Array<{ title: string; topic: string; score: number; why_selected: string }>;
    rejected_stories: Array<{ title: string; score: number; reason: string }>;
  };
}

export class RankingAgent extends BaseAgent<RankingInput, RankingOutput> {
  private embeddingsTool: EmbeddingsTool;
  
  // Pre-computed topic vectors (in production, cache these)
  private topicVectors: Map<string, number[]> = new Map();
  
  // Topic weights from dashboard (stored during process)
  private topicWeights: Record<string, number> = {};
  
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
    
    // Store topic weights for use in diversifySelectionWithTracking
    this.topicWeights = topic_weights || {};
    
    if (stories.length === 0) {
      return { 
        picks: [], 
        topic_distribution: {},
        detailed_report: {
          stories_ranked: 0,
          top_picks: [],
          rejected_stories: [],
        },
      };
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
    
    // Diversify and select (this modifies picks with selection reasons)
    const picks = this.diversifySelectionWithTracking(scoredStories, target_count);
    
    // Calculate topic distribution
    const topicDistribution: Record<string, number> = {};
    for (const pick of picks) {
      topicDistribution[pick.topic] = (topicDistribution[pick.topic] || 0) + 1;
    }
    
    // Build detailed report
    const selectedIds = new Set(picks.map(p => p.story_id));
    const topPicks = picks.map(p => ({
      title: p.story.title,
      topic: p.topic,
      score: Math.round(p.score * 1000) / 1000,
      why_selected: p.rationale,
    }));
    
    const rejectedStories = scoredStories
      .filter(s => !selectedIds.has(s.story.id))
      .slice(0, 20) // Top 20 rejected
      .map(s => ({
        title: s.story.title,
        score: Math.round(s.score * 1000) / 1000,
        reason: s.score < 0.5 
          ? 'Score below threshold (0.5)' 
          : 'Not selected due to diversity/similarity constraints',
      }));
    
    Logger.info('Ranking complete', {
      picks: picks.length,
      distribution: topicDistribution,
    });
    
    return {
      picks,
      topic_distribution: topicDistribution,
      detailed_report: {
        stories_ranked: scoredStories.length,
        top_picks: topPicks,
        rejected_stories: rejectedStories,
      },
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
      // No hardcoded preferred domains - all domains treated equally
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
  
  private diversifySelectionWithTracking(
    scoredStories: Array<{ story: Story; embedding: number[]; score: number }>,
    targetCount: number
  ): Pick[] {
    const picks: Pick[] = [];
    const topicCounts = new Map<string, number>();
    
    // Get unique topics from stories, SORTED BY WEIGHT (highest first)
    const topics = Array.from(new Set(scoredStories.map(s => s.story.topic)))
      .sort((a, b) => {
        const weightA = this.topicWeights[a] || 0;
        const weightB = this.topicWeights[b] || 0;
        return weightB - weightA; // Descending: highest weight first
      });
    
    Logger.info('🎯 Enforcing balanced topic distribution', {
      topics,
      targetCount,
      weights: this.topicWeights,
      sorted_by_weight: 'highest first',
    });
    
    // Calculate target count per topic based on weights
    const topicTargets = new Map<string, number>();
    for (const topic of topics) {
      const weight = this.topicWeights[topic] || 1.0 / topics.length;
      const target = Math.max(1, Math.round(targetCount * weight)); // At least 1 per topic
      topicTargets.set(topic, target);
      Logger.info(`📊 Topic target: ${topic}`, { weight, target_stories: target });
    }
    
    // Adjust targets to exactly match targetCount
    let totalTargets = Array.from(topicTargets.values()).reduce((a, b) => a + b, 0);
    if (totalTargets !== targetCount) {
      const diff = targetCount - totalTargets;
      // Distribute the difference to the topic with the highest weight
      const maxWeightTopic = topics.reduce((max, t) => 
        (this.topicWeights[t] || 0) > (this.topicWeights[max] || 0) ? t : max
      );
      topicTargets.set(maxWeightTopic, (topicTargets.get(maxWeightTopic) || 1) + diff);
      Logger.info(`⚖️ Adjusted ${maxWeightTopic} target by ${diff} to match total`, {
        new_target: topicTargets.get(maxWeightTopic),
      });
    }
    
    // Select stories topic by topic, proportionally
    for (const topic of topics) {
      const target = topicTargets.get(topic) || 1;
      const topicStories = scoredStories
        .filter(s => s.story.topic === topic)
        .sort((a, b) => b.score - a.score); // Sort by score descending
      
      let selected = 0;
      for (const candidate of topicStories) {
        if (selected >= target) break;
        if (picks.some(p => p.story_id === candidate.story.id)) continue;
        
        // Check diversity (avoid very similar stories within same topic)
        let isDiverse = true;
        for (const existingPick of picks) {
          if (existingPick.topic === topic) {
            const pickEmbedding = scoredStories.find(
              s => s.story.id === existingPick.story_id
            )?.embedding;
            
            if (pickEmbedding) {
              const similarity = cosineSimilarity(candidate.embedding, pickEmbedding);
              if (similarity > 0.85) {
                isDiverse = false;
                break;
              }
            }
          }
        }
        
        if (isDiverse) {
          const pick = this.createPick(candidate.story, candidate.score, picks.length);
          pick.rationale = `${topic} story #${selected + 1}/${target} (score: ${candidate.score.toFixed(3)}) - proportional topic coverage (weight: ${this.topicWeights[topic]?.toFixed(2) || 'N/A'})`;
          picks.push(pick);
          topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
          selected++;
        }
      }
      
      if (selected < target) {
        Logger.warn(`⚠️ Could not fill target for ${topic}`, {
          target,
          selected,
          available: topicStories.length,
        });
      }
    }
    
    Logger.info('✅ Final topic distribution', {
      total_picks: picks.length,
      by_topic: Object.fromEntries(topicCounts),
      picks_list: picks.map(p => `${p.topic}: ${p.story.title.substring(0, 60)}...`),
    });
    
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

