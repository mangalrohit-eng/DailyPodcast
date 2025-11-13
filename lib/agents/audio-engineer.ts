/**
 * Audio Engineer Agent - Renders and stitches audio segments
 */

import { BaseAgent } from './base';
import { SynthesisPlan } from '../types';
import { TtsTool } from '../tools/tts';
import { AudioTool } from '../tools/audio';
import { Logger } from '../utils';

export interface AudioEngineerInput {
  synthesis_plan: SynthesisPlan[];
}

export interface AudioEngineerOutput {
  audio_buffer: Buffer;
  actual_duration_sec: number;
}

export class AudioEngineerAgent extends BaseAgent<AudioEngineerInput, AudioEngineerOutput> {
  private ttsTool: TtsTool;
  
  constructor() {
    super({
      name: 'AudioEngineerAgent',
      systemPrompt: `You are an audio engineer responsible for rendering and mixing podcast audio.`,
      retries: 2,
    });
    
    this.ttsTool = new TtsTool();
  }
  
  protected async process(input: AudioEngineerInput): Promise<AudioEngineerOutput> {
    const { synthesis_plan } = input;
    
    Logger.info('Starting audio synthesis', { segments: synthesis_plan.length });
    
    // Render all segments
    // NOTE: Music and pauses are currently disabled due to MP3 encoding issues
    // OpenAI TTS generates complete, valid MP3s - adding silence breaks playback
    const audioSegments: Buffer[] = [];
    
    for (let i = 0; i < synthesis_plan.length; i++) {
      const plan = synthesis_plan[i];
      
      Logger.debug('Synthesizing segment', {
        segment_id: plan.segment_id,
        voice: plan.voice,
        text_length: plan.text_with_cues.length,
      });
      
      try {
        const audio = await this.ttsTool.synthesize({
          voice: plan.voice,
          text: plan.text_with_cues,
          format: 'mp3',
          speed: 1.0,
        });
        
        audioSegments.push(audio);
      } catch (error) {
        Logger.error('TTS synthesis failed', {
          segment_id: plan.segment_id,
          error: (error as Error).message,
        });
        throw error;
      }
    }
    
    Logger.info('All segments synthesized', { count: audioSegments.length });
    
    // Concatenate all segments
    const concatenated = AudioTool.concat(audioSegments);
    
    // Normalize loudness (placeholder - returns as-is for now)
    const normalized = AudioTool.normalizeLoudness(concatenated, -16);
    
    // Estimate actual duration
    const actualDuration = AudioTool.estimateDuration(normalized);
    
    Logger.info('Audio engineering complete', {
      duration_sec: actualDuration,
      size_bytes: normalized.length,
    });
    
    return {
      audio_buffer: normalized,
      actual_duration_sec: actualDuration,
    };
  }
  
  /**
   * Generate simple upbeat music (placeholder tone)
   * In production, replace with actual music file
   */
  private generateUpbeatMusic(durationMs: number): Buffer {
    // For now, generate a simple ascending tone pattern
    // TODO: Replace with actual music file (royalty-free upbeat track)
    
    // Generate a pleasant multi-tone sequence
    const tones: Buffer[] = [];
    const toneCount = Math.floor(durationMs / 200); // 200ms per tone
    
    // Use a major chord pattern (C-E-G) for upbeat feel
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5
    
    for (let i = 0; i < toneCount; i++) {
      const freq = frequencies[i % frequencies.length];
      tones.push(AudioTool.generateTone(freq, 150)); // 150ms tones with 50ms gap
      if (i < toneCount - 1) {
        tones.push(AudioTool.generateSilence(50));
      }
    }
    
    return AudioTool.concat(tones);
  }
}

