/**
 * Simple test endpoint to verify Vercel serverless functions work
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  return res.status(200).json({
    status: 'ok',
    message: 'Vercel serverless function is working',
    timestamp: new Date().toISOString(),
    env_check: {
      openai_key_present: !!process.env.OPENAI_API_KEY,
      base_url: process.env.PODCAST_BASE_URL,
    }
  });
}

