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
}

export interface OutlineOutput {
  outline: Outline;
}

export class OutlineAgent extends BaseAgent<OutlineInput, OutlineOutput> {
  constructor() {
    super({
      name: 'OutlineAgent',
      systemPrompt: `You are a professional radio producer creating a compelling 15-minute morning news brief.
Your job is to structure stories into engaging segments:
- Cold Open (30-45 seconds): Hook the listener
- Headlines (3-4 stories, ~3 minutes): Quick hits on top stories
- Deep Dive (1 story, ~5 minutes): Detailed analysis
- Quick Hits (3-5 stories, ~4 minutes): Rapid-fire updates
- What to Watch (1-2 stories, ~2 minutes): Forward-looking
- Sign-off (15-30 seconds): Warm closing

You must respond with valid JSON only.`,
      temperature: 0.7,
      maxTokens: 2000,
    });
  }
  
  protected async process(input: OutlineInput): Promise<OutlineOutput> {
    const { picks, date, target_duration_sec } = input;
    
    Logger.info('Creating outline', { picks: picks.length, target_duration_sec });
    
    // Prepare story summaries for the prompt
    const storySummaries = picks.map((pick, idx) => ({
      index: idx,
      id: pick.story_id,
      topic: pick.topic,
      title: pick.story.title,
      source: pick.story.source,
      summary: pick.story.summary || 'No summary available',
      score: pick.score,
    }));
    
    const prompt = `Create a radio outline for ${date} morning brief.

Stories available:
${JSON.stringify(storySummaries, null, 2)}

Requirements:
- Total target duration: ${target_duration_sec} seconds (~${Math.round(target_duration_sec / 60)} minutes)
- Select 8-12 stories total across all segments
- Balance the three topics (AI, Verizon, Accenture)
- Make the Deep Dive the most important/interesting story
- Be conversational and engaging

Respond with JSON in this exact format:
{
  "sections": [
    {
      "type": "cold-open",
      "title": "Hook title",
      "target_words": 80,
      "refs": []
    },
    {
      "type": "headlines",
      "title": "Top Headlines",
      "target_words": 450,
      "refs": [0, 1, 2]
    },
    {
      "type": "deep-dive",
      "title": "Deep Dive Title",
      "target_words": 750,
      "refs": [3]
    },
    {
      "type": "quick-hits",
      "title": "Quick Updates",
      "target_words": 600,
      "refs": [4, 5, 6, 7]
    },
    {
      "type": "what-to-watch",
      "title": "What to Watch",
      "target_words": 300,
      "refs": [8]
    },
    {
      "type": "sign-off",
      "title": "Closing",
      "target_words": 60,
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
    
    // Map story indices to story IDs
    const sections: OutlineSection[] = outlineData.sections.map((section: any) => ({
      type: section.type,
      title: section.title,
      target_words: section.target_words,
      refs: section.refs.map((idx: number) => picks[idx]?.story_id).filter(Boolean),
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

