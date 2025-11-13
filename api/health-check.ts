/**
 * Comprehensive Health Check - Tests all system components
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authenticate } from '../lib/middleware/auth';
import { StorageTool } from '../lib/tools/storage';
import { Config } from '../lib/config';
import { Logger } from '../lib/utils';

async function handler(req: VercelRequest, res: VercelResponse) {
  const results: any = {
    timestamp: new Date().toISOString(),
    tests: {},
    overall_status: 'unknown',
  };

  try {
    // Test 1: Environment Variables
    results.tests.env_vars = {
      name: 'Environment Variables',
      status: 'checking',
    };
    
    const hasOpenAI = !!Config.OPENAI_API_KEY;
    const hasStorage = !!Config.BLOB_READ_WRITE_TOKEN;
    const hasBaseUrl = !!Config.PODCAST_BASE_URL;
    
    results.tests.env_vars = {
      name: 'Environment Variables',
      status: (hasOpenAI && hasStorage) ? 'pass' : 'fail',
      details: {
        OPENAI_API_KEY: hasOpenAI ? 'set' : 'MISSING',
        BLOB_READ_WRITE_TOKEN: hasStorage ? 'set' : 'MISSING',
        PODCAST_BASE_URL: hasBaseUrl ? Config.PODCAST_BASE_URL : 'using default',
        NODE_ENV: process.env.NODE_ENV || 'not set',
      },
    };

    // Test 2: Storage Connection
    results.tests.storage = {
      name: 'Vercel Blob Storage',
      status: 'checking',
    };
    
    try {
      const storage = new StorageTool();
      
      // Try to write a test file
      const testPath = `test/${Date.now()}.txt`;
      const testContent = 'Health check test';
      
      const url = await storage.put(testPath, testContent, 'text/plain');
      
      // Try to read it back
      const readContent = await storage.get(testPath);
      const contentMatches = readContent.toString('utf-8') === testContent;
      
      // Try to delete it
      await storage.delete(testPath);
      
      results.tests.storage = {
        name: 'Vercel Blob Storage',
        status: contentMatches ? 'pass' : 'fail',
        details: {
          write: 'success',
          read: contentMatches ? 'success' : 'content mismatch',
          delete: 'success',
          test_url: url,
        },
      };
    } catch (error: any) {
      results.tests.storage = {
        name: 'Vercel Blob Storage',
        status: 'fail',
        error: error.message,
        details: {
          suggestion: 'Check BLOB_READ_WRITE_TOKEN in Vercel environment variables',
        },
      };
    }

    // Test 3: Check for runs index
    results.tests.runs_index = {
      name: 'Runs Index',
      status: 'checking',
    };
    
    try {
      const storage = new StorageTool();
      const exists = await storage.exists('runs/index.json');
      
      let indexData = null;
      if (exists) {
        const data = await storage.get('runs/index.json');
        indexData = JSON.parse(data.toString('utf-8'));
      }
      
      results.tests.runs_index = {
        name: 'Runs Index',
        status: exists ? 'pass' : 'warn',
        details: {
          exists,
          total_runs: indexData?.runs?.length || 0,
          last_updated: indexData?.last_updated || 'never',
        },
      };
    } catch (error: any) {
      results.tests.runs_index = {
        name: 'Runs Index',
        status: 'fail',
        error: error.message,
      };
    }

    // Test 4: Check for episodes
    results.tests.episodes = {
      name: 'Episode Files',
      status: 'checking',
    };
    
    try {
      const storage = new StorageTool();
      const episodeFiles = await storage.list('episodes/');
      
      results.tests.episodes = {
        name: 'Episode Files',
        status: episodeFiles.length > 0 ? 'pass' : 'warn',
        details: {
          count: episodeFiles.length,
          files: episodeFiles.slice(0, 5).map(f => ({
            path: f.path,
            size: f.size,
            uploadedAt: f.uploadedAt,
          })),
        },
      };
    } catch (error: any) {
      results.tests.episodes = {
        name: 'Episode Files',
        status: 'fail',
        error: error.message,
      };
    }

    // Test 5: Check feed.xml
    results.tests.feed = {
      name: 'RSS Feed',
      status: 'checking',
    };
    
    try {
      const storage = new StorageTool();
      const exists = await storage.exists('feed.xml');
      
      results.tests.feed = {
        name: 'RSS Feed',
        status: exists ? 'pass' : 'warn',
        details: {
          exists,
          note: exists ? 'Stored feed found' : 'Will generate from index',
        },
      };
    } catch (error: any) {
      results.tests.feed = {
        name: 'RSS Feed',
        status: 'fail',
        error: error.message,
      };
    }

    // Test 6: Check logs storage path
    results.tests.logs = {
      name: 'Logs Storage',
      status: 'checking',
    };
    
    try {
      const storage = new StorageTool();
      const logFiles = await storage.list('runs/');
      const logFilePaths = logFiles.filter(f => f.path.includes('/logs.jsonl'));
      
      results.tests.logs = {
        name: 'Logs Storage',
        status: logFilePaths.length > 0 ? 'pass' : 'warn',
        details: {
          log_files_count: logFilePaths.length,
          recent_logs: logFilePaths.slice(0, 3).map(f => f.path),
        },
      };
    } catch (error: any) {
      results.tests.logs = {
        name: 'Logs Storage',
        status: 'fail',
        error: error.message,
      };
    }

    // Calculate overall status
    const statuses = Object.values(results.tests).map((t: any) => t.status);
    const hasFail = statuses.includes('fail');
    const hasWarn = statuses.includes('warn');
    
    results.overall_status = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';
    
    // Add recommendations
    results.recommendations = [];
    
    if (!results.tests.env_vars.details.OPENAI_API_KEY || 
        !results.tests.env_vars.details.BLOB_READ_WRITE_TOKEN) {
      results.recommendations.push({
        priority: 'critical',
        issue: 'Missing required environment variables',
        action: 'Run: vercel env add OPENAI_API_KEY and vercel env add BLOB_READ_WRITE_TOKEN',
      });
    }
    
    if (results.tests.storage.status === 'fail') {
      results.recommendations.push({
        priority: 'critical',
        issue: 'Storage is not working',
        action: 'Verify BLOB_READ_WRITE_TOKEN is correct. Get it from: vercel blob ls --token',
      });
    }
    
    if (results.tests.episodes.details?.count > 0 && results.tests.runs_index.details?.total_runs === 0) {
      results.recommendations.push({
        priority: 'high',
        issue: 'Episodes exist but not indexed',
        action: 'Click "Index Existing Episodes" in Settings tab',
      });
    }
    
    if (results.tests.runs_index.details?.total_runs === 0 && results.tests.episodes.details?.count === 0) {
      results.recommendations.push({
        priority: 'info',
        issue: 'No episodes generated yet',
        action: 'Wait for cron job (12:00 UTC daily) or generate manually',
      });
    }

    return res.status(200).json(results);
    
  } catch (error: any) {
    Logger.error('Health check failed', {
      error: error.message,
      stack: error.stack,
    });
    
    return res.status(500).json({
      overall_status: 'error',
      error: error.message,
      stack: error.stack,
    });
  }
}

export default authenticate(handler);

