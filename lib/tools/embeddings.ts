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
    
    // Import retry helper with rate limiting support
    const { createEmbedding } = await import('../utils/openai-helper');
    
    const response = await createEmbedding(
      this.client,
      {
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      },
      {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
      }
    );
    
    return response.data.map(item => item.embedding);
  }
  
  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }
}

