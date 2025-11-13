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
    
    const changesMade: string[] = [];
    const flagsRaised: string[] = [];
    
    // Check each section
    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      
      // Skip intro/outro sections
      if (section.type === 'cold-open' || section.type === 'sign-off') {
        continue;
      }
      
      const result = await this.checkSection(section, script.sources);
      
      if (result.revised_text) {
        script.sections[i].text = result.revised_text;
        changesMade.push(...result.changes);
      }
      
      flagsRaised.push(...result.flags);
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

