/**
 * Tests for Ranking Agent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RankingAgent } from '../lib/agents/ranking';
import { Story } from '../lib/types';

describe('RankingAgent', () => {
  let agent: RankingAgent;
  
  beforeEach(() => {
    agent = new RankingAgent();
  });
  
  it('should handle empty story list', async () => {
    const result = await agent.execute('test-run', {
      stories: [],
      topic_weights: { ai: 0.5, vz: 0.3, acn: 0.2 },
      target_count: 10,
    });
    
    expect(result.output).toBeDefined();
    expect(result.output!.picks).toEqual([]);
  });
  
  it('should enforce target count', async () => {
    const stories: Story[] = Array.from({ length: 20 }, (_, i) => ({
      id: `story-${i}`,
      url: `https://example.com/story-${i}`,
      title: `Test Story ${i}`,
      source: 'example.com',
      published_at: new Date(),
      domain: 'example.com',
      topic: 'AI',
    }));
    
    const result = await agent.execute('test-run', {
      stories,
      topic_weights: { ai: 1.0 },
      target_count: 5,
    });
    
    expect(result.output).toBeDefined();
    expect(result.output!.picks.length).toBeLessThanOrEqual(5);
  });
});




