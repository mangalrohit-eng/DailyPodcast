/**
 * Admin Tools API - Diagnostics and testing
 * 
 * POST /api/test-run - Run system test with OpenAI check
 * POST /api/test-run?action=index - Index existing episodes
 * GET /api/test-run?debug=true - Debug runs index and storage
 * GET /api/test-run?health=true - Comprehensive health check
 * GET /api/test-run?action=progress&runId=X - Get run progress
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthMiddleware } from '../lib/middleware/auth';
import { RunsStorage } from '../lib/tools/runs-storage';
import { Config } from '../lib/config';
import { Logger } from '../lib/utils';
import { StorageTool } from '../lib/tools/storage';
import { progressTracker } from '../lib/tools/progress-tracker';
import { ConfigStorage } from '../lib/tools/config-storage';
import OpenAI from 'openai';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Wrap everything to ensure we always return JSON
  try {
    return await AuthMiddleware.protect(req, res, async (req, res) => {
      // Handle GET requests
      if (req.method === 'GET') {
        const action = req.query.action as string;
        const health = req.query.health;
        const debug = req.query.debug;
        
        if (action === 'progress') {
          return handleProgress(req, res);
        } else if (action === 'debug-config') {
          return handleDebugConfig(req, res);
        } else if (health) {
          return handleHealthCheck(req, res);
        } else if (debug) {
          return handleDebug(req, res);
        } else {
          return res.status(400).json({ error: 'Use ?health=true, ?debug=true, ?action=progress, or ?action=debug-config' });
        }
      }
      
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      
      // Handle POST requests
      const action = req.query.action as string;
      if (action === 'index') {
        return handleIndexEpisodes(req, res);
      }
      
      const testRunId = `test-${new Date().toISOString().split('T')[0]}-${Date.now()}`;
      
      try {
      Logger.info('Test run started', { testRunId });
      
      // Test 1: Check OpenAI API key
      Logger.info('✓ Checking OpenAI API key...');
      const hasOpenAI = !!Config.OPENAI_API_KEY;
      Logger.info(hasOpenAI ? '✓ OpenAI API key configured' : '✗ OpenAI API key missing', {
        configured: hasOpenAI,
      });
      
      // Test 2: Check storage
      Logger.info('✓ Checking storage...');
      const hasStorage = !!Config.BLOB_READ_WRITE_TOKEN;
      Logger.info(hasStorage ? '✓ Blob storage configured' : '✗ Blob storage not configured', {
        configured: hasStorage,
      });
      
      // Test 3: Check topic config
      Logger.info('✓ Checking topics...');
      const topics = Config.getTopicConfigs();
      Logger.info(`✓ Found ${topics.length} topics`, {
        topics: topics.map(t => ({ name: t.name, weight: t.weight, sources: t.sources.length })),
      });
      
      // Test 4: Check runs storage
      Logger.info('✓ Testing runs storage...');
      const runsStorage = new RunsStorage();
      const activeRun = RunsStorage.getActiveRunId();
      Logger.info(activeRun ? `⚠️ Active run detected: ${activeRun}` : '✓ No active runs', {
        activeRun,
      });
      
      // Test 5: Check window hours and duration
      Logger.info('✓ Checking config values...');
      Logger.info('Config loaded', {
        window_hours: Config.WINDOW_HOURS,
        target_duration: Config.TARGET_DURATION_SECONDS,
        rumor_filter: Config.RUMOR_FILTER,
      });
      
      // Test 6: Try a small OpenAI API call (just to test quota/rate limits)
      Logger.info('✓ Testing OpenAI API access with retry logic...');
      if (!Config.OPENAI_API_KEY) {
        Logger.warn('⚠️ OpenAI API key not configured, skipping API test');
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
          
          Logger.info('✓ OpenAI API call successful', {
            model: response.model,
            usage: response.usage,
          });
        } catch (openaiError: any) {
          const errorMsg = openaiError.message || openaiError.toString();
          const errorCode = openaiError.code || openaiError.type;
          const errorStatus = openaiError.status;
          
          Logger.error('✗ OpenAI API call failed after retries', {
            error: errorMsg,
            code: errorCode,
            status: errorStatus,
            type: openaiError.type,
          });
          
          // Check for rate limit errors
          if (errorStatus === 429 || errorCode === 'rate_limit_exceeded' || errorMsg.includes('rate limit')) {
            Logger.error('⏱️ RATE LIMIT: OpenAI API rate limit exceeded', {
              solution1: 'Requests are being retried automatically with exponential backoff',
              solution2: 'If persistent, wait 60 seconds and try again',
              solution3: 'Check rate limits at https://platform.openai.com/account/limits',
              note: 'This is different from quota - you have credits but are making requests too fast',
            });
          }
          
          // Check for quota/billing errors
          if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota') || 
              errorMsg.includes('billing') || errorCode === 'insufficient_quota') {
            Logger.error('💳 QUOTA ERROR: OpenAI API quota exceeded or billing issue detected', {
              solution1: 'Add payment method at https://platform.openai.com/account/billing',
              solution2: 'Check usage at https://platform.openai.com/usage',
              solution3: 'Verify API key has credits',
            });
          }
        }
      }
      
      // Flush logs
      Logger.info('✓ Test run completed');
      
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
      
      Logger.error('✗ Test run failed', {
        error: errorMsg,
        code: errorCode,
        stack: (error as Error).stack,
      });
      
      // Special handling for quota errors
      if (errorMsg.includes('quota') || errorMsg.includes('insufficient_quota') || 
          errorMsg.includes('billing') || errorCode === 'insufficient_quota') {
        Logger.error('💳 CRITICAL: OpenAI quota/billing issue detected', {
          error: errorMsg,
          action_required: 'Add payment method or wait for quota reset',
          billing_url: 'https://platform.openai.com/account/billing',
        });
      }
      
      
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
 * Handle health check request - comprehensive system diagnostics
 */
async function handleHealthCheck(req: VercelRequest, res: VercelResponse) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    overall_status: 'unknown',
  };

  try {
    const storage = new StorageTool();

    // Test 1: Environment Variables
    const hasOpenAI = !!Config.OPENAI_API_KEY;
    const hasS3AccessKey = !!Config.S3_ACCESS_KEY;
    const hasS3SecretKey = !!Config.S3_SECRET_KEY;
    const hasS3Bucket = !!Config.S3_BUCKET;
    const hasS3Region = !!Config.S3_REGION;
    const hasAllS3Creds = hasS3AccessKey && hasS3SecretKey && hasS3Bucket && hasS3Region;
    const hasBaseUrl = !!Config.PODCAST_BASE_URL;
    
    results.tests.env_vars = {
      name: 'Environment Variables',
      status: (hasOpenAI && hasAllS3Creds) ? 'pass' : 'fail',
      details: {
        OPENAI_API_KEY: hasOpenAI ? 'set' : 'MISSING',
        S3_ACCESS_KEY: hasS3AccessKey ? 'set' : 'MISSING',
        S3_SECRET_KEY: hasS3SecretKey ? 'set' : 'MISSING',
        S3_BUCKET: hasS3Bucket ? Config.S3_BUCKET : 'MISSING',
        S3_REGION: hasS3Region ? Config.S3_REGION : 'MISSING',
        S3_ENDPOINT: Config.S3_ENDPOINT || '(using AWS S3)',
        PODCAST_BASE_URL: hasBaseUrl ? Config.PODCAST_BASE_URL : 'using default',
      },
    };

    // Test 2: AWS S3 Storage Connection
    try {
      const testPath = `health-check/test-${Date.now()}.txt`;
      const testContent = 'AWS S3 health check test';
      
      Logger.info('Testing S3 write...', { path: testPath });
      const url = await storage.put(testPath, testContent, 'text/plain');
      
      Logger.info('Testing S3 read...', { path: testPath });
      const readContent = await storage.get(testPath);
      const contentMatches = readContent.toString('utf-8') === testContent;
      
      Logger.info('Testing S3 delete...', { path: testPath });
      await storage.delete(testPath);
      
      results.tests.storage = {
        name: 'AWS S3 Storage',
        status: contentMatches ? 'pass' : 'fail',
        details: { 
          write: 'success', 
          read: contentMatches ? 'success' : 'mismatch', 
          delete: 'success',
          bucket: Config.S3_BUCKET,
          region: Config.S3_REGION,
          endpoint: Config.S3_ENDPOINT || 'AWS S3 default',
        },
      };
    } catch (error: any) {
      results.tests.storage = {
        name: 'AWS S3 Storage',
        status: 'fail',
        error: error.message,
        details: {
          bucket: Config.S3_BUCKET || 'NOT SET',
          region: Config.S3_REGION || 'NOT SET',
          hint: 'Check S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET, and S3_REGION environment variables',
        },
      };
    }

    // Test 3: Runs Index
    try {
      const exists = await storage.exists('runs/index.json');
      let indexData = null;
      if (exists) {
        const data = await storage.get('runs/index.json');
        indexData = JSON.parse(data.toString('utf-8'));
      }
      results.tests.runs_index = {
        name: 'Runs Index',
        status: exists ? 'pass' : 'warn',
        details: { exists, total_runs: indexData?.runs?.length || 0 },
      };
    } catch (error: any) {
      results.tests.runs_index = { name: 'Runs Index', status: 'fail', error: error.message };
    }

    // Test 4: Episodes
    try {
      const episodeFiles = await storage.list('episodes/');
      
      // Filter out folder markers (0-byte objects ending with /)
      const actualFiles = episodeFiles.filter(file => 
        !file.path.endsWith('/') && file.size > 0
      );
      
      // Log for debugging
      Logger.info('Episode files listed', {
        total_objects: episodeFiles.length,
        actual_files: actualFiles.length,
        all_paths: episodeFiles.map(f => ({ path: f.path, size: f.size })),
      });
      
      results.tests.episodes = {
        name: 'Episode Files',
        status: actualFiles.length > 0 ? 'pass' : 'warn',
        details: { 
          count: actualFiles.length,
          total_objects: episodeFiles.length,
          files: actualFiles.map(f => ({
            name: f.path.split('/').pop(),
            size: f.size,
            url: f.url,
          })),
        },
      };
    } catch (error: any) {
      results.tests.episodes = { name: 'Episode Files', status: 'fail', error: error.message };
    }

    // Calculate overall status
    const statuses = Object.values(results.tests).map((t: any) => t.status);
    results.overall_status = statuses.includes('fail') ? 'fail' : statuses.includes('warn') ? 'warn' : 'pass';
    
    // Recommendations
    results.recommendations = [];
    if (!hasOpenAI || !hasAllS3Creds) {
      const missing = [];
      if (!hasOpenAI) missing.push('OPENAI_API_KEY');
      if (!hasS3AccessKey) missing.push('S3_ACCESS_KEY');
      if (!hasS3SecretKey) missing.push('S3_SECRET_KEY');
      if (!hasS3Bucket) missing.push('S3_BUCKET');
      if (!hasS3Region) missing.push('S3_REGION');
      
      results.recommendations.push({
        priority: 'critical',
        issue: `Missing required environment variables: ${missing.join(', ')}`,
        action: 'Add missing variables in Vercel → Settings → Environment Variables. See AWS_S3_SETUP.md for details.',
      });
    }
    if (results.tests.storage?.status === 'fail') {
      results.recommendations.push({
        priority: 'critical',
        issue: 'AWS S3 storage is not working',
        action: 'Verify S3 credentials are correct. Check bucket exists, IAM user has S3FullAccess, and region matches bucket location.',
      });
    }
    if (results.tests.episodes?.details?.count === 0) {
      results.recommendations.push({
        priority: 'info',
        issue: 'No episodes found in S3',
        action: 'This is a fresh start. Click "Run Now" to generate your first episode.',
      });
    }

    return res.status(200).json(results);
  } catch (error: any) {
    return res.status(500).json({
      overall_status: 'error',
      error: error.message,
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

/**
 * Handle progress request - get run progress
 */
async function handleProgress(req: VercelRequest, res: VercelResponse) {
  const runId = req.query.runId as string;

  if (!runId) {
    return res.status(400).json({ error: 'Missing runId parameter' });
  }

  // Try to get progress from in-memory tracker first
  let progress = progressTracker.getProgress(runId);

  // Fallback: Check RunsStorage for active/recent runs
  // This handles the case where the orchestrator is running in a different serverless instance
  if (!progress) {
    try {
      const runsStorage = new RunsStorage();
      
      if (runId === 'latest') {
        // Get all runs, find the most recent one
        const allRuns = await runsStorage.list();
        
        if (allRuns.runs.length > 0) {
          // Sort by run_id (which includes timestamp) to get the most recent
          const sortedRuns = allRuns.runs.sort((a, b) => {
            return b.run_id.localeCompare(a.run_id);
          });
          
          const latestRun = sortedRuns[0];
          
          // Return synthetic progress based on run status
          progress = {
            runId: latestRun.run_id,
            status: latestRun.status as 'running' | 'completed' | 'failed',
            progress: latestRun.status === 'success' ? 100 : latestRun.status === 'failed' ? 0 : 50,
            currentPhase: latestRun.status === 'success' ? 'Complete' : latestRun.status === 'failed' ? 'Failed' : 'Processing',
            startedAt: new Date(latestRun.date).toISOString(),
            updates: [
              {
                phase: latestRun.status === 'success' ? 'Complete' : 'Processing',
                status: latestRun.status as any,
                message: latestRun.status === 'success' 
                  ? `Episode generated successfully! ${latestRun.stories_count || 0} stories, ${Math.round((latestRun.duration_ms || 0) / 1000)}s`
                  : latestRun.status === 'failed'
                  ? 'Episode generation failed'
                  : 'Episode is being generated in the background (Vercel timeout after 10s)',
                timestamp: new Date().toISOString(),
                details: latestRun.status === 'success' ? {
                  episode_url: latestRun.episode_url,
                } : undefined,
              },
            ],
          };
          
          Logger.info('Synthesized progress from RunsStorage', {
            runId: latestRun.run_id,
            status: latestRun.status,
          });
        }
      } else {
        // Specific runId requested
        const runSummary = await runsStorage.get(runId);
        
        if (runSummary) {
          progress = {
            runId: runSummary.run_id,
            status: runSummary.status as 'running' | 'completed' | 'failed',
            progress: runSummary.status === 'success' ? 100 : runSummary.status === 'failed' ? 0 : 50,
            currentPhase: runSummary.status === 'success' ? 'Complete' : runSummary.status === 'failed' ? 'Failed' : 'Processing',
            startedAt: new Date(runSummary.date).toISOString(),
            updates: [
              {
                phase: runSummary.status === 'success' ? 'Complete' : 'Processing',
                status: runSummary.status as any,
                message: runSummary.status === 'success' 
                  ? `Episode generated successfully! ${runSummary.stories_count || 0} stories, ${Math.round((runSummary.duration_ms || 0) / 1000)}s`
                  : runSummary.status === 'failed'
                  ? 'Episode generation failed'
                  : 'Episode is being generated in the background',
                timestamp: new Date().toISOString(),
                details: runSummary.status === 'success' ? {
                  episode_url: runSummary.episode_url,
                } : undefined,
              },
            ],
          };
          
          Logger.info('Synthesized progress from RunsStorage for specific runId', {
            runId: runSummary.run_id,
            status: runSummary.status,
          });
        }
      }
    } catch (error) {
      Logger.error('Failed to fetch progress from RunsStorage', {
        error: (error as Error).message,
      });
    }
  }

  if (!progress) {
    return res.status(404).json({ 
      error: 'Run not found', 
      hint: 'The run may still be starting. Wait a few seconds and refresh the Runs tab.',
    });
  }

  // Clean up old runs from in-memory tracker
  progressTracker.clearOldRuns();

  return res.status(200).json(progress);
}

/**
 * Handle index episodes request - scan and index existing episodes
 */
async function handleIndexEpisodes(req: VercelRequest, res: VercelResponse) {
  try {
    const storage = new StorageTool();
    
    Logger.info('Scanning for existing episodes...');
    
    // List all objects in episodes directory
    const objects = await storage.list('episodes/');
    
    Logger.info('All objects in episodes/', {
      total: objects.length,
      objects: objects.map(o => ({ path: o.path, size: o.size })),
    });
    
    // Filter out folder markers (0-byte objects ending with /)
    const actualFiles = objects.filter(obj => 
      !obj.path.endsWith('/') && obj.size > 0
    );
    
    // Find MP3 files
    const mp3Objects = actualFiles.filter(obj => obj.path.endsWith('.mp3'));
    
    // Find non-MP3 files for reporting
    const nonMp3Files = actualFiles.filter(obj => !obj.path.endsWith('.mp3'));
    
    Logger.info(`Found ${actualFiles.length} files (${mp3Objects.length} MP3s, ${nonMp3Files.length} non-MP3)`);
    
    const indexed: any[] = [];
    const skipped: any[] = [];
    
    // Load or create runs index
    let runsIndex: any = { runs: [], last_updated: new Date().toISOString() };
    
    try {
      const existingIndex = await storage.get('runs/index.json');
      runsIndex = JSON.parse(existingIndex.toString('utf-8'));
    } catch {
      // Index doesn't exist yet, will create new one
      Logger.info('Creating new runs index');
    }
    
    // Report non-MP3 files
    for (const file of nonMp3Files) {
      const filename = file.path.split('/').pop() || '';
      skipped.push({ 
        filename, 
        reason: 'Wrong file extension (expected .mp3)',
        hint: filename.endsWith('.mp4') ? 
          'Rename to .mp3 if this is an audio file' : 
          'Only .mp3 files are indexed',
      });
      Logger.warn(`Skipping non-MP3 file: ${filename}`);
    }
    
    for (const mp3Obj of mp3Objects) {
      const filename = mp3Obj.path.split('/').pop() || '';
      const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})_daily_rohit_news\.mp3$/);
      
      if (!dateMatch) {
        skipped.push({ 
          filename, 
          reason: 'Filename does not match expected pattern',
          expected: 'YYYY-MM-DD_daily_rohit_news.mp3',
        });
        Logger.warn(`Skipping ${filename} - doesn't match pattern`);
        continue;
      }
      
      const date = dateMatch[1];
      
      // Check if already in index WITH an episode URL
      const existing = runsIndex.runs.find((r: any) => r.run_id === date && r.episode_url);
      
      if (existing) {
        skipped.push({ 
          filename, 
          reason: `Already indexed (${date}) with episode URL`,
        });
        continue;
      }
      
      // Remove any failed runs for this date to make room for successful episode
      runsIndex.runs = runsIndex.runs.filter((r: any) => r.run_id !== date);
      
      // Add to index
      const runSummary = {
        run_id: date,
        date: date,
        status: 'success',
        started_at: mp3Obj.uploadedAt.toISOString(),
        completed_at: mp3Obj.uploadedAt.toISOString(),
        episode_url: mp3Obj.url,
        stories_count: 0, // Unknown for pre-dashboard episodes
        duration_ms: 0, // Unknown
      };
      
      runsIndex.runs.unshift(runSummary);
      indexed.push(runSummary);
      
      Logger.info(`Indexed episode: ${date}`);
    }
    
    // Save updated index
    if (indexed.length > 0) {
      runsIndex.last_updated = new Date().toISOString();
      
      await storage.put(
        'runs/index.json',
        JSON.stringify(runsIndex, null, 2),
        'application/json'
      );
      
      Logger.info(`Saved runs index with ${runsIndex.runs.length} total runs`);
    }
    
    res.status(200).json({
      success: true,
      indexed: indexed.length,
      skipped: skipped.length,
      skipped_files: skipped,
      total_files_found: actualFiles.length,
      episodes: indexed.map(e => ({
        date: e.date,
        url: e.episode_url,
      })),
      message: indexed.length > 0 
        ? `Indexed ${indexed.length} episode(s). Refresh to see them.`
        : `No episodes indexed. ${skipped.length} file(s) skipped. See skipped_files for details.`,
    });
    
  } catch (error) {
    Logger.error('Failed to index episodes', {
      error: (error as Error).message,
    });
    
    res.status(500).json({
      error: 'Failed to index episodes',
      message: (error as Error).message,
    });
  }
}

/**
 * Debug config - show what's in S3
 */
async function handleDebugConfig(req: VercelRequest, res: VercelResponse) {
  try {
    Logger.info('🔍 Debug config requested');
    
    const configStorage = new ConfigStorage();
    const config = await configStorage.load();
    
    const memoryConfig = {
      topics: Config.getTopicConfigs().map(t => ({
        name: t.name,
        weight: t.weight,
        sources_count: t.sources.length,
      })),
      window_hours: Config.WINDOW_HOURS,
      target_duration: Config.TARGET_DURATION_SECONDS,
      rumor_filter: Config.RUMOR_FILTER,
    };
    
    return res.status(200).json({
      success: true,
      s3_config: {
        topics: config.topics?.map((t: any) => ({ label: t.label, weight: t.weight })) || [],
        window_hours: config.window_hours,
        target_duration_sec: config.target_duration_sec,
        rumor_filter: config.rumor_filter,
        has_podcast_production: !!config.podcast_production,
        version: config.version,
      },
      memory_config: memoryConfig,
      note: 'S3 config (dashboard) should override memory config when running'
    });
  } catch (error) {
    Logger.error('Failed to debug config', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    });
    
    return res.status(500).json({
      error: 'Failed to load config',
      message: (error as Error).message,
    });
  }
}

