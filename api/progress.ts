/**
 * Progress API - Get real-time progress for running episodes
 * 
 * GET /api/progress?runId=2025-11-13
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { progressTracker } from '../lib/tools/progress-tracker';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const runId = req.query.runId as string;

  if (!runId) {
    return res.status(400).json({ error: 'Missing runId parameter' });
  }

  const progress = progressTracker.getProgress(runId);

  if (!progress) {
    return res.status(404).json({ error: 'Run not found or completed' });
  }

  // Clean up old runs
  progressTracker.clearOldRuns();

  return res.status(200).json(progress);
}

