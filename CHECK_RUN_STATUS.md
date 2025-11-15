# Check Run Status for 2025-11-15_1763249380749

## Quick Checks:

### 1. Check if run is in Vercel logs:
Go to: https://vercel.com/dashboard → Your project → Logs
Search for: `1763249380749`

Look for:
- "Orchestrator failed" message
- The actual error that caused failure
- Whether failRun() was called

### 2. Check if manifest exists:
```javascript
fetch('https://daily-podcast-brown.vercel.app/episodes/2025-11-15_1763249380749_manifest.json')
  .then(r => r.json())
  .then(data => console.log('Manifest:', data))
  .catch(err => console.log('No manifest:', err));
```

### 3. Check runs index directly:
```javascript
fetch('https://podcast098478926952.s3.us-east-1.amazonaws.com/runs/index.json')
  .then(r => r.json())
  .then(data => {
    const run = data.runs.find(r => r.run_id === '2025-11-15_1763249380749');
    console.log('Run in index:', run);
    if (!run) {
      console.log('Run NOT in index. First 5 runs:', data.runs.slice(0, 5).map(r => r.run_id));
    }
  });
```

## Most Likely Causes:

### A. Run crashed before failRun() could be called
- Error happened in a way that bypassed the catch block
- Look for Vercel timeout (function execution limit)

### B. failRun() was called but failed to save
- Check logs for "Run failed" message
- Check for "Failed to save runs index" error

### C. Run is still "running" and not failed
- Check progress tracker status
- Dashboard shows it as running but it actually crashed

## What to Share:

From Vercel logs, find:
1. Last log entry before it stopped
2. Any "ERROR" or "failed" messages  
3. Whether you see "Run failed" log from failRun()

