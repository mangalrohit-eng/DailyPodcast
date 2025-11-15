# Debugging Dynamic Ranking Target Count

## Issue
User reports that only 5 stories were provided by ranking to scraper in the last run, suggesting the dynamic adjustment isn't working.

## How the Logic Works

### Step 1: Check Historical Data
```typescript
const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(5);
```

This looks for the **last 5 successful runs** that have `scraping_stats` populated.

### Step 2: Decision Logic
```typescript
if (historicalScrapeRate !== null && historicalScrapeRate > 0.1) {
  // ADJUST: Calculate higher target
  adjustedTargetCount = Math.ceil(baseTargetCount / historicalScrapeRate);
} else {
  // NO ADJUSTMENT: Use base target (5 stories)
  Logger.info('📊 No historical scraping data, using base target count');
}
```

## Why You Might Get Only 5 Stories

### Reason 1: First Few Runs (MOST LIKELY)
The system needs **at least 1 completed run with scraping_stats** before it can adjust.

**Timeline:**
- **Run 1**: No history → uses 5 (base)
- **Run 2**: Has 1 run of history → starts adjusting!
- **Run 3-5**: More data → better adjustments
- **Run 5+**: Full 5-run average → optimal

### Reason 2: Previous Runs Failed
If previous runs failed before completing, they won't have `scraping_stats`:
```typescript
// Only counts runs with BOTH conditions:
.filter(r => r.status === 'success' && r.scraping_stats)
```

### Reason 3: Scraping Stats Not Saved
If `scraperResult.output.scraping_report` is undefined or malformed, stats won't be saved:
```typescript
const scrapingStats = scraperResult.output?.scraping_report ? {
  total_attempts: scraperResult.output.scraping_report.total_articles,
  successful: scraperResult.output.scraping_report.successful_scrapes,
  failed: scraperResult.output.scraping_report.failed_scrapes.length,
} : undefined;
```

## How to Check

### 1. Check Vercel Logs
Look for one of these messages in your last run:

**If adjusting:**
```
📊 Adjusting target count based on historical scraping success
   base_target: 5
   historical_success_rate: 60%
   adjustment_factor: 1.67
   adjusted_target: 9
   rationale: Requesting 9 stories expecting ~5 to succeed
```

**If NOT adjusting (first runs):**
```
📊 No historical scraping data, using base target count
   base_target: 5
   note: Will start collecting data after first few episodes
```

### 2. Check Runs Index via API

**Get recent runs:**
```bash
curl https://daily-podcast-brown.vercel.app/api/runs \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Look for `scraping_stats` field:**
```json
{
  "runs": [
    {
      "run_id": "2024-11-15_123456",
      "status": "success",
      "scraping_stats": {
        "total_attempts": 8,
        "successful": 5,
        "failed": 3,
        "success_rate": 0.625
      }
    }
  ]
}
```

If `scraping_stats` is **missing or null**, that's the problem!

### 3. Check Scraper Output
In Vercel logs, look for:
```
Scraper phase complete
   scraping_report: {
     total_articles: 8,
     successful_scrapes: 5,
     failed_scrapes: [...],
     success_rate: 0.625
   }
```

If this is missing, the scraper isn't generating the report properly.

## Expected Behavior

### First Run
```
Input: No historical data
Ranking: Request 5 stories (base target)
Scraping: 3 successful, 2 failed → 60% success
Saved: scraping_stats with 60% success rate
```

### Second Run
```
Input: 1 run with 60% success
Calculation: 5 / 0.6 = 8.33 → 9 stories
Ranking: Request 9 stories
Scraping: 5-6 successful → hit target!
Saved: Updated scraping_stats
```

### Subsequent Runs
```
Input: Average of last 5 runs (e.g., 65% success)
Calculation: 5 / 0.65 = 7.69 → 8 stories
Ranking: Request 8 stories
Self-correcting: Adjusts based on actual results
```

## Fixes if Not Working

### Fix 1: Verify Scraper Agent Returns Report
**File**: `lib/agents/scraper.ts`

Ensure the agent returns:
```typescript
return {
  enriched_picks: [...],
  scraping_report: {
    total_articles: picks.length,
    successful_scrapes: successCount,
    failed_scrapes: failedArticles,
    success_rate: picks.length > 0 ? successCount / picks.length : 0,
  },
};
```

### Fix 2: Verify Stats Are Being Logged
**File**: `lib/orchestrator.ts` line 758

Look for this log after each run:
```typescript
Logger.info('Run index updated successfully', { 
  runId, 
  scraping_stats: scrapingStats 
});
```

### Fix 3: Force Re-calculation (Development)
If you suspect the logic isn't triggering, temporarily add more logging:

```typescript
// In lib/orchestrator.ts after line 273
const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(5);

Logger.info('🔍 DEBUG: Historical scrape rate check', {
  historicalScrapeRate,
  isNull: historicalScrapeRate === null,
  willAdjust: historicalScrapeRate !== null && historicalScrapeRate > 0.1,
});
```

## Solution

**If this is your first or second run:**
✅ This is expected! The system needs 1-2 completed runs to build up historical data.

**If you've had 5+ successful runs:**
❌ Check if `scraping_stats` is being saved in the runs index. Look for the "Run index updated successfully" log.

**Quick Test:**
Run 2-3 episodes back-to-back. By the 2nd or 3rd run, you should see the adjusted target count in the logs.

