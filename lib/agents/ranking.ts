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
      .map(s => {
        // Determine rejection reason
        let reason: string;
        
        const topic = s.story.topic || 'Unknown';
        const topicSelectedCount = topicDistribution[topic] || 0;
        const topicTotalCount = scoredStories.filter(st => st.story.topic === topic).length;
        
        if (topicSelectedCount > 0 && topicSelectedCount < topicTotalCount) {
          // Topic had selections, but this story wasn't picked → topic quota filled
          reason = `Topic quota filled (${topicSelectedCount} ${topic} stories already selected)`;
        } else if (s.score < 0.5) {
          // Low score
          reason = 'Score below threshold (0.5)';
        } else {
          // Other reasons (similarity, diversity)
          reason = 'Not selected due to diversity/similarity constraints';
        }
        
        return {
          title: s.story.title,
          topic: topic,
          score: Math.round(s.score * 1000) / 1000,
          reason,
        };
      });
    
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
    
    // Topic match score (0-1) - check ALL topics, not just the assigned one
    let topicScore = 0;
    const storyTopic = story.topic || 'AI';
    
    if (this.topicVectors.has(storyTopic)) {
      const topicVector = this.topicVectors.get(storyTopic)!;
      topicScore = cosineSimilarity(embedding, topicVector);
    }
    
    // Apply topic weight for primary topic
    const topicWeight = topicWeights[storyTopic.toLowerCase()] || 0.3;
    
    // Authority score (simple heuristic based on domain)
    const authorityScore = this.getAuthorityScore(story.domain);
    
    // MULTI-TOPIC BONUS: Check if story matches multiple topics
    const multiTopicBonus = this.calculateMultiTopicBonus(story, embedding, topicWeights, storyTopic);
    
    // Combined score with explicit topic priority bonus
    // The topicWeight is applied twice:
    // 1. Multiplied with topicScore (content relevance)
    // 2. Added as direct priority bonus (dashboard priority)
    const score =
      0.25 * recencyScore +              // Recent stories preferred
      0.35 * topicScore * topicWeight +  // Relevant stories for weighted topics (reduced from 0.4)
      0.15 * authorityScore +            // Reputable sources preferred
      0.15 * topicWeight +               // Direct topic priority bonus (reduced from 0.2)
      0.1 * multiTopicBonus;             // Multi-topic stories get bonus (NEW!)
    
    // This means:
    // - A high-weight topic (0.6) gets 0.09 bonus (down from 0.12)
    // - A medium-weight topic (0.3) gets 0.045 bonus (down from 0.06)
    // - A low-weight topic (0.1) gets 0.015 bonus (down from 0.02)
    // - Multi-topic stories get up to 0.1 additional bonus
    // This significantly prioritizes stories from high-weight topics AND cross-topic stories
    
    return score;
  }
  
  /**
   * Calculate bonus for stories that match multiple topics
   * Stories relevant to multiple topics are more valuable
   */
  private calculateMultiTopicBonus(
    story: Story,
    embedding: number[],
    topicWeights: Record<string, number>,
    primaryTopic: string
  ): number {
    const storyText = `${story.title} ${story.summary || ''}`.toLowerCase();
    let matchedTopics: Array<{ topic: string; weight: number; similarity: number }> = [];
    
    // Check similarity to ALL topics (not just primary)
    for (const [topicName, topicVector] of this.topicVectors.entries()) {
      if (topicName === primaryTopic) continue; // Skip primary topic
      
      const similarity = cosineSimilarity(embedding, topicVector);
      const weight = topicWeights[topicName.toLowerCase()] || 0.1;
      
      // Consider it a match if similarity > 0.65 (high relevance threshold)
      if (similarity > 0.65) {
        matchedTopics.push({ topic: topicName, weight, similarity });
      }
    }
    
    // If no additional topics matched, no bonus
    if (matchedTopics.length === 0) return 0;
    
    // Calculate bonus based on number of additional topics and their weights
    // More topics = bigger bonus, higher-weight topics = bigger bonus
    const bonus = matchedTopics.reduce((sum, match) => {
      // Each additional topic adds: weight * similarity * 0.5
      // Max bonus if story matches all high-weight topics
      return sum + (match.weight * match.similarity * 0.5);
    }, 0);
    
    // Cap bonus at 1.0
    const cappedBonus = Math.min(bonus, 1.0);
    
    // Log multi-topic matches for visibility
    if (matchedTopics.length > 0) {
      Logger.debug('Multi-topic story detected', {
        title: story.title.substring(0, 60),
        primary_topic: primaryTopic,
        additional_topics: matchedTopics.map(m => `${m.topic} (${(m.similarity * 100).toFixed(0)}%)`),
        bonus: cappedBonus.toFixed(3),
      });
    }
    
    return cappedBonus;
  }
  
  private getAuthorityScore(domain: string): number {
    // Tiered authority scoring based on source reputation
    // Scores are multiplied by 0.15 in calculateScore, so these affect final ranking
    
    const domainLower = domain.toLowerCase();
    
    // TIER 1: Highest Authority (1.0) - Major news organizations & wire services
    const tier1 = [
      // Wire services
      'reuters.com', 'apnews.com', 'associated press',
      // Major US newspapers
      'wsj.com', 'wall street journal', 'nytimes.com', 'new york times', 
      'washingtonpost.com', 'washington post', 'usatoday',
      // Major international newspapers
      'ft.com', 'financial times', 'economist.com', 'bbc.com', 'theguardian.com',
      // Major US news networks
      'cnbc.com', 'cnn.com', 'abcnews.go.com', 'cbsnews.com', 'nbcnews.com',
      'foxnews.com', 'fox news', 'msnbc.com',
      // Public broadcasting
      'npr.org', 'pbs.org',
    ];
    
    if (tier1.some(auth => domainLower.includes(auth))) {
      return 1.0;
    }
    
    // TIER 2: High Authority (0.85) - Business news, tech publications & major digital media
    const tier2 = [
      // Business & finance news
      'bloomberg.com', 'forbes.com', 'fortune.com', 'businessinsider.com', 
      'marketwatch.com', 'barrons.com', 'investopedia.com', 'fool.com',
      'seekingalpha.com', 'morningstar.com', 'benzinga.com',
      'yahoo', 'msn', 'money.cnn', // Aggregators that credit sources
      // Tech publications
      'techcrunch.com', 'theverge.com', 'wired.com', 'arstechnica.com',
      'venturebeat.com', 'zdnet.com', 'cnet.com', 'engadget.com',
      'theregister.com', 'computerworld.com', 'infoworld.com',
      'technologyreview.com', 'mit technology review',
      // Major magazines
      'newsweek.com', 'time.com', 'theatlantic.com', 'newyorker.com',
      'vanityfair.com', 'gq.com', 'vogue.com',
      // Digital-first quality journalism
      'vox.com', 'slate.com', 'salon.com', 'huffpost.com', 'buzzfeed news',
      'propublica.org', 'theintercept.com',
    ];
    
    if (tier2.some(auth => domainLower.includes(auth))) {
      return 0.85;
    }
    
    // TIER 3: Medium Authority (0.70) - Regional news, industry publications & credible blogs
    const tier3 = [
      // Political news
      'axios.com', 'politico.com', 'thehill.com', 'rollcall.com', 'washingtonexaminer.com',
      // Major regional newspapers
      'latimes.com', 'chicagotribune.com', 'sfgate.com', 'mercurynews.com',
      'boston.com', 'bostonglobe.com', 'philly.com', 'dallasnews.com',
      'seattletimes.com', 'denverpost.com', 'star-telegram.com',
      'ajc.com', 'cleveland.com', 'oregonlive.com',
      // Industry trade publications
      'industryweek.com', 'manufacturing.net', 'sdxcentral.com',
      'channele2e.com', 'crn.com', 'theregister.com',
      'adweek.com', 'mediapost.com', 'digiday.com',
      // Fintech & payments
      'pymnts.com', 'finextra.com', 'fintechfutures.com',
      // Press release aggregators (lower quality but credited)
      'pr newswire', 'business wire', 'globe newswire', 'accesswire',
      // International regional
      'americanbazaar', 'scmp.com', 'japantimes', 'straitstimes',
    ];
    
    if (tier3.some(auth => domainLower.includes(auth))) {
      return 0.70;
    }
    
    // TIER 4: Company/Corporate Sources (0.55) - Official company announcements & blogs
    const tier4 = [
      // Tech giants
      'microsoft.com', 'google.com', 'meta.com', 'apple.com', 'amazon.com',
      'openai.com', 'anthropic.com', 'deepmind.com',
      // Hardware & semiconductors
      'nvidia.com', 'intel.com', 'amd.com', 'arm.com', 'tsmc.com',
      'qualcomm.com', 'broadcom.com',
      // Enterprise software
      'ibm.com', 'oracle.com', 'salesforce.com', 'sap.com', 'servicenow.com',
      'workday.com', 'adobe.com', 'autodesk.com',
      // Telecom
      'verizon.com', 't-mobile.com', 'att.com', 'sprint.com', 'vodafone.com',
      // Consulting & services
      'accenture.com', 'deloitte.com', 'pwc.com', 'ey.com', 'kpmg.com',
      'mckinsey.com', 'bcg.com', 'bain.com',
      // Cloud providers
      'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com',
      // Social media companies
      'twitter.com', 'linkedin.com', 'facebook.com', 'instagram.com',
    ];
    
    if (tier4.some(auth => domainLower.includes(auth))) {
      return 0.55;
    }
    
    // Google News aggregator (often appears when extraction fails)
    if (domainLower.includes('news.google.com')) {
      return 0.40;
    }
    
    // TIER 5: Unknown/Lower Authority (0.50) - Default for everything else
    return 0.50;
  }
  
  private diversifySelectionWithTracking(
    scoredStories: Array<{ story: Story; embedding: number[]; score: number }>,
    targetCount: number
  ): Pick[] {
    const picks: Pick[] = [];
    const topicCounts = new Map<string, number>();
    
    // Get unique topics from stories, SORTED BY WEIGHT (highest first)
    const topics = Array.from(new Set(scoredStories.map(s => s.story.topic)))
      .filter((t): t is string => !!t) // Filter out undefined/empty topics
      .sort((a, b) => {
        const weightA = this.topicWeights[a.toLowerCase()] || 0;
        const weightB = this.topicWeights[b.toLowerCase()] || 0;
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
      const weight = this.topicWeights[topic.toLowerCase()] || 1.0 / topics.length;
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
        (this.topicWeights[t.toLowerCase()] || 0) > (this.topicWeights[max.toLowerCase()] || 0) ? t : max
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
          pick.rationale = `${topic} story #${selected + 1}/${target} (score: ${candidate.score.toFixed(3)}) - proportional topic coverage (weight: ${this.topicWeights[topic.toLowerCase()]?.toFixed(2) || 'N/A'})`;
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

