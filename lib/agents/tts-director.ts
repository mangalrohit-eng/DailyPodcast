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
    host: 'shimmer' as const,       // Warm, natural female - main host
    analyst: 'echo' as const,       // Calm male - analysis, thoughtful content
    urgent: 'onyx' as const,        // Deep, authoritative male - breaking news
    tech: 'nova' as const,          // Young, energetic female - tech/innovation
    expressive: 'fable' as const,   // Expressive - dramatic stories
    neutral: 'alloy' as const,      // Neutral - general narration
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
    
    // Read voice and role from section metadata (assigned by Scriptwriter)
    const voice = section.voice || this.voices.host;  // Default to host if not specified
    const role = section.role || 'host';  // Default to host if not specified
    
    Logger.debug('Using voice from script metadata', {
      section_type: section.type,
      voice,
      role,
    });
    
    // Enhanced emotional cues with dynamic pacing
    const { text: emotionalText, speed } = this.addEmotionalCues(section.text, section.type);
    
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
   * Add emotional cues to make TTS more engaging with enhanced dynamic pacing
   */
  private addEmotionalCues(text: string, sectionType: string): { text: string; speed: number } {
    // Safety check
    if (!text || typeof text !== 'string') {
      return { text: '', speed: 0.95 };
    }
    
    let emotionalText = text;
    let speed = 0.95; // Default speed
    
    // URGENT/BREAKING NEWS: Faster, energetic (highest priority)
    if (/\b(breaking|alert|just announced|just in|urgent|happening now)\b/i.test(text)) {
      speed = 1.08;
      Logger.debug('Applied URGENT pacing (1.08x) - breaking news detected');
    }
    
    // EXCITING/POSITIVE: Slightly faster for enthusiasm
    else if (/\b(growth|innovation|breakthrough|launch|record|milestone|revolutionary|transform|success|win|soar|surge)\b/gi.test(text)) {
      speed = 1.02;
      emotionalText = emotionalText.replace(/(!)/g, '!!'); // Add emphasis
      Logger.debug('Applied EXCITING pacing (1.02x) - positive news detected');
    }
    
    // SERIOUS/CONCERNING: Slower, deliberate
    else if (/\b(decline|warning|concern|risk|threat|challenge|crisis|fail|collapse|plunge|loss)\b/gi.test(text)) {
      speed = 0.88;
      // Add strategic pauses after key points
      emotionalText = emotionalText.replace(/\. /g, '... ');
      Logger.debug('Applied SERIOUS pacing (0.88x) - concerning content detected');
    }
    
    // FINANCIAL DATA: Measured, clear
    else if (/\b(revenue|earnings|profit|quarterly|billion|million|\$\d+|percent|%|stock|shares)\b/i.test(text)) {
      speed = 0.92;
      Logger.debug('Applied FINANCIAL pacing (0.92x) - financial data detected');
    }
    
    // ANALYSIS/EXPLANATION: Thoughtful pace
    else if (/\b(because|therefore|however|analysis|strategy|impact|means|indicates|suggests)\b/i.test(text)) {
      speed = 0.90;
      Logger.debug('Applied ANALYTICAL pacing (0.90x) - analysis detected');
    }
    
    // INTRO: Welcoming, natural
    else if (sectionType === 'cold-open') {
      speed = 0.96;
      Logger.debug('Applied INTRO pacing (0.96x) - welcoming tone');
    }
    
    // OUTRO: Confident, wrapping up
    else if (sectionType === 'sign-off') {
      speed = 0.98;
      Logger.debug('Applied OUTRO pacing (0.98x) - confident closure');
    }
    
    Logger.info('🎭 Voice & pacing applied', { 
      speed, 
      text_preview: text.substring(0, 80),
      section_type: sectionType 
    });
    
    return { text: emotionalText, speed };
  }
}

