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
      systemPrompt: `🚨 BANNED PHRASES - DO NOT USE in hooks, guidance, or bridges:
❌ "In a" ❌ "dramatic" ❌ "seismic" ❌ "pivotal" ❌ "major players"
❌ "underscore/underscores" ❌ "marks/marking" ❌ "signals/signaling"
❌ "navigate/navigating" ❌ "broader" ❌ "landscape" ❌ "evolution"
❌ "strategic recalibration" ❌ "imperative" ❌ "delve"

You are an expert radio producer creating factual executive news briefs for C-suite leaders.

HOOKS MUST START WITH FACTS/NUMBERS:
✅ "Verizon's cutting 15,000 jobs - $2B going to AI"
✅ "OpenAI raised $6B at $157B valuation, up 75% in 6 months"
❌ "In a dramatic turn of events" ❌ "major players" ❌ "seismic shift"

GUIDANCE MUST BE DIRECT:
✅ "State the layoff numbers and where the savings are going"
❌ "Explore the strategic recalibrations amid technological evolution"

You must respond with valid JSON only.`,
      temperature: 0.3, // Lower temp for factual, rule-following output
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
    
    // Calculate dynamic timing for thematic segments
    const totalPauseTimeSec = (pauseAfterIntroMs + pauseBeforeOutroMs + (pauseBetweenStoriesMs * 2)) / 1000; // Pauses between ~3-4 segments
    const contentTimeSec = target_duration_sec - totalPauseTimeSec;
    const introOutroTimeSec = Math.max(15, Math.floor(contentTimeSec * 0.1)); // 10% for intro/outro, min 15s each
    const mainContentTimeSec = contentTimeSec - (introOutroTimeSec * 2); // Time available for story segments
    
    // Sort picks by topic weight (highest weight first), then by score within each topic
    // This groups all stories from the same topic together, ordered by topic priority
    const sortedPicks = topic_weights
      ? [...picks].sort((a, b) => {
          const weightA = topic_weights[a.topic] || 0;
          const weightB = topic_weights[b.topic] || 0;
          
          // Primary sort: by topic weight (descending - highest first)
          if (weightB !== weightA) {
            return weightB - weightA;
          }
          
          // Secondary sort: within same topic, sort by story score (descending)
          return b.score - a.score;
        })
      : picks;
    
    Logger.info('Creating outline', { 
      picks: sortedPicks.length, 
      target_duration_sec,
      num_stories: `${numStoriesMin}-${numStoriesMax}`,
      main_content_duration_sec: mainContentTimeSec,
      story_order: sortedPicks.map(p => `${p.topic} (${topic_weights?.[p.topic]?.toFixed(2) || 'N/A'})`),
    });
    
    // Prepare story summaries for the prompt (using sorted picks)
    // Prefer full scraped content (raw) over RSS summary for richer context
    const storySummaries = sortedPicks.map((pick, idx) => ({
      index: idx,
      id: pick.story_id,
      topic: pick.topic,
      title: pick.story.title,
      source: pick.story.source,
      summary: pick.story.raw && pick.story.raw.length > 500 
        ? pick.story.raw.substring(0, 1000) + '...' // First 1000 chars for outline
        : (pick.story.summary || 'No summary available'),
      score: pick.score,
    }));
    
    // Count stories by topic (from sorted picks)
    const topicCounts: Record<string, number> = {};
    sortedPicks.forEach(p => {
      topicCounts[p.topic] = (topicCounts[p.topic] || 0) + 1;
    });
    
    // Calculate target words for each section (150 words per minute speaking pace)
    const wordsPerSecond = 2.5; // 150 words/min = 2.5 words/sec
    const introOutroWords = Math.round(introOutroTimeSec * wordsPerSecond);
    const mainContentWords = Math.round(mainContentTimeSec * wordsPerSecond);
    const totalTargetWords = Math.round(target_duration_sec * wordsPerSecond);
    
    Logger.info('Word count targets', {
      total_target_words: totalTargetWords,
      intro_outro_words: introOutroWords,
      main_content_words: mainContentWords,
    });
    
    const prompt = `Create an executive news briefing outline for ${date}.

Stories to include (PRE-SELECTED and PRE-SORTED by topic priority - highest weight first):
${JSON.stringify(storySummaries, null, 2)}

YOUR MISSION: Create 2-4 THEMATIC SEGMENTS that naturally blend related stories together into cohesive narratives.

STEP 1: ANALYZE FOR COMPELLING HOOK
Find the biggest NUMBER or FACT from the stories:
- Largest dollar amount: "$6B raised", "$2B savings"
- Most people affected: "15,000 jobs", "affects 2M customers"
- Biggest percentage: "up 75%", "down 23%"
- Most recent/urgent: "announced today", "takes effect Monday"

HOOK REQUIREMENTS:
✅ START WITH THE NUMBER/FACT directly
✅ Keep under 20 words
❌ NO framing: "In a...", "Today we...", "dramatic", "major"

STEP 2: IDENTIFY STORY CONNECTIONS
For each potential segment, identify how stories connect:
- Cause & Effect: Does story A explain why story B happened?
- Common Theme: Do multiple stories illustrate the same trend?
- Contrast: Do stories show competing approaches or opposite outcomes?
- Timeline: Are stories part of a developing situation?
- Industry Impact: Do stories affect the same sector/companies?

CRITICAL REQUIREMENTS:
- Total target duration: ${target_duration_sec} seconds (~${Math.round(target_duration_sec / 60)} minutes)
- **TOTAL TARGET WORD COUNT: ${totalTargetWords} words** (at 150 words/minute speaking pace)
- **MUST USE ALL ${sortedPicks.length} STORIES** - every story must appear in at least one segment's refs array
- Stories are PRE-SORTED by topic priority - **USE THEM IN ORDER, NO JUMPING BACK**
- **ONCE YOU FINISH WITH A TOPIC, MOVE ON** - don't return to earlier topics
- Group consecutive stories from the same topic into segments
- Only mix topics if they're naturally adjacent in the sorted list

STRUCTURE GUIDELINES:
1. **Intro**: ~${introOutroWords} words
   - START WITH YOUR HOOK (the most compelling story angle)
   - Then preview the day's THEMES (not individual stories)
   - Make listeners want to keep listening!
   
   EXAMPLE HOOKS:
   ❌ BAD: "Welcome to today's briefing. Let's dive in..."
   ❌ BAD: "In a dramatic turn of events, major players announced layoffs..."
   ✅ GOOD: "Verizon's cutting 15,000 jobs - $2B savings going straight to AI infrastructure"
   ✅ GOOD: "OpenAI raised $6B at $157B valuation - up 75% in six months"

2. **Thematic Segments** (2-4 segments totaling ~${mainContentWords} words):
   - **USE STORIES SEQUENTIALLY** - refs should be consecutive: [0,1,2] then [3,4] NOT [0,2] then [1,3]
   - Group consecutive stories from the same topic into segments
   - Give each segment a compelling THEMATIC title (e.g., "AI's Enterprise Moment", "The Regulatory Response")
   - Each segment MUST include:
     * refs: [0, 1, 2] - **CONSECUTIVE** story indices only
     * connection_type: "cause-effect" | "common-theme" | "contrast" | "timeline" | "industry-impact"
     * bridge: Brief description of HOW these stories connect (used by scriptwriter)
   - Allocate word counts based on story importance and complexity
   - Move forward through the story list - **NEVER go backwards**

3. **Outro**: ~${introOutroWords} words - Key strategic takeaways + forward-looking insights

STYLE RULES:
- Executive audience: FACTUAL, DIRECT, NUMBERS-FIRST
- NO corporate jargon in hooks, guidance, or bridges
- Guidance should be instructions: "State X, explain Y, cite Z"
- Bridges should be facts: "Both companies cut jobs to fund AI" NOT "broader trend of evolution"
- ❌ NEVER use banned phrases listed at top of prompt

Topic distribution (for reference):
${JSON.stringify(topicCounts, null, 2)}

EXAMPLE FORMAT (adapt to your actual stories):
{
  "opening_hook": "15,000 jobs just vanished at Verizon - but not for the reason you'd think",
  "sections": [
    {
      "type": "intro",
      "title": "Welcome & Today's Themes",
      "target_words": ${introOutroWords},
      "refs": [],
      "guidance": "Start with the opening_hook above, then preview themes"
    },
    {
      "type": "segment",
      "title": "The AI Investment Wave",
      "target_words": 300,
      "refs": [0, 1, 2],
      "connection_type": "cause-effect",
      "bridge": "Verizon's layoffs are directly funding their AI pivot. OpenAI's $6B raise shows why - and Accenture is betting on this shift too.",
      "guidance": "Weave these 3 stories together - show how they're all part of the same AI transformation trend"
    },
    {
      "type": "segment",
      "title": "The Regulatory Response",
      "target_words": 250,
      "refs": [3, 4],
      "connection_type": "common-theme",
      "bridge": "As AI accelerates, regulators are scrambling to catch up. Here are two very different approaches.",
      "guidance": "Contrast the two regulatory approaches - show what this means for companies"
    },
    {
      "type": "outro",
      "title": "Strategic Takeaways",
      "target_words": ${introOutroWords},
      "refs": [],
      "guidance": "Synthesize key insights and what to watch tomorrow"
    }
  ]
}

NOTE: The refs arrays [0,1,2] then [3,4] are SEQUENTIAL - they move forward through the list. 
NEVER jump around like [0,2] then [1,3] - this creates confusing topic switching.

**CRITICAL**: 
- MUST include "opening_hook" field with your most compelling hook
- MUST include "connection_type" and "bridge" for each segment
- Total word count = ${totalTargetWords}
- All ${sortedPicks.length} stories referenced

Respond with JSON only.`;
    
    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      { responseFormat: 'json_object' }
    );
    
    const outlineData = JSON.parse(response);
    
    // Extract opening hook
    const openingHook = outlineData.opening_hook || undefined;
    
    // Map story indices to story IDs with null safety
    // CRITICAL: Use sortedPicks (not picks) since AI received sorted array
    const sections: OutlineSection[] = outlineData.sections
      .filter((section: any) => section && section.type) // Filter out null/invalid sections
      .map((section: any) => ({
        type: section.type,
        title: section.title || 'Untitled',
        target_words: section.target_words || 150,
        refs: (section.refs || [])
          .map((idx: number) => sortedPicks[idx]?.story_id)
          .filter(Boolean),
        connection_type: section.connection_type,
        bridge: section.bridge,
        guidance: section.guidance,
      }));
    
    const outline: Outline = {
      opening_hook: openingHook,
      sections,
      runtime_target_sec: target_duration_sec,
    };
    
    Logger.info('Outline created', {
      opening_hook: openingHook ? openingHook.substring(0, 80) + '...' : 'none',
      sections: sections.length,
      total_words: sections.reduce((sum, s) => sum + s.target_words, 0),
      segments_with_connections: sections.filter(s => s.bridge).length,
    });
    
    return { outline };
  }
}

