/**
 * Test script for External API
 * 
 * Usage:
 *   Set EXTERNAL_API_KEY environment variable
 *   Set API_BASE_URL environment variable (e.g., https://your-domain.vercel.app)
 *   ts-node scripts/test-external-api.ts
 */

const API_KEY = process.env.EXTERNAL_API_KEY;
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

if (!API_KEY) {
  console.error('❌ EXTERNAL_API_KEY environment variable not set');
  process.exit(1);
}

async function testTriggerRun() {
  console.log('\n📡 Testing: Trigger Run');
  
  try {
    const response = await fetch(`${BASE_URL}/api/external/trigger-run`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        force_overwrite: false,
      }),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Trigger Run:', result.run_id);
      return result.run_id;
    } else {
      console.error('❌ Trigger Run failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Trigger Run error:', error);
    return null;
  }
}

async function testRunStatus(runId?: string) {
  console.log('\n📡 Testing: Run Status');
  
  try {
    const url = runId 
      ? `${BASE_URL}/api/external/run-status?runId=${runId}`
      : `${BASE_URL}/api/external/run-status`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Run Status:', {
        run_id: result.run_id,
        status: result.status,
        current_phase: result.current_phase,
        progress_updates: result.progress_updates?.length || 0,
      });
      return result;
    } else {
      console.error('❌ Run Status failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Run Status error:', error);
    return null;
  }
}

async function testRunLogs(runId: string, agent?: string) {
  console.log('\n📡 Testing: Run Logs');
  
  try {
    const url = agent
      ? `${BASE_URL}/api/external/run-logs?runId=${runId}&agent=${agent}`
      : `${BASE_URL}/api/external/run-logs?runId=${runId}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });
    
    const result = await response.json();
    
    if (response.ok) {
      const agentCount = Object.keys(result.logs).filter(k => result.logs[k] !== null).length;
      console.log('✅ Run Logs:', {
        run_id: result.run_id,
        agents_with_logs: agentCount,
      });
      return result;
    } else {
      console.error('❌ Run Logs failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Run Logs error:', error);
    return null;
  }
}

async function testRunErrors(runId: string) {
  console.log('\n📡 Testing: Run Errors');
  
  try {
    const response = await fetch(`${BASE_URL}/api/external/run-errors?runId=${runId}`, {
      headers: {
        'X-API-Key': API_KEY,
      },
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Run Errors:', {
        run_id: result.run_id,
        has_errors: result.has_errors,
        error_count: result.error_count,
      });
      
      if (result.has_errors) {
        result.errors.forEach((err: any) => {
          console.log(`   ⚠️ ${err.agent}:`, err.errors);
        });
      }
      
      return result;
    } else {
      console.error('❌ Run Errors failed:', result.error);
      return null;
    }
  } catch (error) {
    console.error('❌ Run Errors error:', error);
    return null;
  }
}

async function testAuth() {
  console.log('\n📡 Testing: Authentication');
  
  // Test with invalid key
  try {
    const response = await fetch(`${BASE_URL}/api/external/run-status`, {
      headers: {
        'X-API-Key': 'invalid-key',
      },
    });
    
    if (response.status === 401) {
      console.log('✅ Auth rejection works correctly');
    } else {
      console.error('❌ Auth should have rejected invalid key');
    }
  } catch (error) {
    console.error('❌ Auth test error:', error);
  }
}

async function runTests() {
  console.log('🚀 External API Test Suite');
  console.log('===========================');
  console.log('Base URL:', BASE_URL);
  console.log('API Key:', API_KEY.substring(0, 8) + '...');
  
  // Test auth first
  await testAuth();
  
  // Get latest run status
  const statusResult = await testRunStatus();
  
  if (statusResult && statusResult.run_id) {
    // Test logs and errors for latest run
    await testRunLogs(statusResult.run_id);
    await testRunErrors(statusResult.run_id);
  }
  
  // Optionally trigger a new run (commented out to avoid accidental triggers)
  // const runId = await testTriggerRun();
  // if (runId) {
  //   console.log('\n⏳ Waiting 30s for run to start...');
  //   await new Promise(resolve => setTimeout(resolve, 30000));
  //   await testRunStatus(runId);
  // }
  
  console.log('\n✅ Test suite completed');
}

runTests();

