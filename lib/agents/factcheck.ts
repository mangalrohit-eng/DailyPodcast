/**
 * Fact-Check & Attribution Agent - Validates claims and ensures proper attribution
 */

import { BaseAgent } from './base';
import { Script, Source } from '../types';
import { Logger } from '../utils';

export interface FactCheckInput {
  script: Script;
}

export interface FactCheckOutput {
  script: Script;
  changes_made: string[];
  flags_raised: string[];
  detailed_report: {
    changes_made: string[];
    flags_raised: string[];
  };
}

export class FactCheckAgent extends BaseAgent<FactCheckInput, FactCheckOutput> {
  constructor() {
    super({
      name: 'FactCheckAgent',
      systemPrompt: `You are a fact-checking editor for a news podcast.

Your role:
- Verify claims against provided source articles
- Add proper citations [1], [2], etc. ONLY for specific claims (numbers, quotes, unique facts)
- Flag statements that are clearly unsupported
- Correct ONLY clear factual errors (wrong numbers, dates, names)

CRITICAL Guidelines:
- BE VERY CONSERVATIVE: Only edit if there's a CLEAR accuracy issue
- Preserve the original wording, voice, tone, and style
- If a statement is approximately correct, leave it unchanged
- Don't rephrase or rewrite - only fix clear errors
- Don't add citations to: general knowledge, obvious facts, contextual statements, transitions
- One citation per key claim is enough - don't over-cite
- If unsure whether to edit, DON'T edit

You must respond with valid JSON only.`,
      temperature: 0.1, // Very precise and conservative
      maxTokens: 4000,
    });
  }
  
  protected async process(input: FactCheckInput): Promise<FactCheckOutput> {
    const { script } = input;
    
    Logger.info('Fact-checking script', {
      sections: script.sections.length,
      sources: script.sources.length,
    });
    
    // Fact-check ALL sections in ONE API call (batch processing)
    Logger.info('Fact-checking all sections in single API call', { sectionCount: script.sections.length });
    
    const result = await this.checkAllSections(script.sections, script.sources);
    
    const changesMade: string[] = [];
    const flagsRaised: string[] = [];
    
    // Apply changes to each section
    for (let i = 0; i < result.sections.length; i++) {
      const sectionResult = result.sections[i];
      
      // Skip if section result is null/undefined
      if (!sectionResult) {
        Logger.warn('Fact-check returned null for section', { index: i });
        continue;
      }
      
      if (sectionResult.revised_text && typeof sectionResult.revised_text === 'string') {
        script.sections[i].text = sectionResult.revised_text;
        changesMade.push(...(sectionResult.changes || []));
      }
      
      // Ensure text is never null/undefined after fact-check
      if (!script.sections[i].text || typeof script.sections[i].text !== 'string') {
        Logger.warn('Section has invalid text after fact-check, preserving original', { 
          index: i,
          type: script.sections[i].type 
        });
        // Keep original text if revision is invalid
      }
      
      flagsRaised.push(...(sectionResult.flags || []));
    }
    
    Logger.info('Fact-check complete', {
      changes: changesMade.length,
      flags: flagsRaised.length,
    });
    
    return {
      script,
      changes_made: changesMade,
      flags_raised: flagsRaised,
      detailed_report: {
        changes_made: changesMade,
        flags_raised: flagsRaised,
      },
    };
  }
  
  /**
   * Fact-check ALL sections in a single API call (batch processing)
   */
  private async checkAllSections(
    sections: any[],
    sources: Source[]
  ): Promise<{
    sections: Array<{
      revised_text: string | null;
      changes: string[];
      flags: string[];
    }>;
  }> {
    const sectionsText = sections
      .filter(section => section && section.text) // Filter out sections without text
      .map((section, idx) => {
        // Skip intro/outro sections
        if (section.type === 'cold-open' || section.type === 'sign-off') {
          return `SECTION ${idx + 1} (${section.type}): [SKIP - no fact-checking needed]\n${section.text}`;
        }
        return `SECTION ${idx + 1} (${section.type}):\n${section.text}`;
      })
      .join('\n\n---\n\n');

    const sourcesText = sources
      .map((source, idx) => `[${idx + 1}] ${source.title} - ${source.url}`)
      .join('\n');

    const userPrompt = `Fact-check ALL script sections in one pass.

AVAILABLE SOURCES:
${sourcesText}

SCRIPT SECTIONS:
${sectionsText}

For EACH section (except those marked SKIP), check for:
1. Unsupported factual claims (no citation)
2. Speculative statements presented as fact
3. Statistics or quotes without attribution
4. Potential inaccuracies

Respond with JSON:
{
  "sections": [
    {
      "section_index": 0,
      "revised_text": "corrected text with proper citations or null if no changes",
      "changes": ["description of change 1", "description of change 2"],
      "flags": ["concern 1", "concern 2"]
    }
  ]
}

Return one object per section in the same order. For SKIP sections, return null for revised_text and empty arrays.`;

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
    
    // Ensure we have results for all sections - handle null/undefined sections
    if (!parsed.sections || !Array.isArray(parsed.sections)) {
      Logger.error('Invalid fact-check response: missing sections array');
      return { sections: [] };
    }
    
    return {
      sections: parsed.sections.map((s: any) => {
        if (!s) {
          return { revised_text: null, changes: [], flags: [] };
        }
        return {
          revised_text: s.revised_text || null,
          changes: s.changes || [],
          flags: s.flags || [],
        };
      }),
    };
  }

  /**
   * Legacy method: Fact-check a single section (kept for backward compatibility)
   */
  private async checkSection(
    section: any,
    sources: Source[]
  ): Promise<{
    revised_text?: string;
    changes: string[];
    flags: string[];
  }> {
    const prompt = `Fact-check this script section:

Section Type: ${section.type}
Text:
${section.text}

Available Sources:
${JSON.stringify(sources, null, 2)}

Check for:
1. Unsupported factual claims (no citation)
2. Speculative statements presented as fact
3. Statistics or quotes without attribution
4. Potential inaccuracies

If you find issues:
- Add citations where missing (if source supports it)
- Add hedging language ("reports suggest", "according to") where appropriate
- Flag serious concerns

Respond with JSON:
{
  "needs_revision": true/false,
  "revised_text": "corrected text with proper citations (if needs_revision=true)",
  "changes": ["list of changes made"],
  "flags": ["list of concerns raised"]
}`;
    
    const response = await this.callOpenAI(
      [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: prompt },
      ],
      { responseFormat: 'json_object' }
    );
    
    const result = JSON.parse(response);
    
    return {
      revised_text: result.needs_revision ? result.revised_text : undefined,
      changes: result.changes || [],
      flags: result.flags || [],
    };
  }
}

