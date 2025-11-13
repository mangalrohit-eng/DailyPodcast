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
  // OpenAI TTS voices
  private readonly voices = {
    host: 'nova' as const,      // Warm, professional female voice
    analyst: 'onyx' as const,   // Authoritative male voice
    stinger: 'alloy' as const,  // Neutral for intro/outro
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
    // Determine voice based on section type
    const role = this.getRoleForSection(section.type);
    const voice = this.voices[role];
    
    // Clean text for TTS
    let text = section.text;
    
    // Remove stage directions in parentheses
    text = text.replace(/\([^)]*\)/g, '');
    
    // Convert pause markers to ellipsis
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
        });
      }
    }
    
    return segments;
  }
  
  private getRoleForSection(sectionType: string): 'host' | 'analyst' | 'stinger' {
    switch (sectionType) {
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
}

