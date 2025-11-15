/**
 * Utility functions
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export class Logger {
  static log(level: 'info' | 'warn' | 'error' | 'debug', message: string, obj?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(obj && { data: obj }),
    };
    
    if (level === 'error') {
      console.error(JSON.stringify(logEntry));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }
  
  static info(message: string, obj?: any) {
    this.log('info', message, obj);
  }
  
  static warn(message: string, obj?: any) {
    this.log('warn', message, obj);
  }
  
  static error(message: string, obj?: any) {
    this.log('error', message, obj);
  }
  
  static debug(message: string, obj?: any) {
    this.log('debug', message, obj);
  }
}

export class Crypto {
  static sha256(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex');
  }
  
  static contentId(obj: any): string {
    const normalized = JSON.stringify(obj, Object.keys(obj).sort());
    return this.sha256(normalized).substring(0, 16);
  }
  
  static uuid(): string {
    return uuidv4();
  }
}

export class Clock {
  static nowUtc(): Date {
    return new Date();
  }
  
  static toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
  
  static addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delayMs?: number;
    backoff?: boolean;
    onError?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delayMs = 1000,
    backoff = true,
    onError,
  } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (onError) {
        onError(lastError, attempt);
      }
      
      if (attempt < maxRetries) {
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        Logger.warn(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms`, {
          error: lastError.message,
        });
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - suffix.length) + suffix;
}

export function cleanText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

export function estimateReadingTime(text: string, wpm = 150): number {
  const words = text.split(/\s+/).length;
  return Math.ceil((words / wpm) * 60); // seconds
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}



