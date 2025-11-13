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
    const audioSegments: Buffer[] = [];
    
    for (const plan of synthesis_plan) {
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
}

