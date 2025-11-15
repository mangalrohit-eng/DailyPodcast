# Debugging Short Podcast Duration

## Problem
User set 10 minutes target in dashboard, but podcast is <3 minutes.

## Expected Behavior
- Target: 10 minutes = 600 seconds
- Expected word count: 600 sec × 2.5 words/sec = **1500 words** (±10%)
- Range: 1350-1650 words

## Code Flow (VERIFIED AS CORRECT)

1. **Dashboard** (`public/dashboard.html`):
   ```javascript
   const targetDurationMinutes = parseInt(document.getElementById('targetDuration').value); // 10
   const targetDurationSec = targetDurationMinutes * 60; // 600
   ```

2. **Orchestrator** (`lib/orchestrator.ts`):
   ```typescript
   target_duration_sec: dashboardConfig?.target_duration_sec || 900
   ```
   Passes to both Outline and Scriptwriter

3. **Outline Agent** (`lib/agents/outline.ts`):
   ```typescript
   const totalTargetWords = Math.round(target_duration_sec * 2.5); // 600 * 2.5 = 1500
   ```

4. **Scriptwriter Agent** (`lib/agents/scriptwriter.ts`):
   ```typescript
   const durationMin = (target_duration_sec || 900) / 60; // 600 / 60 = 10
   const targetWordCount = Math.round(durationMin * 150); // 10 * 150 = 1500
   const wordCountRange = `${Math.floor(targetWordCount * 0.9)}-${Math.ceil(targetWordCount * 1.1)}`;
   // Result: "1350-1650 words"
   ```

## Debugging Steps

### 1. Check Latest Run in Dashboard
- Go to Dashboard → Recent Runs
- Click on the latest run
- Check the "Summary" tab for:
  - **Word Count**: Should show ~1500 words
  - **Duration**: Should show ~10 minutes
  - If it shows 300-400 words instead = problem confirmed

### 2. Check Run Logs
Look for these log messages to see what was actually requested:

```
Creating outline
- target_duration_sec: 600
- total_target_words: 1500

Writing script
- target_duration_min: 10.0
- target_word_count: 1500
```

### 3. Check Dashboard Config
In Dashboard Settings tab:
- **Target Duration**: Should be 10 (minutes)
- Click "Load Settings" to verify it's saved correctly

### 4. Check if AI is Ignoring Instructions
If logs show correct targets (1500 words) but script is short (300 words):
- The AI might be ignoring the word count guidance
- Check `pipeline_report.scriptwriting.total_word_count` in manifest

## Possible Causes

### A. Config Not Saving
- Dashboard settings might not be persisting
- Check: Load settings after saving, verify target shows 10

### B. Default Overriding User Setting
- Check if `dashboardConfig?.target_duration_sec` is null/undefined
- Would fall back to default 900 sec (15 min)

### C. AI Ignoring Word Count
- OpenAI might be generating much shorter scripts
- Check prompt sent to AI includes: "TOTAL TARGET WORD COUNT: 1500 words"

### D. Outline Agent Allocating Too Few Words
- Check `outline.sections` each has reasonable `target_words`
- Sum should be ~1500

## Quick Test

Run this in browser console on Dashboard:
```javascript
fetch('/api/config')
  .then(r => r.json())
  .then(config => {
    console.log('Target Duration (sec):', config.target_duration_sec);
    console.log('Target Duration (min):', config.target_duration_sec / 60);
    console.log('Expected Word Count:', Math.round((config.target_duration_sec / 60) * 150));
  });
```

## Next Steps

1. User: Check latest run's actual word count in dashboard
2. User: Share screenshot or word count from "Summary" tab
3. We'll identify which step is failing

