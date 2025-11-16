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
      systemPrompt: `You are an executive news analyst delivering high-density business intelligence.

YOUR MISSION:
- Deliver comprehensive information with full context
- Every sentence must inform a business decision
- Lead with numbers and concrete facts
- State direct implications, not vague observations
- Provide thorough analysis - don't sacrifice depth for brevity
- Hit the target word count by expanding on context, implications, and analysis

CRITICAL REQUIREMENTS FOR EXECUTIVE BRIEFINGS:
- NUMBERS FIRST: "$20B investment", "15,000 jobs", "Q3 up 23%"
- DIRECT STATEMENTS: "Verizon's cutting 10,000 jobs to fund AI" not "announced workforce optimization"
- CLEAR IMPLICATIONS: "This means your cloud costs will rise 15% in Q2"
- ZERO FLUFF: Cut philosophy, narratives, balances, imperatives
- ACTIONABLE INSIGHTS: "Watch competitor announcements next 30 days"
- SHARP CONCLUSIONS: Specific predictions, not vague takeaways

BANNED PHRASES (executives hate these):
❌ "delicate balance" ❌ "broader narrative" ❌ "strategic imperatives"
❌ "navigate the landscape" ❌ "paradigm shift" ❌ "going forward"
❌ "at the end of the day" ❌ "it remains to be seen"

GOOD EXAMPLES:
✅ "Verizon's cutting 15,000 jobs - $2M per job going to AI infrastructure. That's the biggest workforce pivot this year."
✅ "OpenAI raised $6B at $157B valuation. Up 75% from six months ago. That's faster than Meta's Series B."
✅ "Bottom line: AI spending accelerating, not slowing. Expect similar announcements from Cisco, Oracle in 30-60 days."

BAD EXAMPLES (too vague):
❌ "This underscores the delicate balance between innovation and efficiency"
❌ "The broader narrative speaks to the relentless pace of evolution"
❌ "Leaders must navigate an increasingly complex landscape"

You must respond with valid JSON only.`,
      temperature: 0.9, // Higher temp = more verbose, less concise
      maxTokens: 8000, // Increased to allow longer scripts (was 4000)
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
    
    let sections = await this.writeAllSections(
      outline.sections,
      sourceMap,
      storyToSourceId,
      date,
      listener_name,
      wordCountRange,
      targetWordCount, // FIX: Pass targetWordCount so it's available in the method
      style,
      outline.opening_hook // Pass the compelling hook from outline
    );
    
    // Assign voices to each section and add transitions
    try {
      sections = this.assignVoicesAndTransitions(sections);
      Logger.info('Voice assignment complete', {
        total_sections: sections.length,
        section_types: sections.map(s => s.type),
      });
    } catch (error) {
      Logger.error('Failed to assign voices and transitions', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        sections_count: sections?.length || 0,
      });
      // Continue without voice assignments rather than failing the entire run
      Logger.warn('Continuing without voice assignments due to error');
    }
    
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
    targetWordCount?: number, // FIX: Add targetWordCount parameter to fix ReferenceError
    style?: string,
    openingHook?: string // Compelling hook from outline agent
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

      // Build section-specific guidance
      let sectionGuidance = section.guidance || 'Follow general style guidelines';
      
      // Add connection guidance if available
      if (section.bridge) {
        sectionGuidance += `\n\n**STORY CONNECTIONS** (${section.connection_type || 'thematic'}):
${section.bridge}

Use this to weave the stories together seamlessly. Don't just list them - show how they connect!`;
      }

      return `
SECTION ${idx + 1}: ${section.type} - "${section.title}"
Target: ${section.target_words || 150} words (~${targetDurationSec} seconds)
Stories to cover:
${picksSummary || 'No specific stories (intro/outro)'}

Guidance: ${sectionGuidance}
---`;
    }).join('\n\n');

    const allSources = Array.from(sourceMap.values())
      .map((source, idx) => `[${idx + 1}] ${(source as any).title} - ${(source as any).url}`)
      .join('\n');

    // Build style guidance based on dashboard settings
    const styleGuidance = style === 'executive' 
      ? `- EXECUTIVE TONE: Sharp, factual, zero fluff
- LEAD WITH NUMBERS: "$500M investment", "15,000 jobs", "Q3 revenue up 23%"
- STATE IMPLICATIONS: "This means X will happen" not "This represents a shift in..."
- BE DIRECT: "Verizon's betting $20B on AI" not "Verizon announced a strategic initiative..."
- NO HEDGING: Eliminate "could," "might," "potentially," "appears to," "seems to"
- NO FILLER: Cut "actually," "basically," "essentially," "kind of," "sort of"
- NO PHILOSOPHY: Cut "delicate balance," "broader narrative," "strategic imperatives"
- NO CORPORATE SPEAK: Cut "navigate," "landscape," "paradigm," "synergy," "leverage"
- MAKE IT ACTIONABLE: "Watch for X," "This affects your Q1 budget," "Expect competitor moves"
- SHARP CONCLUSIONS: Specific predictions or clear takeaways, not vague observations
- EVERY SENTENCE EARNS ITS PLACE: If it doesn't inform a decision, cut it`
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

${wordCountRange ? `🚨 **ABSOLUTE REQUIREMENT - WORD COUNT: ${wordCountRange} words TOTAL** 🚨

THIS IS NON-NEGOTIABLE. The script MUST hit this word count:
- Target range: ${wordCountRange} words
- DO NOT write a shorter script "to be concise" - that will FAIL
- DO NOT summarize - EXPAND with details, context, implications
- Each section has a target word count - HIT THOSE TARGETS
- If you write fewer than ${Math.floor((targetWordCount || 750) * 0.9)} words, you have FAILED
- Add more context, more details, more implications to reach the target
- Being thorough is MORE important than being brief

STRATEGIES TO REACH WORD COUNT:
✅ Add business context and background
✅ Explain implications in detail ("This means X, which leads to Y, resulting in Z")
✅ Include specific numbers, dates, names, quotes from sources
✅ Compare to past events or competitors
✅ Discuss what to watch for next
✅ Add analyst perspectives and interpretations
✅ Explain the "why" and "so what" thoroughly

❌ DO NOT write a 300-400 word script when 1500 words are required!` : 'Keep it concise and impactful.'}

${openingHook ? `🎣 **OPENING HOOK** (Use this to start your intro):
"${openingHook}"

This is your most compelling angle - lead with this immediately to grab attention!
` : ''}

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
- COLD-OPEN: ${openingHook ? '**START WITH THE HOOK ABOVE!** Then preview themes.' : 'Strong opening that immediately engages'}
  * NO personalized names - use "Hey there", "Welcome", "Alright", or just dive right in
  * Generic greetings only - this is for a general audience
  ${openingHook ? '* The hook provides your opening punch - use it as the VERY FIRST THING you say' : ''}
- STORY SEGMENTS: Weave stories together using the **STORY CONNECTIONS** guidance provided
  * DON'T just list stories one by one
  * SHOW how they connect using the bridge guidance
  * Use the connection_type (cause-effect, common-theme, etc.) to guide your narrative flow
  * END each segment (except the last) with a natural transition to the next theme
  * Transition examples: "And this connects to...", "Meanwhile...", "But here's where it gets interesting..."
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
        
        // Apply conversational enhancements ONLY if not executive style
        // Executive style stays sharp and direct - no softening
        const enhancedText = style === 'executive' 
          ? section.text 
          : this.makeConversational(section.text, section.type);
        
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
OUTRO SECTION - BE DIRECT AND CONVERSATIONAL. NO CORPORATE FLUFF.

ABSOLUTELY FORBIDDEN PHRASES (NEVER USE):
- "strategic positioning" / "strategic imperatives" / "strategic landscape"
- "broader narrative" / "broader implications" / "broader context"
- "delicate balance" / "carefully navigating"
- "rapidly shifting environment" / "evolving landscape"
- "valuable insights" / "key takeaways"
- "closely monitor" / "keep a close eye on"
- "as we move forward" / "going forward"
- Any vague corporate-speak or MBA jargon

REQUIRED STYLE - SHORT, FACTUAL, DIRECT:
✅ GOOD: "We'll keep you updated on those Verizon layoffs as we know more. That's it for now!"
✅ GOOD: "Earnings calls next week should give us more details. See you tomorrow."
✅ GOOD: "We'll see how OpenAI spends that $6 billion. More updates soon."
✅ GOOD: "The FCC ruling takes effect in 30 days. We'll watch what happens. That's all for today!"

❌ BAD: "Executives should closely monitor these developments, as they offer valuable insights into strategic positioning and investor expectations in a rapidly shifting corporate environment."
❌ BAD: "These trends underscore the importance of maintaining strategic agility in an evolving landscape."
❌ BAD: "We'll continue to track these developments as they unfold across the broader industry."

FORMULA:
1. One specific forward-looking sentence about what to watch (optional)
   - Example: "Earnings call next Tuesday should reveal more."
   - Example: "We'll hear more about those layoffs by next week."
2. Simple sign-off (required)
   - "That's it for now!" / "That's all for today!" / "See you tomorrow!" / "More soon!"

MAX LENGTH: 2-3 sentences total. Keep it crisp. No rambling.`;
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

  /**
   * Assign voices to sections and insert transitions when voice changes
   */
  private assignVoicesAndTransitions(sections: ScriptSection[]): ScriptSection[] {
    // Safety check - ensure sections is a valid array
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      Logger.warn('assignVoicesAndTransitions received invalid sections', {
        is_array: Array.isArray(sections),
        length: sections?.length || 0,
      });
      return sections || [];
    }
    
    const result: ScriptSection[] = [];
    let previousRole: string | null = null;
    let previousVoice: string | null = null;

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      // Safety check - skip invalid sections
      if (!section || !section.text || typeof section.text !== 'string') {
        Logger.warn('Skipping section with invalid text in assignVoicesAndTransitions', {
          section_index: i,
          has_section: !!section,
          has_text: !!(section?.text),
          text_type: typeof section?.text,
        });
        continue;
      }
      
      // Select voice based on content and section type
      const { voice, role } = this.selectVoiceForContent(section.text, section.type);
      
      // Assign voice and role to this section
      section.voice = voice;
      section.role = role;
      
      // Add transition if voice is changing (skip for first section and cold-open/sign-off)
      if (
        i > 0 && 
        previousRole && 
        previousVoice &&
        role !== previousRole &&
        section.type !== 'cold-open' &&
        section.type !== 'sign-off'
      ) {
        const transitionText = this.generateTransition(previousRole, role);
        
        // Create transition section - spoken by PREVIOUS voice handing off
        const transitionSection: ScriptSection = {
          type: 'transition',
          text: transitionText,
          refs: [],
          voice: previousVoice as any,
          role: previousRole as any,
        };
        
        result.push(transitionSection);
        
        Logger.info('Added voice transition', {
          from_role: previousRole,
          to_role: role,
          from_voice: previousVoice,
          to_voice: voice,
          transition: transitionText,
        });
      }
      
      result.push(section);
      
      // Track for next iteration
      previousRole = role;
      previousVoice = voice;
    }
    
    Logger.info('Voice assignment complete', {
      original_sections: sections.length,
      final_sections: result.length,
      transitions_added: result.length - sections.length,
    });
    
    return result;
  }

  /**
   * Voice definitions for TTS
   */
  private readonly voices = {
    host: 'shimmer' as const,       // Warm, natural female - main host
    analyst: 'echo' as const,       // Calm male - analysis, thoughtful content
    urgent: 'onyx' as const,        // Deep, authoritative male - breaking news
    tech: 'nova' as const,          // Young, energetic female - tech/innovation
    expressive: 'fable' as const,   // Expressive - dramatic stories
    neutral: 'alloy' as const,      // Neutral - general narration
  };

  /**
   * Intelligently select voice based on content analysis
   */
  private selectVoiceForContent(text: string, sectionType: string): {
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    role: 'host' | 'analyst' | 'urgent' | 'tech' | 'expressive' | 'neutral';
  } {
    // Opening/Closing = warm host voice
    if (sectionType === 'cold-open' || sectionType === 'sign-off') {
      return { voice: this.voices.host, role: 'host' };
    }
    
    // Breaking/urgent news = authoritative
    if (/\b(breaking|alert|urgent|warning|crisis|emergency)\b/i.test(text)) {
      Logger.debug('Using URGENT voice (onyx) - detected breaking/urgent content');
      return { voice: this.voices.urgent, role: 'urgent' };
    }
    
    // Tech/innovation = energetic
    if (/\b(AI|artificial intelligence|tech|technology|innovation|startup|breakthrough|digital|software|platform|app|algorithm)\b/i.test(text)) {
      Logger.debug('Using TECH voice (nova) - detected tech/innovation content');
      return { voice: this.voices.tech, role: 'tech' };
    }
    
    // Business analysis/financials = professional, analytical
    if (/\b(strategy|analysis|financial|earnings|revenue|profit|quarterly|investment|market|valuation|CEO|executive)\b/i.test(text)) {
      Logger.debug('Using ANALYST voice (echo) - detected business/financial content');
      return { voice: this.voices.analyst, role: 'analyst' };
    }
    
    // Surprising/dramatic news = expressive
    if (/\b(surprise|shock|dramatic|remarkable|unprecedented|stunning|extraordinary|massive|historic)\b/i.test(text)) {
      Logger.debug('Using EXPRESSIVE voice (fable) - detected dramatic content');
      return { voice: this.voices.expressive, role: 'expressive' };
    }
    
    // Default to host voice for general content
    Logger.debug('Using HOST voice (shimmer) - general content');
    return { voice: this.voices.host, role: 'host' };
  }

  /**
   * Generate natural conversational transition when voice changes
   */
  private generateTransition(fromRole: string, toRole: string): string {
    // Variety of natural transitions based on role combinations
    const transitions: Record<string, string[]> = {
      'host->analyst': [
        'Let me bring in our analyst for more on this.',
        'Over to you for the deep dive.',
        'What\'s your take on this?',
      ],
      'analyst->host': [
        'Back to you.',
        'Handing it back.',
        'That\'s my analysis. Back to you.',
      ],
      'host->tech': [
        'Let\'s get into the tech side of this.',
        'More on the innovation angle.',
      ],
      'tech->host': [
        'Back to you for the next story.',
        'That\'s the tech perspective. Back to you.',
      ],
      'host->urgent': [
        'This one\'s breaking.',
        'Here\'s the urgent update.',
      ],
      'urgent->host': [
        'Back to our regular coverage.',
        'Now back to you.',
      ],
      'analyst->tech': [
        'Let me hand this to our tech specialist.',
        'Over to you on the technology side.',
      ],
      'tech->analyst': [
        'Back to you for analysis.',
        'Your take?',
      ],
      'host->expressive': [
        'This story is remarkable.',
        'This one\'s dramatic.',
      ],
      'expressive->host': [
        'Back to you.',
        'That\'s the story. Back to you.',
      ],
    };
    
    const key = `${fromRole}->${toRole}`;
    const options = transitions[key] || ['Let me hand this over.', 'Over to you.'];
    
    // Randomly select a transition for variety
    const selected = options[Math.floor(Math.random() * options.length)];
    
    return selected;
  }
}

