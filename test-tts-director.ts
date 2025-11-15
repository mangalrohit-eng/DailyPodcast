/**
 * Test TTS Director Agent with stub data
 */

import { TtsDirectorAgent } from './lib/agents/tts-director';

// Stub script data
const stubScript = {
  sections: [
    {
      type: 'cold-open',
      text: 'Welcome to today\'s briefing. We have exciting stories about technology and business.',
      citations: []
    },
    {
      type: 'story',
      text: 'In major news today, Verizon announced significant changes to their operations. The telecommunications giant is restructuring to adapt to the evolving market landscape. Industry analysts suggest this could impact thousands of employees.',
      citations: [
        {
          ref_id: 'story-1',
          title: 'Verizon Restructuring',
          url: 'https://example.com/verizon'
        }
      ]
    },
    {
      type: 'story',
      text: 'Meanwhile, in the world of artificial intelligence, new developments are pushing the boundaries of what\'s possible. Companies are racing to implement AI solutions across various sectors. This trend shows no signs of slowing down.',
      citations: [
        {
          ref_id: 'story-2',
          title: 'AI Developments',
          url: 'https://example.com/ai'
        }
      ]
    },
    {
      type: 'sign-off',
      text: 'That\'s your briefing for today. Stay informed and stay ahead.',
      citations: []
    }
  ],
  word_count: 120,
  estimated_duration_sec: 48
};

async function testTtsDirector() {
  console.log('🎬 Testing TTS Director Agent\n');
  console.log('📝 Input Script:');
  console.log(JSON.stringify(stubScript, null, 2));
  console.log('\n' + '='.repeat(80) + '\n');

  try {
    const agent = new TtsDirectorAgent();
    const runId = 'test-' + Date.now();

    console.log('▶️  Executing TTS Director...\n');
    const result = await agent.execute(runId, { script: stubScript });

    console.log('✅ TTS Director completed successfully!\n');
    console.log('📊 Results:');
    console.log(`   Segments planned: ${result.output.synthesis_plan.length}`);
    console.log(`   Estimated duration: ${result.output.estimated_duration_sec} seconds`);
    console.log('\n📋 Synthesis Plan:');

    result.output.synthesis_plan.forEach((segment, index) => {
      console.log(`\n   Segment ${index + 1}:`);
      console.log(`   - ID: ${segment.segment_id}`);
      console.log(`   - Voice: ${segment.voice}`);
      console.log(`   - Role: ${segment.role}`);
      console.log(`   - Speed: ${segment.speed}`);
      console.log(`   - Expected duration: ${segment.expected_sec} sec`);
      console.log(`   - Text length: ${segment.text_with_cues.length} chars`);
      console.log(`   - Text preview: "${segment.text_with_cues.substring(0, 100)}..."`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('🎉 Test PASSED - TTS Director is working correctly!');
    
    if (result.output.synthesis_plan.length === 0) {
      console.log('\n⚠️  WARNING: synthesis_plan is EMPTY!');
      console.log('This would cause the music-only issue.');
    }

  } catch (error: any) {
    console.error('\n❌ Test FAILED!');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testTtsDirector();

