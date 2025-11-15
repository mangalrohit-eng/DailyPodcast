/**
 * API Authentication Middleware
 * 
 * Validates external API requests using API key authentication
 */

import type { VercelRequest } from '@vercel/node';

/**
 * Authenticate API key from request headers
 * Returns error message if authentication fails, null if successful
 */
export function authenticateApiKey(req: VercelRequest): string | null {
  const apiKey = process.env.EXTERNAL_API_KEY;
  
  if (!apiKey) {
    return 'External API is not configured. Set EXTERNAL_API_KEY environment variable.';
  }
  
  const providedKey = req.headers['x-api-key'] as string;
  
  if (!providedKey) {
    return 'Missing X-API-Key header';
  }
  
  if (providedKey !== apiKey) {
    return 'Invalid API key';
  }
  
  return null; // Authentication successful
}

