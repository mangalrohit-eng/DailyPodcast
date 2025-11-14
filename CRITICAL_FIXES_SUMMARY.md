# Critical Fixes Summary - Dashboard & Details Tab

## 🎯 Issues Fixed

### **Issue 1: Dashboard Topics Ignored** ❌ → ✅ FIXED

**Problem**: Dashboard was set to only Verizon, but podcast still talked about AI.

**Root Cause**: Line 160 in `lib/orchestrator.ts` was hardcoded:
```typescript
// BEFORE (BROKEN):
const ingestionResult = await this.ingestionAgent.execute(runId, {
  topics: Config.getTopicConfigs(),  // ❌ ALWAYS ALL TOPICS!
});
```

**Fix**:
```typescript
// AFTER (FIXED):
const enabledTopicConfigs = Config.getTopicConfigs().filter(tc => 
  runConfig.topics.includes(tc.name)
);

const ingestionResult = await this.ingestionAgent.execute(runId, {
  topics: enabledTopicConfigs,  // ✅ Only dashboard topics!
});
```

**Now**:
- Dashboard topics are read from `config/config.json` ✓
- `buildRunConfig()` extracts enabled topics (weight > 0) ✓
- Orchestrator filters `Config.getTopicConfigs()` to match dashboard ✓
- Ingestion only fetches enabled topic sources ✓

---

### **Issue 2: Details Tab Always Empty** ❌ → ✅ FIXED

**Problem**: Clicking "Details" showed empty tabs, no pipeline_report data.

**Root Cause 1**: Publisher saved manifest with wrong path:
```typescript
// PUBLISHER saved:
episodes/2025-11-13_manifest.json

// RUNS_STORAGE looked for:
episodes/2025-11-13_1731522800123_manifest.json

// Result: File not found!
```

**Root Cause 2**: Path mismatch due to timestamp in runId.

**Fix**: Changed `lib/agents/publisher.ts` to use `manifest.run_id`:
```typescript
// BEFORE:
const manifestPath = `episodes/${manifest.date}_manifest.json`;

// AFTER:
const manifestPath = `episodes/${manifest.run_id}_manifest.json`;
```

**Now**:
- Publisher saves: `episodes/2025-11-13_1731522800123_manifest.json` ✓
- RunsStorage looks for: `episodes/2025-11-13_1731522800123_manifest.json` ✓
- Paths match ✓
- Details tab loads manifest with pipeline_report ✓

---

## 📝 Files Changed

### `lib/orchestrator.ts`
1. **Line 154-177**: Filter topic configs to match dashboard
2. **Line 159-163**: Added debug logging to show which topics are enabled/filtered
3. **Line 358-404**: Compile pipeline_report from all agent outputs
4. **Line 436**: Add pipeline_report to manifest
5. **Line 549-597**: Read dashboard config and extract enabled topics

### `lib/agents/publisher.ts`
1. **Line 37**: Changed episode path from `${manifest.date}` to `${manifest.run_id}`
2. **Line 50**: Changed manifest path from `${manifest.date}` to `${manifest.run_id}`
3. **Line 44, 57**: Added path logging

---

## ✅ Testing Steps

### **Test 1: Dashboard Topics**
1. Go to Dashboard → Settings
2. Remove all topics except Verizon (or set Verizon weight = 1.0, others = 0)
3. Click "Save Settings"
4. Go to Runs tab
5. Click "Run Now"
6. Check Vercel Logs or browser console for:
   ```
   ✅ Using dashboard configuration
   topics: ['Verizon']
   
   🎯 Ingestion will fetch from topics
   enabled_topics: ['Verizon']
   filtered_out: ['AI', 'Accenture']
   ```
7. Wait for completion
8. Play episode - should ONLY talk about Verizon!

### **Test 2: Details Tab**
1. After Run Now completes
2. Click "Details" button on the new run
3. Should see 6 tabs populated with data:
   - **📥 Ingestion**: Shows Verizon sources only
   - **🎯 Ranking**: Shows Verizon stories only
   - **📋 Outline**: Shows podcast structure
   - **📝 Script**: Shows full script text
   - **✅ Fact Check**: Shows any corrections
   - **🛡️ Safety**: Shows risk assessment

---

## 🔍 Debug Logs

### What to Look For in Vercel Logs

**Dashboard Config Loading:**
```
Loaded dashboard configuration
  topics: [{ label: 'Verizon', weight: 1.0 }]

✅ Using dashboard configuration
  topics: ['Verizon']
  weights: { verizon: 1.0 }
```

**Ingestion Filtering:**
```
🎯 Ingestion will fetch from topics
  enabled_topics: ['Verizon']
  all_available: ['AI', 'Verizon', 'Accenture']
  filtered_out: ['AI', 'Accenture']

Fetching Verizon sources
  count: 2
```

**Pipeline Report:**
```
Pipeline report compiled
  ingestion_stories: { Verizon: 8 }
  ranking_picks: 5
  outline_sections: 7
```

**Manifest Saving:**
```
Manifest saved
  path: episodes/2025-11-13_1731522800123_manifest.json
```

---

## 🎉 Expected Results

### Before Fixes
- ❌ Dashboard set to Verizon only → Got AI stories anyway
- ❌ Click Details → All tabs empty
- ❌ pipeline_report not found

### After Fixes
- ✅ Dashboard set to Verizon only → Get ONLY Verizon stories
- ✅ Click Details → All 6 tabs show rich data
- ✅ pipeline_report loaded correctly
- ✅ Can see exactly what sources were scanned, stories filtered, why stories were selected
- ✅ Can read full script text
- ✅ Can see fact-check changes and safety assessment

---

## 🚀 Next Steps

1. **Test Immediately**: Generate a new episode with "Run Now"
2. **Verify Topics**: Check logs to confirm only enabled topics fetched
3. **Check Details**: Open Details tab to see pipeline report
4. **Listen**: Play episode to confirm it talks about correct topics

---

## 💡 How Dashboard Topics Work Now

```
1. User sets topics in Dashboard Settings
   └─> Saved to: config/config.json

2. Orchestrator.buildRunConfig() loads config
   └─> Extracts topics with weight > 0
   └─> Example: [{ label: 'Verizon', weight: 1.0 }]
   └─> Becomes: topics = ['Verizon']

3. Orchestrator filters Config.getTopicConfigs()
   └─> All available: [AI, Verizon, Accenture]
   └─> Filters to: [Verizon]
   └─> Only Verizon configs passed to ingestion

4. Ingestion fetches only enabled sources
   └─> Verizon official feed
   └─> Verizon Google News
   └─> Skips: AI and Accenture sources

5. Ranking scores only available stories
   └─> All stories are Verizon
   └─> Top 5 Verizon stories selected

6. Podcast generated with only Verizon content
   └─> Success! ✅
```

---

## 📊 Files Structure After Changes

```
S3 Bucket (episodes/):
├── 2025-11-13_1731522800123_daily_rohit_news.mp3
├── 2025-11-13_1731522800123_manifest.json  ← Contains pipeline_report
├── 2025-11-13_1731522900456_daily_rohit_news.mp3  ← Next run
└── 2025-11-13_1731522900456_manifest.json

manifest.json structure:
{
  "date": "2025-11-13",
  "run_id": "2025-11-13_1731522800123",
  "picks": [...],
  "pipeline_report": {
    "ingestion": { ... },
    "ranking": { ... },
    "outline": { ... },
    "scriptwriting": { ... },
    "factcheck": { ... },
    "safety": { ... }
  },
  "metrics": { ... }
}
```

---

## 🔧 Troubleshooting

### If Dashboard Topics Still Don't Work
1. Check `config/config.json` exists in S3
2. Verify topics have `weight > 0`
3. Look for "✅ Using dashboard configuration" in logs
4. Check "🎯 Ingestion will fetch from topics" shows correct list

### If Details Tab Still Empty
1. Check manifest file exists: `episodes/{runId}_manifest.json`
2. Verify runId matches between:
   - runs/index.json entry
   - Episode MP3 filename
   - Manifest filename
3. Look for "Manifest saved" in publisher logs
4. Check API /api/runs?runId=X returns manifest with pipeline_report

---

**All fixes deployed and ready to test! 🎊**


