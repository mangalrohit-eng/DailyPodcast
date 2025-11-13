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
      systemPrompt: `You are a professional radio producer creating a compelling 5-minute morning news brief.
Your job is to structure stories into engaging segments:
- Cold Open (15-20 seconds): Hook the listener
- Headlines (2-3 stories, ~3 minutes): Top stories
- What to Watch (1 story, ~1 minute): Forward-looking
- Sign-off (10-15 seconds): Warm closing

Keep it concise and impactful. You must respond with valid JSON only.`,
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
- Select 3-5 stories total - keep it concise
- Balance the three topics (AI, Verizon, Accenture)
- Be conversational and engaging

Respond with JSON in this exact format:
{
  "sections": [
    {
      "type": "cold-open",
      "title": "Good Morning",
      "target_words": 40,
      "refs": []
    },
    {
      "type": "headlines",
      "title": "Top Stories",
      "target_words": 500,
      "refs": [0, 1, 2]
    },
    {
      "type": "what-to-watch",
      "title": "What to Watch",
      "target_words": 150,
      "refs": [3]
    },
    {
      "type": "sign-off",
      "title": "Have a great day",
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

