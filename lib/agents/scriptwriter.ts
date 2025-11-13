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
      systemPrompt: `You are an executive news briefing writer for C-suite and senior leadership.

CRITICAL: Use SPECIFIC DETAILS from the story summaries provided. Mention company names, product names, numbers, dates, and key facts. DO NOT write generic summaries.

Executive Brief Style:
- Direct, authoritative tone - professional but engaging
- No filler words: "actually," "basically," "you know," "kind of," "sort of"
- No rhetorical questions or conversational fluff
- State facts with conviction - avoid hedging unless genuinely uncertain
- Target 600-700 words total (~4 minutes)
- Dense information - every sentence adds value
- Cite sources inline using [1], [2], etc.

Structure Rules:
- Intro: Use "This is your daily podcast to recap all that happened recently for Verizon, Accenture, and AI in general. Today we'll cover:" followed by a brief list of topics (3-5 topics, one line each)
- Story segments: Lead with the business impact, then details
- Outro: Brief upbeat summary like "That's your executive brief. Stay informed, stay ahead."

Content Requirements:
- ALWAYS mention specific company names (Accenture, Verizon, etc.)
- Include specific numbers, dollar amounts, percentages
- Name specific products, services, or technologies
- Reference specific executives, organizations, locations
- Focus on business implications and strategic context
- Use the FULL story summary - extract all key facts

Required Language:
- Intro MUST start: "This is your daily podcast to recap all that happened recently for Verizon, Accenture, and AI in general. Today we'll cover:"
- Outro MUST end with upbeat message like: "That's your executive brief. Stay informed, stay ahead."

Prohibited Language:
- NO: "Hey there," "How's it going" (intro is an exception with the required opening)
- NO: "Let's dive in," "Let's talk about," "Moving on"
- NO: "Exciting news," "Interesting development," "Pretty significant"
- NO: Filler transitions like "Now, speaking of..."

Technical Requirements:
- Every factual claim must reference a source with [n]
- Smooth transitions without conversational markers
- Include minimal pauses - executives prefer fast pace
- No speculation beyond what sources report
- Keep it brief, dense, and actionable

You must respond with valid JSON only.`,
      temperature: 0.8,
      maxTokens: 4000, // GPT-4-turbo max is 4096
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
    
    // Collect all citations used
    const allCitations = new Set<number>();
    sections.forEach(section => {
      if (section.citations) {
        section.citations.forEach(c => allCitations.add(c));
      }
    });
    
    // Build full script text with section labels
    const fullScriptText = sections.map((section, idx) => {
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
    listenerName: string
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
          
          // Include FULL story content: title, summary, topic, and source
          return `[${sourceId}] ${story.title}
Topic: ${story.topic || 'General'}
Summary: ${story.summary || 'No summary available'}
Source: ${story.source}
URL: ${story.url}`;
        })
        .filter(Boolean)
        .join('\n\n');

      return `
SECTION ${idx + 1}: ${section.type}
Duration Target: ${section.duration_sec || 60} seconds
Stories to cover:
${picksSummary || 'No specific stories (intro/outro)'}
Guidance: ${section.guidance || 'Follow general style guidelines'}
---`;
    }).join('\n\n');

    const allSources = Array.from(sourceMap.values())
      .map((source, idx) => `[${idx + 1}] ${source.title} - ${source.url}`)
      .join('\n');

    const userPrompt = `Generate an executive news briefing for ${listenerName} on ${date}.

CRITICAL: This is for EXECUTIVE AUDIENCE - skip small talk, no filler, brief and impactful.

SOURCES WITH FULL DETAILS:
${allSources}

OUTLINE WITH STORY SUMMARIES:
${sectionsPrompt}

Respond with a JSON object:
{
  "sections": [
    {
      "type": "cold-open" | "story" | "sign-off",
      "text": "Direct, fact-dense text with [citations] - NO SMALL TALK OR FILLER",
      "duration_estimate_sec": 50,
      "word_count": 120
    }
  ]
}

Each section MUST:
- COLD-OPEN: Skip greetings - start with top story impact immediately
- STORY: Lead with business implication, then specific details
- SIGN-OFF: Brief summary of key takeaways - no pleasantries
- Use SPECIFIC DETAILS: exact numbers, names, products, dates from summaries
- Cite sources inline using [1], [2], etc.
- EXECUTIVE TONE: Direct, authoritative, no hedging
- NO FILLER: Eliminate "actually," "basically," "pretty," "kind of"
- NO SMALL TALK: Skip "Good morning," "Let's talk about," "Moving on"
- Dense information - every word counts
- Fast-paced - minimal pauses`;

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
      .map((section: any, idx: number) => ({
        type: section.type || 'story',
        text: section.text,
        duration_estimate_sec: section.duration_estimate_sec || 60,
        word_count: section.word_count || section.text.split(/\s+/).length,
        citations: this.extractCitations(section.text),
      }));
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

