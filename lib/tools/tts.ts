/**
 * TTS Tool - Text-to-speech using OpenAI
 */

import OpenAI from 'openai';
import { Config } from '../config';
import { Logger, retry } from '../utils';

export interface TtsOptions {
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  text: string;
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
  speed?: number;
}

export class TtsTool {
  private client: OpenAI;
  
  constructor() {
    this.client = new OpenAI({
      apiKey: Config.OPENAI_API_KEY,
    });
  }
  
  async synthesize(options: TtsOptions): Promise<Buffer> {
    const { voice, text, format = 'mp3', speed = 0.95 } = options; // Slightly slower for more natural conversational pace
    
    Logger.debug('TTS synthesis', {
      voice,
      textLength: text.length,
      format,
      speed,
    });
    
    // Import retry helper with rate limiting support
    const { createSpeech } = await import('../utils/openai-helper');
    
    const response = await createSpeech(
      this.client,
      {
        model: 'tts-1-hd',
        voice,
        input: text,
        response_format: format,
        speed,
      },
      {
        maxRetries: 3,
        initialDelayMs: 2000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
      }
    );
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  
  async synthesizeSegments(segments: TtsOptions[]): Promise<Buffer[]> {
    const results: Buffer[] = [];
    
    // Reduced concurrency to avoid rate limiting (was 3, now 2)
    // Add delay between batches to respect rate limits
    const concurrency = 2;
    for (let i = 0; i < segments.length; i += concurrency) {
      const batch = segments.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(segment => this.synthesize(segment))
      );
      results.push(...batchResults);
      
      // Add 500ms delay between batches to avoid rate limiting
      if (i + concurrency < segments.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    return results;
  }
}

