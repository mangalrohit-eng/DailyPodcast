/**
 * API endpoint to upload music files
 * POST /api/upload-music?type=intro|outro
 * 
 * Supports multipart/form-data file uploads
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../lib/tools/storage';
import { Logger } from '../lib/utils';

export const config = {
  api: {
    bodyParser: false, // Disable default body parser for file uploads
  },
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type } = req.query; // 'intro' or 'outro'
    
    if (!type || (type !== 'intro' && type !== 'outro')) {
      return res.status(400).json({ 
        error: 'Invalid type parameter. Must be "intro" or "outro"' 
      });
    }

    // Read the entire request body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    if (buffer.length === 0) {
      return res.status(400).json({ error: 'No file data received' });
    }

    // Parse multipart form data manually (simplified version)
    // In production, you'd use a library like 'busboy' or 'formidable'
    const boundaryMatch = req.headers['content-type']?.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
      return res.status(400).json({ 
        error: 'Invalid content-type. Must be multipart/form-data' 
      });
    }

    const boundary = boundaryMatch[1];
    const parts = buffer.toString('binary').split(`--${boundary}`);
    
    let fileBuffer: Buffer | null = null;
    let filename = `${type}.mp3`;

    // Find the file part
    for (const part of parts) {
      if (part.includes('Content-Type: audio/')) {
        // Extract filename from Content-Disposition header
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }

        // Extract the binary data (after double CRLF)
        const dataStartIndex = part.indexOf('\r\n\r\n') + 4;
        const dataEndIndex = part.lastIndexOf('\r\n');
        
        if (dataStartIndex > 3 && dataEndIndex > dataStartIndex) {
          const binaryData = part.substring(dataStartIndex, dataEndIndex);
          fileBuffer = Buffer.from(binaryData, 'binary');
          break;
        }
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ 
        error: 'No audio file found in upload' 
      });
    }

    // Store in S3
    const storage = new StorageTool();
    const s3Path = `music/${type}.mp3`;
    
    Logger.info('Uploading music file', {
      type,
      filename,
      size: fileBuffer.length,
      path: s3Path,
    });

    await storage.put(s3Path, fileBuffer, 'audio/mpeg');
    
    Logger.info('Music file uploaded successfully', { 
      type, 
      path: s3Path,
      size: fileBuffer.length,
    });

    return res.status(200).json({
      success: true,
      message: `${type.charAt(0).toUpperCase() + type.slice(1)} music uploaded successfully`,
      path: s3Path,
      size: fileBuffer.length,
    });

  } catch (error) {
    Logger.error('Failed to upload music', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    return res.status(500).json({
      error: 'Failed to upload music file',
      details: (error as Error).message,
    });
  }
}

