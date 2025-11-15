# Debug Failed Run After Ingestion

## Quick Steps to Find the Error

### Option 1: Vercel Logs (BEST - Most Detailed)

1. **Go to Vercel Dashboard**:
   - https://vercel.com/dashboard
   - Click on your project
   - Click "Logs" tab

2. **Filter for the failed run**:
   - Look for timestamps around when you ran it
   - Search for "ERROR" or "FAILED"
   - Look for "Orchestrator failed" or agent errors

3. **Common error patterns to look for**:
   - `RankingAgent failed` - problem in ranking stage
   - `ScraperAgent failed` - couldn't scrape articles
   - `OutlineAgent failed` - couldn't create outline
   - `ScriptwriterAgent failed` - our recent changes might have broken this!

### Option 2: Browser Console (Quick Check)

1. **Open Dashboard in browser**
2. **Open Console (F12)**
3. **Run this** (replace `YOUR_RUN_ID` with actual run ID):

```javascript
fetch('/api/external?action=errors&runId=YOUR_RUN_ID', {
  headers: {'Authorization': `Bearer ${localStorage.getItem('auth_token')}`}
})
.then(r => r.json())
.then(data => {
  console.log('Errors found:', data.errors);
  if (data.errors.length > 0) {
    data.errors.forEach(err => {
      console.log(`❌ ${err.agent}:`, err.errors);
    });
  }
});
```

### Option 3: Check Manifest File

If the run failed, there might be error details saved:

```javascript
fetch('/api/runs?runId=YOUR_RUN_ID', {
  headers: {'Authorization': `Bearer ${localStorage.getItem('auth_token')}`}
})
.then(r => r.json())
.then(data => {
  console.log('Manifest:', data.manifest);
  console.log('Error:', data.manifest?.error);
});
```

## Likely Culprits (From Recent Changes)

### 1. Scriptwriter Voice Assignment Bug
Our new `assignVoicesAndTransitions()` method might have a bug:
- Check for: `Cannot read property 'voice' of undefined`
- Or: `section.voice is not a valid voice type`

### 2. Word Count Enforcement Bug  
The new aggressive word count prompt might confuse the AI:
- Check for: `JSON parse error in ScriptwriterAgent`
- Or: `Invalid response format`

### 3. maxTokens Too High
Changed from 4000 → 8000, might hit API limits:
- Check for: `OpenAI API error: maximum context length`
- Or: `Token limit exceeded`

## What to Share

Once you find the error, share:
1. **The error message**
2. **Which agent failed** (Ranking/Scraper/Outline/Scriptwriter/etc.)
3. **The stack trace** (if available)

I'll fix it immediately!

