/**
 * Test stub for Ranking Agent
 * This loads real ingestion data and tests the ranking logic
 */

import { RankingAgent } from './lib/agents/ranking';
import { Story } from './lib/types';

// Sample ingestion data - replace with real data from a run
const sampleStories: Story[] = [
  {
    id: 'story1',
    url: 'https://www.usatoday.com/story/verizon-layoffs',
    title: 'Verizon set to cut about 15,000 jobs - USA Today',
    source: 'USA Today',
    domain: 'usatoday',
    published_at: new Date('2025-11-14T10:00:00Z'),
    summary: 'Verizon plans major workforce reduction as new CEO restructures company',
    topic: 'Verizon',
  },
  {
    id: 'story2',
    url: 'https://www.cnbc.com/2025/11/14/verizon-restructuring',
    title: 'Verizon to cut 15,000 jobs as new CEO restructures - CNBC',
    source: 'CNBC',
    domain: 'cnbc',
    published_at: new Date('2025-11-14T09:30:00Z'),
    summary: 'Major telecom announces significant workforce reduction',
    topic: 'Verizon',
  },
  {
    id: 'story3',
    url: 'https://techcrunch.com/2025/11/14/ai-chip-development',
    title: 'Amazon working on new AI chip - TechCrunch',
    source: 'TechCrunch',
    domain: 'techcrunch',
    published_at: new Date('2025-11-14T11:00:00Z'),
    summary: 'Amazon is said to be working on an ambitious new AI chip',
    topic: 'AI',
  },
  {
    id: 'story4',
    url: 'https://finance.yahoo.com/news/accenture-valuation',
    title: 'Accenture (ACN): Exploring Valuation - Yahoo Finance',
    source: 'Yahoo Finance',
    domain: 'yahoo finance',
    published_at: new Date('2025-11-14T08:00:00Z'),
    summary: 'Accenture launches Physical AI Orchestrator for Smart Manufacturing',
    topic: 'Accenture',
  },
  {
    id: 'story5',
    url: 'https://www.pymnts.com/verizon-layoffs',
    title: 'Verizon Eyes Layoff That May Cut 15,000 Jobs - PYMNTS.com',
    source: 'PYMNTS',
    domain: 'pymnts.com',
    published_at: new Date('2025-11-14T07:00:00Z'),
    summary: 'Telecom giant plans significant workforce reduction',
    topic: 'Verizon',
  },
  {
    id: 'story6',
    url: 'https://www.businessinsider.com/amazon-ai-chip',
    title: 'Amazon developing new AI chip - Business Insider',
    source: 'Business Insider',
    domain: 'businessinsider.com',
    published_at: new Date('2025-11-14T12:00:00Z'),
    summary: 'Tech giant expands AI hardware capabilities',
    topic: 'AI',
  },
  {
    id: 'story7',
    url: 'https://www.reuters.com/verizon-ceo-restructure',
    title: 'Verizon CEO announces major restructuring - Reuters',
    source: 'Reuters',
    domain: 'reuters.com',
    published_at: new Date('2025-11-14T13:00:00Z'),
    summary: 'New CEO implements sweeping changes at telecom company',
    topic: 'Verizon',
  },
  {
    id: 'story8',
    url: 'https://www.bloomberg.com/accenture-ai',
    title: 'Accenture pushes into AI orchestration - Bloomberg',
    source: 'Bloomberg',
    domain: 'bloomberg.com',
    published_at: new Date('2025-11-14T10:30:00Z'),
    summary: 'Consulting giant launches new AI platform for manufacturing',
    topic: 'Accenture',
  },
];

// Topic weights matching dashboard config
const topicWeights = {
  'Verizon': 0.6,
  'Accenture': 0.3,
  'AI': 0.1,
};

async function testRankingAgent() {
  console.log('🧪 Testing Ranking Agent');
  console.log('='.repeat(80));
  
  const rankingAgent = new RankingAgent();
  
  console.log('\nInput Stories:');
  sampleStories.forEach((story, i) => {
    console.log(`  ${i + 1}. [${story.topic}] ${story.title.substring(0, 60)}...`);
    console.log(`     Domain: ${story.domain} | Published: ${story.published_at.toISOString()}`);
  });
  
  console.log('\nTopic Weights:');
  Object.entries(topicWeights).forEach(([topic, weight]) => {
    console.log(`  ${topic}: ${weight}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('Running Ranking Agent...');
  console.log('='.repeat(80));
  
  try {
    const result = await rankingAgent.execute('test-run-123', {
      stories: sampleStories,
      topic_weights: topicWeights,
      target_count: 5,
    });
    
    if (!result.output) {
      console.error('❌ No output from ranking agent');
      return;
    }
    
    console.log('\n✅ Ranking Complete!');
    console.log('\nSelected Stories (Ordered by Rank):');
    result.output.picks.forEach((pick, i) => {
      console.log(`\n${i + 1}. Score: ${pick.score.toFixed(4)}`);
      console.log(`   [${pick.topic}] ${pick.story.title.substring(0, 70)}...`);
      console.log(`   Domain: ${pick.story.domain}`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('Topic Distribution:');
    Object.entries(result.output.topic_distribution).forEach(([topic, count]) => {
      console.log(`  ${topic}: ${count} stories`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('Detailed Report:');
    console.log(`  Stories Ranked: ${result.output.detailed_report.stories_ranked}`);
    console.log(`  Top Picks: ${result.output.detailed_report.top_picks.length}`);
    console.log(`  Rejected: ${result.output.detailed_report.rejected_stories.length}`);
    
    if (result.output.detailed_report.rejected_stories.length > 0) {
      console.log('\n  Rejected Stories (Sample):');
      result.output.detailed_report.rejected_stories.slice(0, 3).forEach((rejected) => {
        console.log(`    - ${rejected.title.substring(0, 60)}...`);
        console.log(`      Reason: ${rejected.reason}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Instructions for loading real data
console.log(`
📝 Instructions for Testing with Real Data:
============================================

1. Run a podcast generation: Click "Run Now" on the dashboard
2. Go to Details → Ingestion tab
3. Copy the stories data from browser console:
   - Open DevTools (F12)
   - Type: copy(JSON.stringify(manifest.pipeline_report.ingestion.all_stories_detailed.filter(s => s.status === 'accepted')))
4. Replace the sampleStories array above with the real data
5. Run: npx ts-node test-ranking-agent.ts

This will test the ranking agent with actual production data!
`);

testRankingAgent();

