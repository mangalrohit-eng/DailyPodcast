/**
 * Test Run API - Quick diagnostic endpoint
 * 
 * POST /api/test-run - Test episode generation with detailed logging
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { StructuredLogger } from '../lib/tools/logs-storage';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Config } from '../lib/config';
import { Logger } from '../lib/utils';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  return AuthMiddleware.protect(req, res, async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const testRunId = `test-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
    const logger = new StructuredLogger(testRunId);
    
    try {
      await logger.info('🧪 Test run started', { testRunId });
      Logger.info('Test run started', { testRunId });
      
      // Test 1: Check OpenAI API key
      await logger.info('✓ Checking OpenAI API key...');
      const hasOpenAI = !!Config.OPENAI_API_KEY;
      await logger.info(hasOpenAI ? '✓ OpenAI API key configured' : '✗ OpenAI API key missing', {
        configured: hasOpenAI,
      });
      
      // Test 2: Check storage
      await logger.info('✓ Checking storage...');
      const hasStorage = !!Config.BLOB_READ_WRITE_TOKEN;
      await logger.info(hasStorage ? '✓ Blob storage configured' : '✗ Blob storage not configured', {
        configured: hasStorage,
      });
      
      // Test 3: Check topic config
      await logger.info('✓ Checking topics...');
      const topics = Config.getTopicConfigs();
      await logger.info(`✓ Found ${topics.length} topics`, {
        topics: topics.map(t => ({ name: t.name, weight: t.weight, sources: t.sources.length })),
      });
      
      // Test 4: Check runs storage
      await logger.info('✓ Testing runs storage...');
      const runsStorage = new RunsStorage();
      const activeRun = RunsStorage.getActiveRunId();
      await logger.info(activeRun ? `⚠️ Active run detected: ${activeRun}` : '✓ No active runs', {
        activeRun,
      });
      
      // Test 5: Check window hours and duration
      await logger.info('✓ Checking config values...');
      await logger.info('Config loaded', {
        window_hours: Config.WINDOW_HOURS,
        target_duration: Config.TARGET_DURATION_SECONDS,
        rumor_filter: Config.RUMOR_FILTER,
      });
      
      // Flush logs
      await logger.flush();
      await logger.info('✓ Test run completed successfully');
      await logger.flush();
      
      Logger.info('Test run completed', { testRunId });
      
      res.status(200).json({
        success: true,
        testRunId,
        message: 'Test completed. Check Logs tab for detailed results.',
        checks: {
          openai: hasOpenAI,
          storage: hasStorage,
          topics: topics.length,
          activeRun: activeRun || null,
          config: {
            window_hours: Config.WINDOW_HOURS,
            target_duration_sec: Config.TARGET_DURATION_SECONDS,
          },
        },
      });
      
    } catch (error) {
      await logger.error('✗ Test run failed', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      await logger.flush();
      
      Logger.error('Test run failed', {
        testRunId,
        error: (error as Error).message,
      });
      
      res.status(500).json({
        success: false,
        error: (error as Error).message,
        testRunId,
      });
    }
  });
}

