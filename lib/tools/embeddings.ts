/**
 * Embeddings Tool - Generate embeddings using OpenAI
 */

import OpenAI from 'openai';
import { Config } from '../config';
import { Logger, retry } from '../utils';

export class EmbeddingsTool {
  private client: OpenAI;
  
  constructor() {
    this.client = new OpenAI({
      apiKey: Config.OPENAI_API_KEY,
    });
  }
  
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    
    Logger.debug('Generating embeddings', { count: texts.length });
    
    return retry(
      async () => {
        const response = await this.client.embeddings.create({
          model: 'text-embedding-3-small',
          input: texts,
          encoding_format: 'float',
        });
        
        return response.data.map(item => item.embedding);
      },
      {
        maxRetries: 3,
        delayMs: 1000,
        backoff: true,
      }
    );
  }
  
  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}

