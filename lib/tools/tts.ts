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
    const { voice, text, format = 'mp3', speed = 1.0 } = options;
    
    Logger.debug('TTS synthesis', {
      voice,
      textLength: text.length,
      format,
      speed,
    });
    
    return retry(
      async () => {
        const response = await this.client.audio.speech.create({
          model: 'tts-1-hd',
          voice,
          input: text,
          response_format: format,
          speed,
        });
        
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      },
      {
        maxRetries: 3,
        delayMs: 2000,
        backoff: true,
      }
    );
  }
  
  async synthesizeSegments(segments: TtsOptions[]): Promise<Buffer[]> {
    const results: Buffer[] = [];
    
    // Process in parallel with concurrency limit
    const concurrency = 3;
    for (let i = 0; i < segments.length; i += concurrency) {
      const batch = segments.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(segment => this.synthesize(segment))
      );
      results.push(...batchResults);
    }
    
    return results;
  }
}

