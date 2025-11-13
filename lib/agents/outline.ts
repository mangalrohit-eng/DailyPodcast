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
      systemPrompt: `You are a producer creating an executive news brief outline for C-suite leaders.

Structure for maximum impact:
- Intro (15-20 seconds): Welcome + brief topic preview list
- Story Segments (50-90 seconds each): Dense, actionable information
- Outro (15-20 seconds): Key takeaways + upbeat closing

Target: 4-5 minutes total. Maximum information density. You must respond with valid JSON only.`,
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
    
    // Count stories by topic
    const topicCounts: Record<string, number> = {};
    picks.forEach(p => {
      topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
    });
    
    const prompt = `Create an executive news briefing outline for ${date}.

Stories available:
${JSON.stringify(storySummaries, null, 2)}

Requirements:
- Total target duration: ${target_duration_sec} seconds (~${Math.round(target_duration_sec / 60)} minutes)
- Select 3-5 most impactful stories
- **CRITICAL: MUST include at least one story from EACH topic (AI, Verizon, Accenture)**
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

