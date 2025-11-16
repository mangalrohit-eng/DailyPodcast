/**
 * Test Scriptwriter Locally
 * 
 * This script fetches data from a recent successful run and tests
 * the scriptwriter prompts without running the full pipeline.
 * 
 * Usage:
 *   npm run test-scriptwriter
 *   npm run test-scriptwriter -- 2025-11-16_1763252670339  # with specific runId
 */

import { ScriptwriterAgent } from '../lib/agents/scriptwriter';
import { StorageTool } from '../lib/tools/storage';
import { Logger } from '../lib/utils';
import * as fs from 'fs';
import * as path from 'path';

async function testScriptwriter() {
  // Get runId from command line or use 'latest'
  const runId = process.argv[2] || 'latest';
  
  console.log('\n🎙️  Testing Scriptwriter Locally\n');
  console.log('='.repeat(50));
  
  try {
    // 1. Fetch manifest from most recent run
    console.log('\n📥 Step 1: Fetching run data...');
    const storage = new StorageTool();
    
    let manifestPath: string;
    
    if (runId === 'latest') {
      // Get latest run from index
      const indexData = await storage.get('runs/index.json');
      const index = JSON.parse(indexData);
      
      // Find most recent successful run
      const successfulRuns = index.runs.filter((r: any) => r.status === 'completed');
      if (successfulRuns.length === 0) {
        throw new Error('No successful runs found. Run the pipeline first.');
      }
      
      const latestRun = successfulRuns[0]; // Already sorted by date desc
      manifestPath = `episodes/${latestRun.run_id}_manifest.json`;
      
      console.log(`   ✅ Using latest successful run: ${latestRun.run_id}`);
      console.log(`   📅 Date: ${latestRun.date}`);
      console.log(`   🎯 Episode: ${latestRun.episode_title || 'N/A'}`);
    } else {
      manifestPath = `episodes/${runId}_manifest.json`;
      console.log(`   ✅ Using specified run: ${runId}`);
    }
    
    // 2. Load manifest
    console.log('\n📄 Step 2: Loading manifest...');
    const manifestData = await storage.get(manifestPath);
    const manifest = JSON.parse(manifestData);
    
    if (!manifest.pipeline_report?.outline || !manifest.picks) {
      throw new Error('Manifest missing outline or picks data. Run may be incomplete.');
    }
    
    console.log(`   ✅ Manifest loaded`);
    console.log(`   📊 Sections: ${manifest.pipeline_report.outline.sections.length}`);
    console.log(`   📰 Stories: ${manifest.picks.length}`);
    console.log(`   ⏱️  Target Duration: ${manifest.pipeline_report.outline.total_duration_target || 'N/A'} sec`);
    
    // 3. Extract outline from agent output
    console.log('\n🗂️  Step 3: Loading outline agent data...');
    const outlineAgentPath = `runs/${manifest.run_id}/agents/OutlineAgent.json`;
    const outlineAgentData = await storage.get(outlineAgentPath);
    const outlineAgent = JSON.parse(outlineAgentData);
    
    const outline = outlineAgent.output.outline;
    console.log(`   ✅ Outline loaded with ${outline.sections.length} sections`);
    
    // 4. Prepare scriptwriter input
    console.log('\n🎬 Step 4: Preparing scriptwriter input...');
    const scriptwriterInput = {
      outline: outline,
      picks: manifest.picks,
      date: manifest.date,
      listener_name: '',
      target_duration_sec: manifest.pipeline_report.outline.total_duration_target || 600,
      podcast_production: {
        intro_text: 'Welcome to your daily briefing',
        outro_text: 'Thanks for listening',
        style: 'executive' as const,
      },
    };
    
    console.log(`   ✅ Input prepared`);
    console.log(`   📝 Target: ${scriptwriterInput.target_duration_sec} seconds (~${Math.round(scriptwriterInput.target_duration_sec / 60)} min)`);
    console.log(`   🎨 Style: ${scriptwriterInput.podcast_production.style}`);
    
    // 5. Save input to file for inspection
    const testDataDir = path.join(process.cwd(), 'test-data');
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    
    const inputFile = path.join(testDataDir, 'scriptwriter-input.json');
    fs.writeFileSync(inputFile, JSON.stringify(scriptwriterInput, null, 2));
    console.log(`   💾 Input saved to: ${inputFile}`);
    
    // 6. Run scriptwriter
    console.log('\n🤖 Step 5: Running Scriptwriter Agent...');
    console.log('   ⏳ This may take 30-60 seconds...\n');
    
    const scriptwriter = new ScriptwriterAgent();
    const startTime = Date.now();
    
    const result = await scriptwriter.execute(
      `test-${Date.now()}`,
      scriptwriterInput
    );
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`   ✅ Scriptwriter completed in ${duration}s`);
    
    // 7. Display results
    console.log('\n📊 Step 6: Results\n');
    console.log('='.repeat(50));
    console.log(`\n✅ Sections Generated: ${result.output!.detailed_report.sections_generated}`);
    console.log(`📝 Total Word Count: ${result.output!.detailed_report.total_word_count}`);
    console.log(`⏱️  Estimated Duration: ~${Math.round(result.output!.detailed_report.total_word_count / 2.5)} seconds`);
    console.log(`📚 Citations Used: ${result.output!.detailed_report.citations_used.length}`);
    
    // 8. Save output
    const outputFile = path.join(testDataDir, 'scriptwriter-output.json');
    fs.writeFileSync(outputFile, JSON.stringify(result.output, null, 2));
    console.log(`\n💾 Full output saved to: ${outputFile}`);
    
    const scriptFile = path.join(testDataDir, 'generated-script.txt');
    fs.writeFileSync(scriptFile, result.output!.detailed_report.full_script_text);
    console.log(`📄 Script text saved to: ${scriptFile}`);
    
    // 9. Display script preview
    console.log('\n📖 Script Preview (first 500 chars):\n');
    console.log('-'.repeat(50));
    console.log(result.output!.detailed_report.full_script_text.substring(0, 500) + '...');
    console.log('-'.repeat(50));
    
    // 10. Section breakdown
    console.log('\n📋 Section Breakdown:\n');
    result.output!.script.sections.forEach((section: any, idx: number) => {
      console.log(`${idx + 1}. ${section.type.toUpperCase()}`);
      console.log(`   Words: ${section.word_count}`);
      console.log(`   Duration: ~${section.duration_estimate_sec}s`);
      console.log(`   Voice: ${section.voice || 'N/A'}`);
      console.log(`   Citations: [${section.citations.join(', ')}]`);
      console.log(`   Preview: ${section.text.substring(0, 80)}...`);
      console.log('');
    });
    
    console.log('\n✅ Test Complete!\n');
    console.log('🔍 To modify prompts, edit: lib/agents/scriptwriter.ts');
    console.log('📁 Test data saved in: test-data/');
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  testScriptwriter();
}

