/**
 * Admin Tools API - Diagnostics and testing
 * 
 * POST /api/test-run - Run system test with OpenAI check
 * GET /api/test-run?debug=true - Debug runs index and storage
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { StructuredLogger } from '../lib/tools/logs-storage';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Config } from '../lib/config';
import { Logger } from '../lib/utils';
import { StorageTool } from '../lib/tools/storage';
import OpenAI from 'openai';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Wrap everything to ensure we always return JSON
  try {
    return await AuthMiddleware.protect(req, res, async (req, res) => {
      // Handle GET request for debug info
      if (req.method === 'GET') {
        return handleDebug(req, res);
      }
      
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
      
      // Test 6: Try a small OpenAI API call (just to test quota/rate limits)
      await logger.info('✓ Testing OpenAI API access with retry logic...');
      if (!Config.OPENAI_API_KEY) {
        await logger.warn('⚠️ OpenAI API key not configured, skipping API test');
      } else {
        try {
          const { createChatCompletion } = await import('../lib/utils/openai-helper');
          
          const openai = new OpenAI({
            apiKey: Config.OPENAI_API_KEY,
          });
          
          // Smallest possible API call to test quota with retry logic
          const response = await createChatCompletion(
            openai,
            {
              model: 'gpt-3.5-turbo',
              messages: [{ role: 'user', content: 'Test' }],
              max_tokens: 1,
            },
            {
              maxRetries: 2,
              initialDelayMs: 1000,
            }
          );
          
          await logger.info('✓ OpenAI API call successful', {
            model: response.model,
            usage: response.usage,
          });
        } catch (openaiError: any) {
          const errorMsg = openaiError.message || openaiError.toString();
          const errorCode = openaiError.code || openaiError.type;
          const errorStatus = openaiError.status;
          
          await logger.error('✗ OpenAI API call failed after retries', {
            error: errorMsg,
            code: errorCode,
            status: errorStatus,
            type: openaiError.type,
          });
          
          // Check for rate limit errors
          if (errorStatus === 429 || errorCode === 'rate_limit_exceeded' || errorMsg.includes('rate limit')) {
            await logger.error('⏱️ RATE LIMIT: OpenAI API rate limit exceeded', {
              solution1: 'Requests are being retried automatically with exponential backoff',
              solution2: 'If persistent, wait 60 seconds and try again',
              solution3: 'Check rate limits at https://platform.openai.com/account/limits',
              note: 'This is different from quota - you have credits but are making requests too fast',
            });
          }
          
          // Check for quota/billing errors
          if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota') || 
              errorMsg.includes('billing') || errorCode === 'insufficient_quota') {
            await logger.error('💳 QUOTA ERROR: OpenAI API quota exceeded or billing issue detected', {
              solution1: 'Add payment method at https://platform.openai.com/account/billing',
              solution2: 'Check usage at https://platform.openai.com/usage',
              solution3: 'Verify API key has credits',
            });
          }
        }
      }
      
      // Flush logs
      await logger.flush();
      await logger.info('✓ Test run completed');
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
      
    } catch (error: any) {
      const errorMsg = (error as Error).message;
      const errorCode = error.code || error.type;
      
      await logger.error('✗ Test run failed', {
        error: errorMsg,
        code: errorCode,
        stack: (error as Error).stack,
      });
      
      // Special handling for quota errors
      if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota') || 
          errorMsg.includes('billing') || errorCode === 'insufficient_quota') {
        await logger.error('💳 CRITICAL: OpenAI quota/billing issue detected', {
          error: errorMsg,
          action_required: 'Add payment method or wait for quota reset',
          billing_url: 'https://platform.openai.com/account/billing',
        });
      }
      
      await logger.flush();
      
      Logger.error('Test run failed', {
        testRunId,
        error: errorMsg,
      });
      
      res.status(500).json({
        success: false,
        error: errorMsg,
        code: errorCode,
        testRunId,
        isQuotaError: errorMsg.includes('quota') || errorMsg.includes('insufficient_quota'),
      });
      }
    });
  } catch (outerError: any) {
    // Catch any errors not caught by inner try-catch (e.g., auth failures)
    Logger.error('Test run outer error', {
      error: outerError.message,
      stack: outerError.stack,
    });
    
    return res.status(500).json({
      success: false,
      error: outerError.message || 'Internal server error',
      details: 'An unexpected error occurred during test run',
    });
  }
}

/**
 * Handle debug request - inspect runs index and storage
 */
async function handleDebug(req: VercelRequest, res: VercelResponse) {
  try {
    const storage = new StorageTool();
    
    // Check what exists in storage
    const indexExists = await storage.exists('runs/index.json');
    const feedExists = await storage.exists('feed.xml');
    
    let indexData = null;
    let episodeCount = 0;
    
    if (indexExists) {
      const data = await storage.get('runs/index.json');
      indexData = JSON.parse(data.toString('utf-8'));
      episodeCount = indexData.runs?.filter((r: any) => r.episode_url)?.length || 0;
    }
    
    // List all files in episodes directory
    const episodeFiles = await storage.list('episodes/');
    
    return res.status(200).json({
      storage: {
        runs_index_exists: indexExists,
        feed_xml_exists: feedExists,
      },
      runs_index: indexData,
      episode_files: episodeFiles.map(f => ({
        path: f.path,
        url: f.url,
        uploadedAt: f.uploadedAt,
      })),
      summary: {
        total_runs: indexData?.runs?.length || 0,
        runs_with_episodes: episodeCount,
        episode_files_count: episodeFiles.length,
      },
    });
  } catch (error) {
    Logger.error('Debug request failed', {
      error: (error as Error).message,
    });
    
    return res.status(500).json({
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
  }
}

