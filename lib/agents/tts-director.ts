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
      sections_processed: script.sections.length,
    });
    
    // CRITICAL: Ensure we have segments to synthesize
    if (synthesisPlan.length === 0) {
      Logger.error('❌ TTS plan is EMPTY! No valid segments created from script', {
        total_sections: script.sections.length,
        sections_with_text: script.sections.filter(s => s && s.text).length,
        sample_section: script.sections[0],
      });
      throw new Error('TTS plan is empty - all script sections had invalid or missing text');
    }
    
    return {
      synthesis_plan: synthesisPlan,
      estimated_duration_sec: estimatedDuration,
    };
  }
  
  private async prepareTtsSegments(section: any): Promise<SynthesisPlan[]> {
    // Safety check
    if (!section || !section.text || typeof section.text !== 'string') {
      Logger.error('❌ Invalid section or missing text in prepareTtsSegments', { 
        has_section: !!section,
        has_text: !!(section?.text),
        text_type: typeof section?.text,
        section_type: section?.type,
        text_preview: section?.text ? String(section.text).substring(0, 100) : 'N/A',
        full_section: section,
      });
      return [];
    }
    
    // Determine voice and emotion based on section type and content
    const role = this.getRoleForSection(section.type);
    const { text: emotionalText, speed } = this.addEmotionalCues(section.text, section.type);
    const voice = this.voices[role];
    
    // Extra safety check on emotionalText
    if (!emotionalText || typeof emotionalText !== 'string') {
      Logger.error('emotionalText is invalid after addEmotionalCues', { 
        section_type: section.type,
        original_text: section.text,
        emotional_text: emotionalText
      });
      return [];
    }
    
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
   */
  private addEmotionalCues(text: string, sectionType: string): { text: string; speed: number } {
    // Safety check
    if (!text || typeof text !== 'string') {
      return { text: '', speed: 0.95 };
    }
    
    let emotionalText = text;
    let speed = 0.95; // Default speed
    
    // Detect exciting content (growth, innovation, breakthrough, launch)
    const excitingKeywords = /\b(growth|innovation|breakthrough|launch|record|milestone|revolutionary|transform|disrupt)/gi;
    if (excitingKeywords.test(text)) {
      speed = 1.0; // Slightly faster for exciting news
      // Add emphasis punctuation
      emotionalText = emotionalText.replace(/(!|\?)/g, '$1!');
    }
    
    // Detect serious/concerning content (decline, warning, concern, risk)
    const seriousKeywords = /\b(decline|warning|concern|risk|threat|challenge|crisis|fail)/gi;
    if (seriousKeywords.test(text)) {
      speed = 0.90; // Slower for serious topics
      // Add pauses after concerning statements
      emotionalText = emotionalText.replace(/\./g, '...');
    }
    
    // Intro/outro should be warm and welcoming
    if (sectionType === 'intro') {
      speed = 0.95;
      emotionalText = emotionalText.replace(/\./g, '. '); // Add space for natural pauses
    }
    
    if (sectionType === 'outro') {
      speed = 0.93; // Slightly slower, more reflective
    }
    
    return { text: emotionalText, speed };
  }
}

