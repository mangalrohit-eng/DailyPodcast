import type { VercelRequest, VercelResponse } from '@vercel/node';
import { RunsStorage } from '../../lib/tools/runs-storage';
import { StorageTool } from '../../lib/tools/storage';
import { Logger } from '../../lib/utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { runId } = req.query;

  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid runId' });
  }

  try {
    if (req.method === 'DELETE') {
      await deleteRun(runId);
      Logger.info(`Episode deleted: ${runId}`);
      return res.status(200).json({ success: true, message: 'Episode deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    Logger.error('Error handling run request', { error, runId });
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
}

async function deleteRun(runId: string): Promise<void> {
  const storage = new StorageTool();
  const runsStorage = new RunsStorage();

  try {
    // Delete manifest file
    const manifestPath = `episodes/${runId}_manifest.json`;
    try {
      await storage.delete(manifestPath);
      Logger.info(`Deleted manifest: ${manifestPath}`);
    } catch (error) {
      Logger.warn(`Failed to delete manifest (may not exist): ${manifestPath}`, { error });
    }

    // Delete audio file (if exists)
    const audioPath = `episodes/${runId}.mp3`;
    try {
      await storage.delete(audioPath);
      Logger.info(`Deleted audio: ${audioPath}`);
    } catch (error) {
      Logger.warn(`Failed to delete audio (may not exist): ${audioPath}`, { error });
    }

    // Delete from runs storage index
    try {
      await runsStorage.deleteRun(runId);
      Logger.info(`Deleted from runs index: ${runId}`);
    } catch (error) {
      Logger.warn(`Failed to delete from runs index: ${runId}`, { error });
    }

    Logger.info(`Successfully deleted episode: ${runId}`);
  } catch (error) {
    Logger.error(`Error deleting episode: ${runId}`, { error });
    throw error;
  }
}

