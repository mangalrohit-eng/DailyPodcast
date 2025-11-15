/**
 * Audio Engineer Agent - Renders and stitches audio segments
 */

import { BaseAgent } from './base';
import { SynthesisPlan } from '../types';
import { TtsTool } from '../tools/tts';
import { AudioTool } from '../tools/audio';
import { StorageTool } from '../tools/storage';
import { ConfigStorage } from '../tools/config-storage';
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
  private storage: StorageTool;
  private configStorage: ConfigStorage;
  
  constructor() {
    super({
      name: 'AudioEngineerAgent',
      systemPrompt: `You are an audio engineer responsible for rendering and mixing podcast audio.`,
      retries: 2,
    });
    
    this.ttsTool = new TtsTool();
    this.storage = new StorageTool();
    this.configStorage = new ConfigStorage();
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
        speed: plan.speed || 0.95,
      });
      
      try {
        const audio = await this.ttsTool.synthesize({
          voice: plan.voice,
          text: plan.text_with_cues,
          format: 'mp3',
          speed: plan.speed || 0.95, // Use dynamic speed from TTS Director
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
    let finalAudio = AudioTool.concat(audioSegments);
    
    // Load config for music settings
    const config = await this.configStorage.load();
    
    // Add intro music if enabled
    if (config.use_intro_music && config.intro_music_file) {
      try {
        Logger.info('Loading intro music', { file: config.intro_music_file });
        const introMusic = await this.loadMusicFile(config.intro_music_file);
        finalAudio = AudioTool.addStinger(finalAudio, introMusic, 'intro');
        Logger.info('Intro music added successfully');
      } catch (error) {
        Logger.warn('Failed to load intro music, skipping', {
          error: (error as Error).message,
          file: config.intro_music_file,
        });
      }
    }
    
    // Add outro music if enabled
    if (config.use_outro_music && config.outro_music_file) {
      try {
        Logger.info('Loading outro music', { file: config.outro_music_file });
        const outroMusic = await this.loadMusicFile(config.outro_music_file);
        finalAudio = AudioTool.addStinger(finalAudio, outroMusic, 'outro');
        Logger.info('Outro music added successfully');
      } catch (error) {
        Logger.warn('Failed to load outro music, skipping', {
          error: (error as Error).message,
          file: config.outro_music_file,
        });
      }
    }
    
    // Normalize loudness (placeholder - returns as-is for now)
    const normalized = AudioTool.normalizeLoudness(finalAudio, -16);
    
    // Estimate actual duration
    const actualDuration = AudioTool.estimateDuration(normalized);
    
    Logger.info('Audio engineering complete', {
      duration_sec: actualDuration,
      size_bytes: normalized.length,
      intro_music: config.use_intro_music,
      outro_music: config.use_outro_music,
    });
    
    return {
      audio_buffer: normalized,
      actual_duration_sec: actualDuration,
    };
  }
  
  /**
   * Load music file from S3 storage
   */
  private async loadMusicFile(filePath: string): Promise<Buffer> {
    try {
      // Check if it's a URL or S3 path
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Download from URL
        Logger.debug('Downloading music from URL', { url: filePath });
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to download music: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } else {
        // Load from S3
        Logger.debug('Loading music from S3', { path: filePath });
        const fileExists = await this.storage.exists(filePath);
        if (!fileExists) {
          throw new Error(`Music file not found in S3: ${filePath}`);
        }
        return await this.storage.get(filePath);
      }
    } catch (error) {
      Logger.error('Failed to load music file', {
        filePath,
        error: (error as Error).message,
      });
      throw error;
    }
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

