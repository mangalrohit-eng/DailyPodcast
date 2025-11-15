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
      systemPrompt: `You are a podcast host creating engaging, conversational news content.

YOUR VOICE:
- Talk like you're explaining news to a friend over coffee
- Natural, warm, and engaging - not robotic or formal
- Use contractions (don't, can't, it's, they're, we're)
- React naturally to stories (interesting, surprising, concerning)

CRITICAL REQUIREMENTS:
- Use SPECIFIC DETAILS: company names, numbers, dates, exact facts
- EXPLAIN WHY IT MATTERS - don't just say what happened
- Add personal commentary: "Here's what's interesting...", "Think about it...", "Now, here's the thing..."
- Use rhetorical questions to engage listeners
- Draw connections between stories
- Avoid corporate jargon (leverage, synergy, ecosystem, paradigm)
- Sound human, not like a press release

STYLE EXAMPLES:
❌ BAD: "The company announced a strategic restructuring initiative"
✅ GOOD: "So they're restructuring - basically saying 'we need to change how we do things'"

❌ BAD: "This development represents a significant advancement"
✅ GOOD: "This is huge - think of it like going from dial-up to fiber internet"

❌ BAD: "Moving on to our next story..."
✅ GOOD: "Now here's where it gets interesting..."

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
      : `- CONVERSATIONAL TONE: Like talking to a friend
- START SECTIONS: "Alright, so...", "Now check this out...", "Here's what happened..."
- USE CONTRACTIONS: don't, can't, it's, they're, we're, that's
- ADD REACTIONS: "That's huge", "Interesting right?", "Pretty wild"
- ASK QUESTIONS: "Why does this matter?", "What's the big deal?"
- EXPLAIN PLAINLY: Replace jargon with simple words
- PERSONAL TOUCH: "Think about it...", "Here's the thing...", "You know what's interesting?"
- BE SPECIFIC: Use real numbers, names, facts
- NO CORPORATE SPEAK: Avoid "leverage", "synergy", "ecosystem", "strategic initiatives"
- SOUND HUMAN: Natural pauses, incomplete thoughts, emphasis`;
    
    const userPrompt = `Generate a news briefing for a general audience on ${date}.

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
  * NO personalized names - use "Hey there", "Welcome", "Alright", or just dive right in
  * Generic greetings only - this is for a general audience
- STORY: Lead with impact, then specific details
  * END each story section (except the last) with a natural, brief transition to the next story
  * Transition examples: "Speaking of innovation...", "In related news...", "Shifting gears to...", "Meanwhile..."
  * Keep transitions SHORT (5-10 words max) and conversational - they should flow naturally
- SIGN-OFF: Brief summary of key takeaways
  * NO personalized names - use "Have a great day", "That's it for today", "Catch you later", etc.
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
        
        // Apply conversational enhancements to the text
        const enhancedText = this.makeConversational(section.text, section.type);
        
        return {
          type: section.type || 'story',
          text: enhancedText,
          duration_estimate_sec: calculatedDuration,
          word_count: actualWordCount,
          citations: this.extractCitations(enhancedText),
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
    
    // Build guidance based on section type
    let sectionGuidance = '';
    if (section.type === 'intro') {
      sectionGuidance = `
INTRO SECTION - Your opening must:
- Use a warm, engaging greeting (NO personalized names - use "Hey there", "Welcome", "Alright", or just dive in)
- Preview the day's THEMES (not individual stories) in an engaging way
- Set the tone: authoritative but conversational, energizing but professional`;
    } else if (section.type === 'segment' && storyDetails.length > 1) {
      sectionGuidance = `
THEMATIC SEGMENT - You are weaving ${storyDetails.length} related stories into ONE cohesive narrative:
- DO NOT cover stories sequentially or separately
- BLEND them: show how they connect, what they mean together, cause and effect
- Draw insights that emerge from seeing these stories as part of a larger pattern
- Use transitions within the narrative (not between stories): "This connects to...", "Which explains why...", "The broader pattern here..."
- Write as one flowing narrative with strategic synthesis`;
    } else if (section.type === 'outro') {
      sectionGuidance = `
OUTRO SECTION - Your closing must:
- Synthesize key strategic takeaways from today's brief
- Forward-looking insight: what to watch
- Warm, energizing sign-off (NO personalized names - use "Have a great day", "That's it for today", "Catch you tomorrow", etc.)`;
    } else if (section.type === 'story' || section.type === 'segment') {
      sectionGuidance = `
STORY SECTION - Cover this story with:
- Specific details and business implications
- Strategic context for executives`;
      if (!isLastStorySection) {
        sectionGuidance += `
- END with a brief, natural transition (5-10 words): "Speaking of innovation...", "In related news...", "Meanwhile..."`;
      }
    }
    
    const prompt = `Write the "${section.type}" section titled "${section.title}" for ${date} morning brief.

Target words: ${section.target_words} (±20%)
${sectionGuidance}

${storyDetails.length > 0 ? `Stories/Sources:\n${JSON.stringify(storyDetails, null, 2)}` : 'No specific stories - write introduction/transition.'}

WRITING STYLE:
- Conversational and engaging - sound natural, not scripted
- Dense with specific facts: company names, numbers, dates, product names
- Cite sources as [n] where n is the sourceId (CRITICAL: cite every claim)
- Include stage directions in parentheses: (warmly), (seriously), (with energy)
- Add natural pauses: [beat 300ms], [beat 500ms]
- Executive audience: strategic implications, business context

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

  /**
   * Post-process script text to make it more conversational
   */
  private makeConversational(text: string, sectionType?: string): string {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let enhanced = text;

    // 1. Add natural contractions
    enhanced = enhanced
      .replace(/\bcannot\b/g, "can't")
      .replace(/\bwill not\b/g, "won't")
      .replace(/\bdid not\b/g, "didn't")
      .replace(/\bdo not\b/g, "don't")
      .replace(/\bdoes not\b/g, "doesn't")
      .replace(/\bhave not\b/g, "haven't")
      .replace(/\bhas not\b/g, "hasn't")
      .replace(/\bhad not\b/g, "hadn't")
      .replace(/\bwould not\b/g, "wouldn't")
      .replace(/\bcould not\b/g, "couldn't")
      .replace(/\bshould not\b/g, "shouldn't")
      .replace(/\bare not\b/g, "aren't")
      .replace(/\bis not\b/g, "isn't")
      .replace(/\bwas not\b/g, "wasn't")
      .replace(/\bwere not\b/g, "weren't")
      .replace(/\bwe are\b/g, "we're")
      .replace(/\bthey are\b/g, "they're")
      .replace(/\bwe will\b/g, "we'll")
      .replace(/\bthey will\b/g, "they'll")
      .replace(/\bit will\b/g, "it'll")
      .replace(/\bthat will\b/g, "that'll")
      .replace(/\bI am\b/g, "I'm")
      .replace(/\byou are\b/g, "you're")
      .replace(/\bhe is\b/g, "he's")
      .replace(/\bshe is\b/g, "she's")
      .replace(/\bit is\b/g, "it's")
      .replace(/\bthat is\b/g, "that's")
      .replace(/\bwhat is\b/g, "what's")
      .replace(/\bwhere is\b/g, "where's")
      .replace(/\bwho is\b/g, "who's")
      .replace(/\bhow is\b/g, "how's")
      .replace(/\bthere is\b/g, "there's")
      .replace(/\blet us\b/g, "let's");

    // 2. Remove corporate jargon
    enhanced = enhanced
      .replace(/\bleveraging\b/gi, "using")
      .replace(/\bleverage\b/gi, "use")
      .replace(/\bsynergies\b/gi, "benefits")
      .replace(/\bsynergy\b/gi, "benefit")
      .replace(/\becosystem\b/gi, "market")
      .replace(/\bparadigm shift\b/gi, "big change")
      .replace(/\bparadigm\b/gi, "approach")
      .replace(/\butilize\b/gi, "use")
      .replace(/\bfacilitate\b/gi, "help")
      .replace(/\boptimize\b/gi, "improve")
      .replace(/\bstreamline\b/gi, "simplify")
      .replace(/\bimpactful\b/gi, "important")
      .replace(/\brobust\b/gi, "strong")
      .replace(/\bscalable\b/gi, "expandable")
      .replace(/\bat this point in time\b/gi, "now")
      .replace(/\bin order to\b/gi, "to")
      .replace(/\bdue to the fact that\b/gi, "because")
      .replace(/\bfor the purpose of\b/gi, "to")
      .replace(/\bin the event that\b/gi, "if")
      .replace(/\bprior to\b/gi, "before")
      .replace(/\bsubsequent to\b/gi, "after");

    // 3. Make sentences more natural
    enhanced = enhanced
      .replace(/^Today, /g, "So today, ")
      .replace(/^This represents/g, "This is")
      .replace(/^The company announced/g, "They just announced")
      .replace(/^The company reported/g, "They're reporting")
      .replace(/^Officials stated/g, "Officials say")
      .replace(/^According to/g, "According to")
      .replace(/Moving on to /gi, "Now, ")
      .replace(/In conclusion, /gi, "So, ")
      .replace(/Furthermore, /gi, "Also, ")
      .replace(/Moreover, /gi, "Plus, ")
      .replace(/Additionally, /gi, "And ")
      .replace(/However, /gi, "But ")
      .replace(/Nevertheless, /gi, "Still, ")
      .replace(/Therefore, /gi, "So ")
      .replace(/Consequently, /gi, "As a result, ");

    // 4. Simplify verbose phrases
    enhanced = enhanced
      .replace(/\ba significant number of\b/gi, "many")
      .replace(/\ba majority of\b/gi, "most")
      .replace(/\bthe majority of\b/gi, "most")
      .replace(/\bat the present time\b/gi, "now")
      .replace(/\bin the near future\b/gi, "soon")
      .replace(/\bin light of the fact that\b/gi, "since")
      .replace(/\bwith regard to\b/gi, "about")
      .replace(/\bwith respect to\b/gi, "about")
      .replace(/\bconcerning the matter of\b/gi, "about")
      .replace(/\btake into consideration\b/gi, "consider")
      .replace(/\bmake an announcement\b/gi, "announce")
      .replace(/\bcome to a decision\b/gi, "decide")
      .replace(/\bprovide assistance\b/gi, "help")
      .replace(/\bmake a recommendation\b/gi, "recommend");

    // 5. Add emphasis for key numbers (but preserve citations [1], [2])
    // Only emphasize standalone numbers, not those in brackets
    enhanced = enhanced.replace(/(?<!\[)\b(\d+%|\$\d+[BMK]?|\d+,?\d* (million|billion|thousand))\b(?!\])/gi, (match) => {
      return `${match}`;  // Keep as-is but could add emphasis markers if needed
    });

    Logger.debug('Applied conversational enhancements', {
      section_type: sectionType,
      original_length: text.length,
      enhanced_length: enhanced.length,
      sample: enhanced.substring(0, 100),
    });

    return enhanced;
  }
}

