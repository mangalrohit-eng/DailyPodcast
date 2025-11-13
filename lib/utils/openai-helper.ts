/**
 * OpenAI API Helper with Rate Limiting and Retry Logic
 */

import OpenAI from 'openai';
import { Logger } from '../utils';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff for OpenAI API calls
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Check if it's a rate limit error
      const isRateLimit = 
        error.status === 429 ||
        error.code === 'rate_limit_exceeded' ||
        (error.message && error.message.includes('rate limit'));
      
      // Check if it's a retryable error
      const isRetryable = 
        isRateLimit ||
        error.status === 500 ||
        error.status === 502 ||
        error.status === 503 ||
        error.status === 504;
      
      // Don't retry on non-retryable errors
      if (!isRetryable) {
        Logger.error('Non-retryable OpenAI error', {
          attempt,
          status: error.status,
          code: error.code,
          error: error.message,
        });
        throw error;
      }
      
      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        Logger.error('Max retries exceeded', {
          maxRetries,
          lastError: error.message,
        });
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.3 * delay; // ±30% jitter
      const finalDelay = delay + jitter;
      
      Logger.warn('Rate limit hit, retrying with backoff', {
        attempt: attempt + 1,
        maxRetries,
        delayMs: Math.round(finalDelay),
        isRateLimit,
      });
      
      await sleep(finalDelay);
    }
  }
  
  throw lastError;
}

/**
 * Create OpenAI chat completion with retry logic
 */
export async function createChatCompletion(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParams,
  retryOptions?: RetryOptions
): Promise<OpenAI.Chat.ChatCompletion> {
  return retryWithBackoff(
    () => client.chat.completions.create(params),
    retryOptions
  );
}

/**
 * Create OpenAI embeddings with retry logic
 */
export async function createEmbedding(
  client: OpenAI,
  params: OpenAI.EmbeddingCreateParams,
  retryOptions?: RetryOptions
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  return retryWithBackoff(
    () => client.embeddings.create(params),
    retryOptions
  );
}

/**
 * Create OpenAI TTS with retry logic
 */
export async function createSpeech(
  client: OpenAI,
  params: OpenAI.Audio.SpeechCreateParams,
  retryOptions?: RetryOptions
): Promise<Response> {
  return retryWithBackoff(
    () => client.audio.speech.create(params),
    retryOptions
  );
}

/**
 * Rate limiter to prevent bursts
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private activeCount = 0;
  private lastCallTime = 0;
  
  constructor(
    private maxConcurrent: number = 5,
    private minDelayMs: number = 200
  ) {}
  
  async acquire(): Promise<void> {
    // Wait if too many concurrent requests
    while (this.activeCount >= this.maxConcurrent) {
      await new Promise(resolve => {
        this.queue.push(resolve as () => void);
      });
    }
    
    // Enforce minimum delay between requests
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.minDelayMs) {
      await sleep(this.minDelayMs - timeSinceLastCall);
    }
    
    this.activeCount++;
    this.lastCallTime = Date.now();
  }
  
  release(): void {
    this.activeCount--;
    const resolve = this.queue.shift();
    if (resolve) {
      resolve();
    }
  }
  
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

