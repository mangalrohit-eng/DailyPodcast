# Dynamic Story Selection Based on Scraping Success Rate

## Overview

Your podcast now **dynamically adjusts** how many stories it requests from the ranking agent based on **historical scraping success rates**. This ensures you consistently get your target number of stories in the final episode, even when some scrapes fail.

---

## The Problem

**Before:**
```
Ranking: Request 5 stories
  ↓
Scraping: 3 successful, 2 failed (60% success)
  ↓
Filter: Remove 2 failed
  ↓
Final Episode: Only 3 stories (missed target!)
```

**After:**
```
Check History: Last 5 runs averaged 60% scraping success
  ↓
Adjust: Request 5 / 0.6 = 8.33 ≈ 9 stories
  ↓
Ranking: Select 9 stories
  ↓
Scraping: 5 successful, 4 failed (56% success)
  ↓
Filter: Remove 4 failed
  ↓
Final Episode: 5 stories (hit target!)
```

---

## How It Works

### 1. Track Scraping Stats

After each run, we record:
- Total scraping attempts
- Successful scrapes  
- Failed scrapes
- Success rate (successful / total)

Stored in `runs/index.json`:
```json
{
  "run_id": "2024-11-15_123456",
  "scraping_stats": {
    "total_attempts": 8,
    "successful": 5,
    "failed": 3,
    "success_rate": 0.625
  }
}
```

### 2. Calculate Rolling Average

Before each new run, calculate the average scraping success rate from the **last 5 runs**:

```typescript
const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(5);
// Returns: 0.65 (65% average success)
```

### 3. Adjust Target Count

Apply the formula:

```
Adjusted Target = Base Target / Success Rate
```

**Examples:**

| Base Target | Historical Success Rate | Adjustment Factor | Adjusted Target |
|------------|------------------------|-------------------|-----------------|
| 5 | 80% (0.8) | 1 / 0.8 = 1.25 | 5 * 1.25 = 7 |
| 5 | 60% (0.6) | 1 / 0.6 = 1.67 | 5 * 1.67 = 9 |
| 5 | 40% (0.4) | 1 / 0.4 = 2.50 | 5 * 2.50 = 13 |
| 5 | 90% (0.9) | 1 / 0.9 = 1.11 | 5 * 1.11 = 6 |

### 4. Safety Bounds

To prevent extreme adjustments:

- **Minimum:** `adjusted_target >= base_target` (never request fewer)
- **Maximum:** `adjusted_target <= base_target * 3` (cap at 3x)

**Rationale:**
- If success rate is very low (20%), don't request 25 stories (overwhelming)
- Cap at 3x (15 stories max for base target of 5)

---

## Implementation Details

### Location: `lib/orchestrator.ts` lines 271-298

```typescript
// Calculate adjusted target count based on historical scraping success rate
const baseTargetCount = 5; // Desired final number of stories
const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(5);

let adjustedTargetCount = baseTargetCount;
if (historicalScrapeRate !== null && historicalScrapeRate > 0.1) {
  // Adjustment factor: 1 / success_rate
  const adjustmentFactor = 1 / historicalScrapeRate;
  adjustedTargetCount = Math.ceil(baseTargetCount * adjustmentFactor);
  
  // Cap at reasonable bounds
  adjustedTargetCount = Math.min(adjustedTargetCount, baseTargetCount * 3);
  adjustedTargetCount = Math.max(adjustedTargetCount, baseTargetCount);
  
  Logger.info('📊 Adjusting target count based on historical scraping success', {
    base_target: baseTargetCount,
    historical_success_rate: Math.round(historicalScrapeRate * 100) + '%',
    adjustment_factor: adjustmentFactor.toFixed(2),
    adjusted_target: adjustedTargetCount,
    rationale: `Requesting ${adjustedTargetCount} stories expecting ~${Math.round(adjustedTargetCount * historicalScrapeRate)} to succeed`,
  });
}
```

### Historical Data Storage

**Type:** `lib/tools/runs-storage.ts`

```typescript
export interface RunSummary {
  run_id: string;
  date: string;
  // ... other fields ...
  scraping_stats?: {
    total_attempts: number;
    successful: number;
    failed: number;
    success_rate: number; // 0.0 to 1.0
  };
}
```

**Calculation Method:**

```typescript
async getAverageScrapeSuccessRate(lastNRuns: number = 5): Promise<number | null> {
  const index = await this.loadIndex();
  
  // Get successful runs with scraping stats
  const runsWithStats = index.runs
    .filter(r => r.status === 'success' && r.scraping_stats)
    .slice(0, lastNRuns); // Most recent N runs
  
  if (runsWithStats.length === 0) {
    return null; // No historical data yet
  }
  
  const successRates = runsWithStats.map(r => r.scraping_stats!.success_rate);
  const average = successRates.reduce((sum, rate) => sum + rate, 0) / successRates.length;
  
  return average;
}
```

---

## Logging & Visibility

### Console Logs

**With Historical Data:**
```
📊 Adjusting target count based on historical scraping success
   base_target: 5
   historical_success_rate: 65%
   adjustment_factor: 1.54
   adjusted_target: 8
   rationale: Requesting 8 stories expecting ~5 to succeed
```

**Without Historical Data (First Few Runs):**
```
📊 No historical scraping data, using base target count
   base_target: 5
   note: Will start collecting data after first few episodes
```

**After Run Completion:**
```
Run completed
   runId: 2024-11-15_123456
   scraping_stats: {
     total_attempts: 8,
     successful: 5,
     failed: 3,
     success_rate: 0.625
   }
```

**Calculating Average:**
```
Calculated average scraping success rate
   last_n_runs: 5
   runs_used: 5
   average_rate: 68%
   individual_rates: ['70%', '65%', '75%', '60%', '70%']
```

---

## Behavior Over Time

### First Run
```
No historical data → Use base target (5 stories)
Track scraping results
```

### Runs 2-4
```
Limited data (1-3 runs) → Still use base target
Continue tracking
```

### Run 5+
```
Sufficient data (5 runs) → Start using adjusted target
Self-correcting system activated!
```

### Steady State
```
System converges on optimal target:
- If scraping improves → Request fewer stories
- If scraping worsens → Request more stories
- Maintains consistent final story count
```

---

## Example Scenarios

### Scenario 1: Poor Scraping Success (40%)

**Run 5 (after 4 runs with 40% average success):**
```
Base Target: 5 stories
Historical Rate: 40% (0.4)
Adjustment: 5 / 0.4 = 12.5 → 13 stories
Ranking: Select 13 stories
Scraping: 5 successful, 8 failed (38% success)
Filter: Remove 8 failed
Final: 5 stories ✓
```

### Scenario 2: Good Scraping Success (85%)

**Run 7 (after improving to 85% average success):**
```
Base Target: 5 stories
Historical Rate: 85% (0.85)
Adjustment: 5 / 0.85 = 5.88 → 6 stories
Ranking: Select 6 stories
Scraping: 5 successful, 1 failed (83% success)
Filter: Remove 1 failed
Final: 5 stories ✓
```

### Scenario 3: Very Poor Scraping (<20%)

**Protection via cap:**
```
Base Target: 5 stories
Historical Rate: 15% (0.15)
Adjustment: 5 / 0.15 = 33.33
Capped At: 5 * 3 = 15 stories (maximum)
Ranking: Select 15 stories
Scraping: 2-3 successful (system needs attention!)
```

---

## Benefits

### 1. **Consistent Episodes**
- Always target the same final story count
- Better user experience
- Predictable episode length

### 2. **Self-Correcting**
- Automatically adapts to changing conditions
- No manual intervention needed
- Learns from experience

### 3. **Efficient**
- Don't request too many stories when scraping works well
- Don't request too few when scraping struggles
- Optimal use of ranking agent

### 4. **Transparent**
- Clear logging shows why adjustments were made
- Can see scraping trends over time
- Easy to diagnose issues

---

## Dashboard Integration

### Runs List

Each run now shows scraping statistics:

```
Episode: AI & Markets - Nov 15
Status: SUCCESS
Stories: 5
Scraping: 5/8 (63% success)
```

### Run Details

Pipeline report includes:
```json
{
  "scraper": {
    "total_articles": 8,
    "successful_scrapes": 5,
    "failed_scrapes": [...],
    "avg_content_length": 4521
  }
}
```

### Historical View

In runs index:
```json
{
  "runs": [
    {
      "run_id": "2024-11-15_123456",
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

---

## Customization

### Change Base Target

Currently: **5 stories**

To change:
```typescript
// Line 272 in lib/orchestrator.ts
const baseTargetCount = 7; // Want 7 stories in final episode
```

### Change Historical Window

Currently: **Last 5 runs**

To change:
```typescript
// Line 273 in lib/orchestrator.ts
const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(10); // Last 10 runs
```

### Adjust Safety Bounds

Currently:
- **Max:** 3x base target
- **Min:** 1x base target

To change:
```typescript
// Lines 283-284 in lib/orchestrator.ts
adjustedTargetCount = Math.min(adjustedTargetCount, baseTargetCount * 5); // Allow up to 5x
adjustedTargetCount = Math.max(adjustedTargetCount, baseTargetCount * 0.8); // Allow slight decrease
```

### Disable Adjustment

To always use base target:
```typescript
// Line 276 - Add condition that always fails
if (false && historicalScrapeRate !== null) {
  // Never executes - always uses baseTargetCount
}
```

---

## Monitoring

### Check Current Success Rate

Generate a few episodes, then check logs:
```
Calculated average scraping success rate
   average_rate: 68%
```

### Review Adjustments

Each run logs the adjustment:
```
📊 Adjusting target count based on historical scraping success
   adjustment_factor: 1.47
   adjusted_target: 8
```

### Diagnose Issues

**If success rate is very low (<30%):**
- Review failed scrapes in pipeline report
- Check which sources are failing (paywalls, bot protection)
- Consider adding those domains to tier filtering
- Or use different sources for those topics

**If success rate varies wildly (50% to 95%):**
- Check if certain topics have worse success rates
- Some sources might be unreliable
- System will still adapt, but consider stabilizing sources

---

## Edge Cases

### No Historical Data (First Few Runs)

**Behavior:** Use base target count (5 stories)

**Why:** Need at least one run to start collecting data

### All Scrapes Fail

**Behavior:** Episode generation fails with error

**Why:** Better to fail than create empty/bad episode

**System learns:** Next run will request more stories

### Insufficient Data (<5 runs)

**Behavior:** Use all available data

**Example:** 
- Run 3 has data from runs 1-2
- Average calculated from just 2 runs
- Still provides some guidance

---

## Testing

### Verify It Works

1. **Generate 1st episode:**
   - Should use base target (5 stories)
   - Check scraping stats logged

2. **Generate 5 more episodes:**
   - Check logs for adjustment messages
   - Should start seeing adjusted targets

3. **Review consistency:**
   - Count final stories in each episode
   - Should cluster around base target (5)

4. **Check historical data:**
   - Open `runs/index.json`
   - Verify `scraping_stats` present for each run

---

## Related Systems

### Complete Story Flow

```
1. Ingestion → Fetch stories from sources
2. Tier Filtering → Only Tier 1, 2, 4
3. Ranking → Select top N stories
   └─ N = base_target / historical_success_rate ← DYNAMIC!
4. Scraping → Fetch full article content
   └─ Track success/failure rates
5. Scrape Filtering → Remove failed scrapes
6. Outline → Structure episode
7. Scriptwriting → Write script
8. Complete Run → Save scraping stats for next run
```

---

## Files Modified

### `lib/tools/runs-storage.ts`

**Added to RunSummary:**
```typescript
scraping_stats?: {
  total_attempts: number;
  successful: number;
  failed: number;
  success_rate: number;
};
```

**New Method:**
```typescript
async getAverageScrapeSuccessRate(lastNRuns: number = 5): Promise<number | null>
```

**Modified:**
```typescript
async completeRun(runId, manifest, scrapingStats?)
```

### `lib/orchestrator.ts`

**Lines 271-298:** Calculate adjusted target count
**Lines 743-750:** Pass scraping stats when completing run

---

## Summary

**What Changed:**
- ✅ Track scraping success rates in runs index
- ✅ Calculate rolling average from last 5 runs
- ✅ Dynamically adjust story count before ranking
- ✅ Self-correcting system that learns over time

**Result:**
- 🎯 Consistent final story count
- 📈 Adapts to changing conditions
- 💡 Learns from historical performance
- ⚖️ Optimal balance of ranking and scraping

**Formula:**
```
Adjusted Target = Base Target / Historical Success Rate
Bounded by: [base_target, base_target * 3]
```

**Example:**
```
Want 5 stories in final episode
Historical success: 60%
Request: 5 / 0.6 = 8.33 → 9 stories
Expect: ~5-6 stories after scraping
Result: Consistent episode quality!
```

