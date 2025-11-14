/**
 * TTS Director Agent - Converts script into TTS directives with pacing
 */

import { BaseAgent } from './base';
import { Script, SynthesisPlan } from '../types';
import { Logger, Crypto } from '../utils';

export interface TtsDirectorInput {
  script: Script;
}

export interface TtsDirectorOutput {
  synthesis_plan: SynthesisPlan[];
  estimated_duration_sec: number;
}

export class TtsDirectorAgent extends BaseAgent<TtsDirectorInput, TtsDirectorOutput> {
  // OpenAI TTS voices - optimized for most natural sound
  private readonly voices = {
    host: 'shimmer' as const,   // Most natural-sounding female (warmer, less robotic than nova)
    analyst: 'echo' as const,   // Calmer, more natural male (smoother than onyx)
    stinger: 'fable' as const,  // Expressive and engaging for intro/outro
  };
  
  constructor() {
    super({
      name: 'TtsDirectorAgent',
      systemPrompt: `You are a TTS director preparing a script for text-to-speech synthesis.

Your job:
1. Convert script sections into TTS-ready segments
2. Remove stage directions like (warmly) - they don't work in TTS
3. Convert pause markers [beat 300ms] into natural sentence breaks
4. Add appropriate punctuation for natural pacing
5. Split long sections to stay under TTS token limits (~4000 chars per segment)
6. Maintain conversational flow

Guidelines:
- Use periods and commas for natural pauses
- Add "..." for longer pauses
- Keep citations [1], [2], etc. in text
- Ensure smooth transitions between segments

You must respond with valid JSON only.`,
      temperature: 0.5,
      maxTokens: 4000,
    });
  }
  
  protected async process(input: TtsDirectorInput): Promise<TtsDirectorOutput> {
    const { script } = input;
    
    Logger.info('Creating TTS plan', { sections: script.sections.length });
    
    const synthesisPlan: SynthesisPlan[] = [];
    
    for (const section of script.sections) {
      const segments = await this.prepareTtsSegments(section);
      synthesisPlan.push(...segments);
    }
    
    // Estimate duration (rough: 150 words per minute = 2.5 words per second)
    const totalWords = script.word_count;
    const estimatedDuration = Math.ceil(totalWords / 2.5);
    
    Logger.info('TTS plan created', {
      segments: synthesisPlan.length,
      estimated_duration_sec: estimatedDuration,
    });
    
    return {
      synthesis_plan: synthesisPlan,
      estimated_duration_sec: estimatedDuration,
    };
  }
  
  private async prepareTtsSegments(section: any): Promise<SynthesisPlan[]> {
    // Determine voice and emotion based on section type and content
    const role = this.getRoleForSection(section.type);
    const { text: emotionalText, speed } = this.addEmotionalCues(section.text, section.type);
    const voice = this.voices[role];
    
    // Clean text for TTS and apply emotionalText enhancements
    let text = emotionalText;
    
    // Remove stage directions in parentheses
    text = text.replace(/\([^)]*\)/g, '');
    
    // Convert pause markers to ellipsis (creates natural pauses)
    text = text.replace(/\[beat \d+ms\]/g, '...');
    text = text.replace(/\[pause\]/gi, '...');
    
    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    // Split into segments if too long (4000 chars is safe for TTS)
    const segments: SynthesisPlan[] = [];
    const maxChars = 4000;
    
    if (text.length <= maxChars) {
      segments.push({
        segment_id: Crypto.uuid(),
        role,
        voice,
        text_with_cues: text,
        expected_sec: this.estimateSegmentDuration(text),
        speed, // Dynamic speed for emotional delivery
      });
    } else {
      // Split at sentence boundaries
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let currentSegment = '';
      
      for (const sentence of sentences) {
        if ((currentSegment + sentence).length > maxChars && currentSegment.length > 0) {
          segments.push({
            segment_id: Crypto.uuid(),
            role,
            voice,
            text_with_cues: currentSegment.trim(),
            expected_sec: this.estimateSegmentDuration(currentSegment),
            speed, // Dynamic speed for emotional delivery
          });
          currentSegment = sentence;
        } else {
          currentSegment += sentence;
        }
      }
      
      if (currentSegment.trim()) {
        segments.push({
          segment_id: Crypto.uuid(),
          role,
          voice,
          text_with_cues: currentSegment.trim(),
          expected_sec: this.estimateSegmentDuration(currentSegment),
          speed, // Dynamic speed for emotional delivery
        });
      }
    }
    
    return segments;
  }
  
  private getRoleForSection(sectionType: string): 'host' | 'analyst' | 'stinger' {
    switch (sectionType) {
      case 'intro':
      case 'outro':
      case 'cold-open':
      case 'sign-off':
        return 'host';
      case 'deep-dive':
        return 'analyst';
      default:
        return 'host';
    }
  }
  
  private estimateSegmentDuration(text: string): number {
    const words = text.split(/\s+/).length;
    return Math.ceil(words / 2.5); // 150 wpm = 2.5 words per second
  }
  
  /**
   * Add emotional cues to make TTS more engaging
   * OpenAI TTS responds well to punctuation and word choice
   */
  private addEmotionalCues(text: string, sectionType: string): { text: string; speed: number } {
    let enhancedText = text;
    let speed = 0.95; // Default from dashboard
    
    // Detect content tone from keywords
    const lowerText = text.toLowerCase();
    const isExciting = /breakthrough|revolutionary|unprecedented|major deal|record|surge|soar|jump|explode|announce|launch|unveil|winner|success|achievement/i.test(text);
    const isSerious = /concern|risk|challenge|crisis|decline|loss|warning|threat|investigation|lawsuit|failure|layoff/i.test(text);
    const isPositive = /growth|expand|increase|improve|better|positive|gain|profit|win|innovation|advance/i.test(text);
    
    // Intro/outro should be warm and welcoming
    if (sectionType === 'intro' || sectionType === 'cold-open') {
      speed = 0.98; // Slightly faster for energy
      // Add warmth with greeting enhancement
      enhancedText = enhancedText.replace(/^(\w+)/, '$1!'); // Add exclamation to first word sometimes
    }
    
    // Exciting news: faster pace, more exclamation marks
    if (isExciting) {
      speed = 1.0; // Faster for excitement
      // Enhance with exclamation marks at key moments
      enhancedText = enhancedText.replace(/(\.|!)( [A-Z])/g, (match, punct, nextPart) => {
        // Randomly convert some periods to exclamation marks in exciting context
        return Math.random() > 0.7 ? '!' + nextPart : match;
      });
    }
    
    // Serious news: slower, more deliberate
    if (isSerious) {
      speed = 0.90; // Slower for gravity
      // Add ellipses for dramatic pauses
      enhancedText = enhancedText.replace(/\. ([A-Z])/g, '... $1');
    }
    
    // Positive news: warm and upbeat
    if (isPositive && !isSerious) {
      speed = 0.97; // Slightly upbeat pace
    }
    
    // Outro should be upbeat and energetic
    if (sectionType === 'outro' || sectionType === 'sign-off') {
      speed = 1.0; // Energetic finish
      // Ensure ending has enthusiasm
      enhancedText = enhancedText.replace(/\.$/, '!');
    }
    
    // Add emphasis to key phrases with caps (sparingly)
    // OpenAI TTS responds to capitalization
    const keyPhrases = [
      'breaking news',
      'just announced',
      'major development',
      'important update',
      'significant',
      'critical',
      'unprecedented'
    ];
    
    keyPhrases.forEach(phrase => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      enhancedText = enhancedText.replace(regex, (match) => {
        // Capitalize first letter of each word
        return match.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      });
    });
    
    // Add comma pauses for better pacing
    // "The company announced X" -> "The company announced, X"
    enhancedText = enhancedText.replace(/(\bannounced?|\brevealed?|\bunveiled?|\blaunched?|\breported?)( [a-z])/gi, '$1,$2');
    
    Logger.debug('Enhanced text with emotional cues', {
      sectionType,
      speed,
      isExciting,
      isSerious,
      isPositive,
      originalLength: text.length,
      enhancedLength: enhancedText.length,
    });
    
    return { text: enhancedText, speed };
  }
}

