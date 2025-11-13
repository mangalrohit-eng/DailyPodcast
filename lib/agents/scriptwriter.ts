/**
 * Scriptwriter Agent - Converts outline into a conversational radio script
 */

import { BaseAgent } from './base';
import { Outline, Pick, Script, ScriptSection, Source } from '../types';
import { Logger } from '../utils';

export interface ScriptwriterInput {
  outline: Outline;
  picks: Pick[];
  date: string;
  listener_name: string;
}

export interface ScriptwriterOutput {
  script: Script;
}

export class ScriptwriterAgent extends BaseAgent<ScriptwriterInput, ScriptwriterOutput> {
  constructor() {
    super({
      name: 'ScriptwriterAgent',
      systemPrompt: `You are a professional radio scriptwriter creating a conversational morning news brief.

Style Guidelines:
- Write in a warm, conversational tone as if speaking to a friend
- Use contractions (we're, it's, don't) naturally
- Include stage directions like (warmly), (pause), [beat 300ms]
- Target 750 ± 50 words total (5-minute brief)
- Cite sources inline using [1], [2], etc.
- Avoid quotes longer than 25 words
- Mark uncertainty with phrases like "reports suggest" or "according to"
- Be engaging but professional and concise

Technical Requirements:
- Every factual claim must reference a source with [n]
- Each section should flow naturally into the next
- Include natural breathing pauses
- No speculation beyond what sources report
- Keep it brief and impactful

You must respond with valid JSON only.`,
      temperature: 0.8,
      maxTokens: 6000,
    });
  }
  
  protected async process(input: ScriptwriterInput): Promise<ScriptwriterOutput> {
    const { outline, picks, date, listener_name } = input;
    
    Logger.info('Writing script', { sections: outline.sections.length });
    
    // Build source map
    const sourceMap = new Map<string, Pick>();
    picks.forEach(pick => sourceMap.set(pick.story_id, pick));
    
    // Collect all sources for citation
    const sources: Source[] = [];
    const storyToSourceId = new Map<string, number>();
    
    picks.forEach(pick => {
      if (!storyToSourceId.has(pick.story_id)) {
        const sourceId = sources.length + 1;
        sources.push({
          id: sourceId,
          title: pick.story.title,
          url: pick.story.url,
        });
        storyToSourceId.set(pick.story_id, sourceId);
      }
    });
    
    // Generate script sections in ONE API call (batch processing)
    Logger.info('Writing all script sections in single API call', { sectionCount: outline.sections.length });
    
    const sections = await this.writeAllSections(
      outline.sections,
      sourceMap,
      storyToSourceId,
      date,
      listener_name
    );
    
    // Calculate total word count
    const totalText = sections.map(s => s.text).join(' ');
    const wordCount = totalText.split(/\s+/).length;
    
    const script: Script = {
      sections,
      sources,
      word_count: wordCount,
    };
    
    Logger.info('Script complete', {
      word_count: wordCount,
      sections: sections.length,
      sources: sources.length,
    });
    
    return { script };
  }
  
  /**
   * Write ALL sections in a single API call (batch processing)
   */
  private async writeAllSections(
    outlineSections: any[],
    sourceMap: Map<string, Source>,
    storyToSourceId: Map<string, string>,
    date: string,
    listenerName: string
  ): Promise<ScriptSection[]> {
    // Build comprehensive prompt for all sections
    const sectionsPrompt = outlineSections.map((section, idx) => {
      const picks = section.picks || [];
      const picksSummary = picks
        .map((pickId: string) => {
          const story = Array.from(sourceMap.values())
            .find(s => s.id === storyToSourceId.get(pickId));
          return story ? `[${storyToSourceId.get(pickId)}] ${story.title}` : '';
        })
        .filter(Boolean)
        .join('\n');

      return `
SECTION ${idx + 1}: ${section.type}
Duration Target: ${section.duration_sec || 60} seconds
Stories:
${picksSummary || 'No specific stories (intro/outro)'}
Guidance: ${section.guidance || 'Follow general style guidelines'}
---`;
    }).join('\n\n');

    const allSources = Array.from(sourceMap.values())
      .map((source, idx) => `[${idx + 1}] ${source.title} - ${source.url}`)
      .join('\n');

    const userPrompt = `Generate a complete radio script for ${listenerName}'s daily news brief on ${date}.

SOURCES:
${allSources}

OUTLINE:
${sectionsPrompt}

Respond with a JSON object:
{
  "sections": [
    {
      "type": "cold-open" | "story" | "sign-off",
      "text": "Complete script text with [citations]",
      "duration_estimate_sec": 60,
      "word_count": 150
    }
  ]
}

Each section should:
- Match the type and duration target from the outline
- Cite sources inline using [1], [2], etc.
- Use conversational tone with stage directions like (warmly), (pause)
- Flow naturally into the next section
- Be engaging and concise`;

    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        responseFormat: 'json_object',
        maxTokens: 8000,
      }
    );

    const parsed = JSON.parse(response);
    
    // Map back to ScriptSection format
    return parsed.sections.map((section: any, idx: number) => ({
      type: section.type,
      text: section.text,
      duration_estimate_sec: section.duration_estimate_sec || 60,
      word_count: section.word_count || section.text.split(/\s+/).length,
      citations: this.extractCitations(section.text),
    }));
  }

  /**
   * Legacy method: Write a single section (kept for backward compatibility)
   */
  private async writeSection(
    section: any,
    sourceMap: Map<string, Pick>,
    storyToSourceId: Map<string, number>,
    date: string,
    listenerName: string
  ): Promise<ScriptSection> {
    const storyDetails = section.refs
      .map((storyId: string) => {
        const pick = sourceMap.get(storyId);
        if (!pick) return null;
        
        const sourceId = storyToSourceId.get(storyId);
        return {
          id: storyId,
          sourceId,
          topic: pick.topic,
          title: pick.story.title,
          summary: pick.story.summary || '',
          source: pick.story.source,
        };
      })
      .filter(Boolean);
    
    const prompt = `Write the "${section.type}" section for ${date} morning brief for ${listenerName}.

Target words: ${section.target_words}
Section title: ${section.title}

${storyDetails.length > 0 ? `Stories to cover:\n${JSON.stringify(storyDetails, null, 2)}` : 'No specific stories - write introduction/transition.'}

${section.type === 'cold-open' ? `Start with: "Good morning, ${listenerName}!"` : ''}
${section.type === 'sign-off' ? `End with a warm sign-off wishing ${listenerName} a great day.` : ''}

Remember:
- Be conversational and engaging
- Cite sources as [n] where n is the sourceId
- Include stage directions in parentheses
- Add natural pauses with [beat 300ms] or similar
- Stay within word target ± 20%

Respond with JSON:
{
  "text": "The complete script text with citations [1], stage directions (warmly), and pauses [beat 300ms]"
}`;
    
    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      { responseFormat: 'json_object', maxTokens: section.target_words * 3 }
    );
    
    const result = JSON.parse(response);
    
    // Extract citation references from text
    const refs: number[] = [];
    const citationPattern = /\[(\d+)\]/g;
    let match;
    while ((match = citationPattern.exec(result.text)) !== null) {
      const refId = parseInt(match[1], 10);
      if (!refs.includes(refId)) {
        refs.push(refId);
      }
    }
    
    return {
      type: section.type,
      text: result.text,
      refs,
    };
  }
}

