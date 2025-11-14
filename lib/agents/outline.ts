/**
 * Outline Agent - Creates a structured radio outline from picked stories
 */

import { BaseAgent } from './base';
import { Pick, Outline, OutlineSection } from '../types';
import { Logger } from '../utils';

export interface OutlineInput {
  picks: Pick[];
  date: string;
  target_duration_sec: number;
  topic_weights?: Record<string, number>; // For ordering stories by topic priority
  podcast_production?: {
    num_stories_min: number;
    num_stories_max: number;
    pause_after_intro_ms: number;
    pause_between_stories_ms: number;
    pause_before_outro_ms: number;
  };
}

export interface OutlineOutput {
  outline: Outline;
}

export class OutlineAgent extends BaseAgent<OutlineInput, OutlineOutput> {
  constructor() {
    super({
      name: 'OutlineAgent',
      // System prompt is now built dynamically in process() method
      // to include actual target duration and story count from dashboard
      systemPrompt: `You are a producer creating an executive news brief outline for C-suite leaders.

Structure for maximum impact with dense, actionable information. You must respond with valid JSON only.`,
      temperature: 0.7,
      maxTokens: 2000,
    });
  }
  
  protected async process(input: OutlineInput): Promise<OutlineOutput> {
    const { picks, date, target_duration_sec, topic_weights, podcast_production } = input;
    
    // Use dashboard settings or defaults
    const numStoriesMin = podcast_production?.num_stories_min || 3;
    const numStoriesMax = podcast_production?.num_stories_max || 5;
    const pauseAfterIntroMs = podcast_production?.pause_after_intro_ms || 800;
    const pauseBetweenStoriesMs = podcast_production?.pause_between_stories_ms || 1200;
    const pauseBeforeOutroMs = podcast_production?.pause_before_outro_ms || 500;
    
    // Calculate dynamic timing
    const totalPauseTimeSec = (pauseAfterIntroMs + pauseBeforeOutroMs + (pauseBetweenStoriesMs * (numStoriesMax - 1))) / 1000;
    const contentTimeSec = target_duration_sec - totalPauseTimeSec;
    const introOutroTimeSec = Math.max(15, Math.floor(contentTimeSec * 0.1)); // 10% for intro/outro, min 15s each
    const storyTimeSec = Math.floor((contentTimeSec - (introOutroTimeSec * 2)) / ((numStoriesMin + numStoriesMax) / 2));
    
    // Sort picks by topic weight (highest weight first) to order stories by priority
    const sortedPicks = topic_weights
      ? [...picks].sort((a, b) => {
          const weightA = topic_weights[a.topic] || 0;
          const weightB = topic_weights[b.topic] || 0;
          // Sort descending: higher weight first
          return weightB - weightA;
        })
      : picks;
    
    Logger.info('Creating outline', { 
      picks: sortedPicks.length, 
      target_duration_sec,
      num_stories: `${numStoriesMin}-${numStoriesMax}`,
      story_duration_sec: storyTimeSec,
      story_order: sortedPicks.map(p => `${p.topic} (${topic_weights?.[p.topic]?.toFixed(2) || 'N/A'})`),
    });
    
    // Prepare story summaries for the prompt (using sorted picks)
    const storySummaries = sortedPicks.map((pick, idx) => ({
      index: idx,
      id: pick.story_id,
      topic: pick.topic,
      title: pick.story.title,
      source: pick.story.source,
      summary: pick.story.summary || 'No summary available',
      score: pick.score,
    }));
    
    // Count stories by topic (from sorted picks)
    const topicCounts: Record<string, number> = {};
    sortedPicks.forEach(p => {
      topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
    });
    
    const prompt = `Create an executive news briefing outline for ${date}.

Stories available (ordered by topic priority - MAINTAIN THIS ORDER):
${JSON.stringify(storySummaries, null, 2)}

Requirements:
- Total target duration: ${target_duration_sec} seconds (~${Math.round(target_duration_sec / 60)} minutes)
- Select ${numStoriesMin}-${numStoriesMax} most impactful stories
- **CRITICAL: MUST include at least one story from EACH configured topic**
- **CRITICAL: PRESENT STORIES IN THE ORDER GIVEN** - stories are pre-sorted by topic priority (highest weight first)
- Intro: ~${introOutroTimeSec} seconds - Welcome + brief topic preview list
- Each story: ~${storyTimeSec} seconds - Dense, actionable information
- Outro: ~${introOutroTimeSec} seconds - Key takeaways + upbeat closing
- Prioritize business implications and strategic context
- Balance coverage across all topics
- NO small talk, greetings, or filler - executive audience
- Dense information delivery

Topic distribution in provided stories:
${JSON.stringify(topicCounts, null, 2)}

Respond with JSON in this exact format:
{
  "sections": [
    {
      "type": "intro",
      "title": "Welcome & Topics",
      "target_words": 40,
      "refs": []
    },
    {
      "type": "story",
      "title": "Story 1 Title",
      "target_words": 120,
      "refs": [0]
    },
    {
      "type": "story",
      "title": "Story 2 Title",
      "target_words": 120,
      "refs": [1]
    },
    {
      "type": "story",
      "title": "Story 3 Title",
      "target_words": 120,
      "refs": [2]
    },
    {
      "type": "outro",
      "title": "Closing & Takeaways",
      "target_words": 40,
      "refs": []
    }
  ]
}`;
    
    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      { responseFormat: 'json_object' }
    );
    
    const outlineData = JSON.parse(response);
    
    // Map story indices to story IDs with null safety
    const sections: OutlineSection[] = outlineData.sections
      .filter((section: any) => section && section.type) // Filter out null/invalid sections
      .map((section: any) => ({
        type: section.type,
        title: section.title || 'Untitled',
        target_words: section.target_words || 150,
        refs: (section.refs || [])
          .map((idx: number) => picks[idx]?.story_id)
          .filter(Boolean),
      }));
    
    const outline: Outline = {
      sections,
      runtime_target_sec: target_duration_sec,
    };
    
    Logger.info('Outline created', {
      sections: sections.length,
      total_words: sections.reduce((sum, s) => sum + s.target_words, 0),
    });
    
    return { outline };
  }
}

