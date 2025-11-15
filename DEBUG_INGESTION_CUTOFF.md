# Debug: Ingestion Cutting Off Mid-Process

## What the Logs Show:

✅ Ingestion starts for Verizon
✅ Fetches 100 items from Google News RSS
✅ Extracts sources from titles successfully
✅ Filters stories by tier
❌ **LOGS CUT OFF** - Last entry: "Verizon Kicks Off Five-Part Bond Sale..."
❌ No "Ingestion complete" message
❌ Never reaches Accenture or AI topics
❌ Never reaches Ranking phase

## Possible Causes:

### 1. Unhandled Exception in Feed Parsing
- Something in the feed parsing is throwing an error
- Not being caught properly, causing silent failure

### 2. Custom Source URL Issue
Dashboard shows:
```
custom_sources: "https://www.verizon.com/about/news/verizon-news.xml"
```

This URL might be:
- Malformed XML
- Unreachable (404/403)
- Redirecting incorrectly
- Timeout on fetch

### 3. Memory Limit
- Processing 100 stories with full content
- Each story has title, summary, URL, extracted domain
- Tier matching against large lists
- Might be hitting memory limit

### 4. Async/Promise Issue
- Fetching feeds in a loop
- One promise might be hanging/never resolving
- No timeout on feed fetches

## Quick Test:

Try temporarily removing the custom_sources:
1. Go to Dashboard → Settings
2. For Verizon topic, clear the "Custom RSS" field
3. Save settings
4. Run again

If that works, the issue is with parsing that custom Verizon RSS feed.

## Next Steps:

1. Check if custom Verizon RSS is reachable:
   ```bash
   curl https://www.verizon.com/about/news/verizon-news.xml
   ```

2. Add error handling around feed fetching
3. Add timeout to feed fetches (30 seconds max)
4. Log which feed is being fetched before each fetch

