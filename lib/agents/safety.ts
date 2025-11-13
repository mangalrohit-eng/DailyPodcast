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
    
    const editsMade: string[] = [];
    let maxRiskLevel: 'low' | 'medium' | 'high' = 'low';
    
    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      const result = await this.screenSection(section);
      
      if (result.revised_text) {
        script.sections[i].text = result.revised_text;
        editsMade.push(...result.edits);
      }
      
      // Update max risk level
      if (result.risk_level === 'high' || maxRiskLevel === 'high') {
        maxRiskLevel = 'high';
      } else if (result.risk_level === 'medium' || maxRiskLevel === 'medium') {
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
    };
  }
  
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

