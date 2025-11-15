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
  target_duration_sec?: number;
  podcast_production?: {
    intro_text: string;
    outro_text: string;
    style: 'executive' | 'casual' | 'technical';
  };
}

export interface ScriptwriterOutput {
  script: Script;
  detailed_report: {
    sections_generated: number;
    total_word_count: number;
    full_script_text: string;
    citations_used: number[];
  };
}

export class ScriptwriterAgent extends BaseAgent<ScriptwriterInput, ScriptwriterOutput> {
  constructor() {
    super({
      name: 'ScriptwriterAgent',
      // System prompt is now built dynamically in process() method
      // to include actual target duration and word count from dashboard
      systemPrompt: `You are a professional news briefing writer.

CRITICAL: Use SPECIFIC DETAILS from the story summaries provided. Mention company names, product names, numbers, dates, and key facts. DO NOT write generic summaries.

You must respond with valid JSON only.`,
      temperature: 0.8,
      maxTokens: 4000, // GPT-4-turbo max is 4096
    });
  }
  
  protected async process(input: ScriptwriterInput): Promise<ScriptwriterOutput> {
    const { outline, picks, date, listener_name, target_duration_sec, podcast_production } = input;
    
    // Calculate target word count (assume ~150 words per minute for professional speaking)
    const durationMin = (target_duration_sec || 900) / 60;
    const targetWordCount = Math.round(durationMin * 150);
    const wordCountRange = `${Math.floor(targetWordCount * 0.9)}-${Math.ceil(targetWordCount * 1.1)}`;
    
    // Get style from dashboard settings
    const style = podcast_production?.style || 'executive';
    
    Logger.info('Writing script', { 
      sections: outline.sections.length,
      target_duration_min: durationMin.toFixed(1),
      target_word_count: targetWordCount,
      style,
    });
    
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
      listener_name,
      wordCountRange,
      style
    );
    
    // Calculate total word count
    const totalText = sections.map(s => s.text).join(' ');
    const wordCount = totalText.split(/\s+/).length;
    
    const script: Script = {
      sections,
      sources,
      word_count: wordCount,
    };
    
    // Collect all citations used
    const allCitations = new Set<number>();
    sections.forEach(section => {
      if ((section as any).citations) {
        (section as any).citations.forEach((c: number) => allCitations.add(c));
      }
    });
    
    // Build full script text with section labels
    const fullScriptText = sections
      .filter(section => section && section.text) // Filter out invalid sections
      .map((section, idx) => {
        return `[SECTION ${idx + 1}: ${section.type.toUpperCase()}]\n${section.text}\n`;
      }).join('\n');
    
    Logger.info('Script complete', {
      word_count: wordCount,
      sections: sections.length,
      sources: sources.length,
      citations: Array.from(allCitations),
    });
    
    return { 
      script,
      detailed_report: {
        sections_generated: sections.length,
        total_word_count: wordCount,
        full_script_text: fullScriptText,
        citations_used: Array.from(allCitations).sort((a, b) => a - b),
      },
    };
  }
  
  /**
   * Write ALL sections in a single API call (batch processing)
   */
  private async writeAllSections(
    outlineSections: any[],
    sourceMap: Map<string, Pick>,  // Fixed: This is actually a map of Pick objects
    storyToSourceId: Map<string, number>,  // Fixed: Source IDs are numbers
    date: string,
    listenerName: string,
    wordCountRange?: string,
    style?: string
  ): Promise<ScriptSection[]> {
    // Build comprehensive prompt for all sections with FULL story content
    const sectionsPrompt = outlineSections.map((section, idx) => {
      // CRITICAL FIX: Outline sections have 'refs' (story IDs), not 'picks'!
      const storyIds = section.refs || [];
      const picksSummary = storyIds
        .map((storyId: string) => {
          const pick = sourceMap.get(storyId);  // Use .get() since sourceMap is keyed by story_id
          if (!pick) return '';
          
          const sourceId = storyToSourceId.get(storyId);  // Fixed: use storyId not pickId
          const story = pick.story;
          
          // Include FULL story content: prefer scraped full article (raw), fallback to RSS summary
          const content = story.raw && story.raw.length > 500 
            ? `Full Article: ${story.raw}` 
            : `Summary: ${story.summary || 'No summary available'}`;
          
          return `[${sourceId}] ${story.title}
Topic: ${story.topic || 'General'}
${content}
Source: ${story.source}
URL: ${story.url}`;
        })
        .filter(Boolean)
        .join('\n\n');

      // Convert target_words to duration_sec (assuming ~150 words per minute = 2.5 words per second)
      const targetDurationSec = section.target_words ? Math.round(section.target_words / 2.5) : 60;

      return `
SECTION ${idx + 1}: ${section.type}
Target: ${section.target_words || 150} words (~${targetDurationSec} seconds)
Stories to cover:
${picksSummary || 'No specific stories (intro/outro)'}
Guidance: ${section.guidance || 'Follow general style guidelines'}
---`;
    }).join('\n\n');

    const allSources = Array.from(sourceMap.values())
      .map((source, idx) => `[${idx + 1}] ${(source as any).title} - ${(source as any).url}`)
      .join('\n');

    // Build style guidance based on dashboard settings
    const styleGuidance = style === 'executive' 
      ? '- EXECUTIVE TONE: Direct, authoritative, no hedging\n- NO FILLER: Eliminate "actually," "basically," "pretty," "kind of"\n- NO SMALL TALK: Skip "Good morning," "Let\'s talk about," "Moving on"\n- Dense information - every word counts\n- Fast-paced - minimal pauses'
      : style === 'technical'
      ? '- TECHNICAL TONE: Detailed, analytical, precise\n- Include technical terminology and specifications\n- Explain mechanisms and processes\n- Focus on how things work, not just what happened'
      : '- CONVERSATIONAL TONE: Friendly, engaging, relatable\n- Use natural language and examples\n- Explain context and implications\n- Make complex topics accessible';
    
    const userPrompt = `Generate a news briefing for ${listenerName} on ${date}.

${wordCountRange ? `**CRITICAL: TARGET WORD COUNT: ${wordCountRange} words total**
This is NOT a suggestion - the total script MUST be within this range.` : 'Keep it concise and impactful.'}

SOURCES WITH FULL DETAILS:
${allSources}

OUTLINE WITH STORY SUMMARIES (each section shows target word count):
${sectionsPrompt}

Respond with a JSON object:
{
  "sections": [
    {
      "type": "cold-open" | "story" | "sign-off",
      "text": "Direct, fact-dense text with [citations]",
      "duration_estimate_sec": 50,
      "word_count": 120
    }
  ]
}

Each section MUST:
- MATCH the target word count shown in the outline above (±10 words is acceptable)
- COLD-OPEN: Strong opening that immediately engages
- STORY: Lead with impact, then specific details
  * END each story section (except the last) with a natural, brief transition to the next story
  * Transition examples: "Speaking of innovation...", "In related news...", "Shifting gears to...", "Meanwhile..."
  * Keep transitions SHORT (5-10 words max) and conversational - they should flow naturally
- SIGN-OFF: Brief summary of key takeaways
- Use SPECIFIC DETAILS: exact numbers, names, products, dates from summaries
- Cite sources inline using [1], [2], etc.
${styleGuidance}

**REMINDER: Total word count must be ${wordCountRange || '500-700'} words.**`;

    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        responseFormat: 'json_object',
        maxTokens: 4000, // GPT-4-turbo max is 4096
      }
    );

    const parsed = JSON.parse(response);
    
    // Validate response structure
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      Logger.error('Invalid scriptwriter response: missing sections array');
      throw new Error('Scriptwriter returned invalid response format');
    }
    
    // Map back to ScriptSection format with null safety
    return parsed.sections
      .filter((section: any) => section && section.text) // Filter out null/invalid sections
      .map((section: any, idx: number) => {
        const actualWordCount = section.word_count || section.text.split(/\s+/).length;
        // Calculate duration from actual word count (150 words/min = 2.5 words/sec)
        const calculatedDuration = Math.round(actualWordCount / 2.5);
        
        return {
          type: section.type || 'story',
          text: section.text,
          duration_estimate_sec: calculatedDuration,
          word_count: actualWordCount,
          citations: this.extractCitations(section.text),
        };
      });
  }

  /**
   * Extract citation numbers from text like [1], [2], etc.
   */
  private extractCitations(text: string): number[] {
    const citations: number[] = [];
    const citationPattern = /\[(\d+)\]/g;
    let match;
    while ((match = citationPattern.exec(text)) !== null) {
      const refId = parseInt(match[1], 10);
      if (!citations.includes(refId)) {
        citations.push(refId);
      }
    }
    return citations;
  }

  /**
   * Legacy method: Write a single section (kept for backward compatibility)
   */
  private async writeSection(
    section: any,
    sourceMap: Map<string, Pick>,
    storyToSourceId: Map<string, number>,
    date: string,
    listenerName: string,
    isLastStorySection: boolean = false
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
    
    // Build transition guidance for story sections
    let transitionGuidance = '';
    if (section.type === 'story' && !isLastStorySection) {
      transitionGuidance = `\n- END with a brief, natural transition phrase that smoothly leads to the next story
- Transition examples: "Speaking of innovation...", "In related news...", "Shifting gears to...", "Meanwhile...", "On a similar note..."
- Keep transitions SHORT (5-10 words) and conversational`;
    }
    
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
- Stay within word target ± 20%${transitionGuidance}

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

