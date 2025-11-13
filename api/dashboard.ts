/**
 * Dashboard Page
 * 
 * GET /api/dashboard - Serve dashboard HTML
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { readFileSync } from 'fs';
import { join } from 'path';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Check authentication
  const authResult = AuthMiddleware.verify(req);
  
  if (!authResult.authenticated) {
    // Return 401 with basic auth prompt
    res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
    return res.status(401).send('Authentication required');
  }
  
  try {
    // Serve dashboard HTML
    const dashboardPath = join(process.cwd(), 'public', 'dashboard.html');
    const html = readFileSync(dashboardPath, 'utf-8');
    
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send('Dashboard not found');
  }
}

