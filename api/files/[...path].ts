/**
 * Files API - Redirects to S3 storage URLs
 * GET /api/files/*
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Config } from '../../lib/config';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the path from the query (Vercel passes [...path] as array)
    const pathArray = req.query.path;
    
    if (!pathArray || !Array.isArray(pathArray)) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = pathArray.join('/');
    
    // Construct S3 URL
    const s3Url = getS3PublicUrl(filePath);
    
    // Redirect to S3
    return res.redirect(302, s3Url);
  } catch (error) {
    console.error('Error in files API:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

function getS3PublicUrl(key: string): string {
  const bucket = Config.S3_BUCKET;
  
  if (Config.S3_ENDPOINT) {
    // Custom endpoint (MinIO, DigitalOcean Spaces, etc.)
    const endpoint = Config.S3_ENDPOINT.replace(/\/$/, '');
    return `${endpoint}/${bucket}/${key}`;
  } else {
    // Standard AWS S3
    return `https://${bucket}.s3.${Config.S3_REGION}.amazonaws.com/${key}`;
  }
}

