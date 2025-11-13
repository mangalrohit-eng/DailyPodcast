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
}

export class FactCheckAgent extends BaseAgent<FactCheckInput, FactCheckOutput> {
  constructor() {
    super({
      name: 'FactCheckAgent',
      systemPrompt: `You are a fact-checking and attribution specialist for a news podcast.

Your responsibilities:
1. Verify every factual claim has a proper citation [n]
2. Identify unsupported or weakly supported claims
3. Flag speculative or uncertain statements
4. Ensure quotes and statistics are attributed
5. Suggest rewrites or removals for problematic content

Guidelines:
- Claims must be supported by cited sources
- If support is weak, downgrade to "reports suggest" or move to "What to Watch"
- Flag any potential misinformation
- Maintain journalistic integrity

You must respond with valid JSON only.`,
      temperature: 0.3, // Lower temperature for fact-checking
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
      
      if (sectionResult.revised_text) {
        script.sections[i].text = sectionResult.revised_text;
        changesMade.push(...(sectionResult.changes || []));
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

