/**
 * Red-Team / Safety Agent - Screens for sensitive or risky content
 */

import { BaseAgent } from './base';
import { Script } from '../types';
import { Logger } from '../utils';

export interface SafetyInput {
  script: Script;
}

export interface SafetyOutput {
  script: Script;
  edits_made: string[];
  risk_level: 'low' | 'medium' | 'high';
  detailed_report: {
    edits_made: string[];
    risk_level: string;
  };
}

export class SafetyAgent extends BaseAgent<SafetyInput, SafetyOutput> {
  constructor() {
    super({
      name: 'SafetyAgent',
      systemPrompt: `You are a content safety and compliance specialist for a corporate news podcast.

Screen for:
1. Legal/compliance issues (SEC regulations, insider trading, etc.)
2. Defamation or unsubstantiated negative claims about individuals/companies
3. Confidential or leaked information that shouldn't be public
4. Investment advice or recommendations (we're not licensed)
5. Inflammatory or divisive language
6. Privacy violations

Actions:
- Rewrite problematic content to be factual and neutral
- Remove unverifiable negative claims
- Add disclaimers where appropriate (e.g., "This is not financial advice")
- Flag high-risk content that should be removed entirely

Balance safety with informative journalism.

You must respond with valid JSON only.`,
      temperature: 0.2, // Very conservative
      maxTokens: 4000,
    });
  }
  
  protected async process(input: SafetyInput): Promise<SafetyOutput> {
    const { script } = input;
    
    Logger.info('Safety check starting', { sections: script.sections.length });
    
    // Screen ALL sections in ONE API call (batch processing)
    Logger.info('Screening all sections in single API call', { sectionCount: script.sections.length });
    
    const result = await this.screenAllSections(script.sections);
    
    const editsMade: string[] = [];
    let maxRiskLevel: 'low' | 'medium' | 'high' = 'low';
    
    // Apply changes to each section
    for (let i = 0; i < result.sections.length; i++) {
      const sectionResult = result.sections[i];
      
      // Skip if section result is null/undefined
      if (!sectionResult) {
        Logger.warn('Safety check returned null for section', { index: i });
        continue;
      }
      
      if (sectionResult.revised_text) {
        script.sections[i].text = sectionResult.revised_text;
        editsMade.push(...(sectionResult.edits || []));
      }
      
      // Update max risk level
      if (sectionResult.risk_level === 'high' || maxRiskLevel === 'high') {
        maxRiskLevel = 'high';
      } else if (sectionResult.risk_level === 'medium' || maxRiskLevel === 'medium') {
        maxRiskLevel = 'medium';
      }
    }
    
    Logger.info('Safety check complete', {
      edits: editsMade.length,
      risk_level: maxRiskLevel,
    });
    
    return {
      script,
      edits_made: editsMade,
      risk_level: maxRiskLevel,
      detailed_report: {
        edits_made: editsMade,
        risk_level: maxRiskLevel,
      },
    };
  }
  
  /**
   * Screen ALL sections in a single API call (batch processing)
   */
  private async screenAllSections(sections: any[]): Promise<{
    sections: Array<{
      revised_text: string | null;
      edits: string[];
      risk_level: 'low' | 'medium' | 'high';
    }>;
  }> {
    const sectionsText = sections
      .map((section, idx) => `SECTION ${idx + 1} (${section.type}):\n${section.text}`)
      .join('\n\n---\n\n');

    const userPrompt = `Review ALL script sections for safety and compliance in one pass.

${sectionsText}

For EACH section, check for:
1. Legal/compliance risks (SEC, financial regulations)
2. Defamation or unverified negative claims
3. Leaked/confidential information
4. Investment advice
5. Inflammatory language
6. Privacy issues

Respond with JSON:
{
  "sections": [
    {
      "section_index": 0,
      "risk_level": "low" | "medium" | "high",
      "revised_text": "safer version text or null if no changes needed",
      "edits": ["specific edit 1", "specific edit 2"]
    }
  ]
}

Return one object per section in the same order.`;

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
      Logger.error('Invalid safety check response: missing sections array');
      return { sections: [] };
    }
    
    return {
      sections: parsed.sections.map((s: any) => {
        if (!s) {
          return { revised_text: null, edits: [], risk_level: 'low' as const };
        }
        return {
          revised_text: s.revised_text || null,
          edits: s.edits || [],
          risk_level: s.risk_level || 'low' as const,
        };
      }),
    };
  }

  /**
   * Legacy method: Screen a single section (kept for backward compatibility)
   */
  private async screenSection(section: any): Promise<{
    revised_text?: string;
    edits: string[];
    risk_level: 'low' | 'medium' | 'high';
  }> {
    const prompt = `Screen this script section for safety and compliance:

Section Type: ${section.type}
Text:
${section.text}

Check for:
1. Legal/compliance risks (SEC, financial regulations)
2. Defamation or unverified negative claims
3. Leaked/confidential information
4. Investment advice
5. Inflammatory language
6. Privacy issues

If issues found:
- Rewrite to be factual and neutral
- Add disclaimers if needed
- Note specific concerns

Respond with JSON:
{
  "risk_level": "low" | "medium" | "high",
  "needs_revision": true/false,
  "revised_text": "safer version (if needs_revision=true)",
  "edits": ["specific edits made"],
  "concerns": ["specific safety concerns identified"]
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
      edits: result.edits || [],
      risk_level: result.risk_level || 'low',
    };
  }
}

