/**
 * Tests for Ingestion Agent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IngestionAgent } from '../lib/agents/ingestion';
import { Clock } from '../lib/utils';

describe('IngestionAgent', () => {
  let agent: IngestionAgent;
  
  beforeEach(() => {
    agent = new IngestionAgent();
  });
  
  it('should be instantiated', () => {
    expect(agent).toBeDefined();
  });
  
  it('should handle empty sources gracefully', async () => {
    const result = await agent.execute('test-run', {
      topics: [{
        name: 'Test',
        sources: [],
        keywords: ['test'],
      }],
      window_hours: 24,
      cutoff_date: Clock.addHours(new Date(), -24),
    });
    
    expect(result.output).toBeDefined();
    expect(result.output!.stories).toEqual([]);
    expect(result.errors).toEqual([]);
  });
  
  // Note: Full integration tests would require mock RSS feeds
  // or network recording/playback
});




