/**
 * HTTP Tool - Fetch content from URLs with timeout and retry support
 */

import { Logger, retry } from '../utils';

export interface HttpResponse {
  status: number;
  text: string;
  contentType: string;
  url: string;
}

export class HttpTool {
  static async fetch(
    url: string,
    options: {
      headers?: Record<string, string>;
      timeout?: number;
      maxRetries?: number;
    } = {}
  ): Promise<HttpResponse> {
    const { headers = {}, timeout = 15000, maxRetries = 3 } = options;
    
    Logger.debug('HTTP fetch', { url });
    
    return retry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; DailyPodcastBot/1.0)',
              ...headers,
            },
            signal: controller.signal,
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const text = await response.text();
          
          return {
            status: response.status,
            text,
            contentType: response.headers.get('content-type') || 'text/plain',
            url: response.url,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries,
        delayMs: 1000,
        backoff: true,
        onError: (error, attempt) => {
          Logger.warn(`HTTP fetch failed (attempt ${attempt})`, { url, error: error.message });
        },
      }
    );
  }
}




