# Dashboard Setup Guide

Complete guide for setting up and using the podcast dashboard.

## Quick Start

### 1. Set Authentication

**Option A: Bearer Token (Recommended)**
```bash
# Generate a secure token
openssl rand -base64 32

# Add to Vercel
vercel env add DASHBOARD_TOKEN
# Paste the generated token
```

**Option B: Basic Authentication**
```bash
vercel env add DASHBOARD_USER
# Enter username

vercel env add DASHBOARD_PASS
# Enter password
```

### 2. Deploy/Redeploy

```bash
vercel --prod
```

### 3. Access Dashboard

Open in browser:
```
https://your-project.vercel.app/dashboard
```

Enter your token or credentials when prompted.

## Dashboard Overview

### Settings Tab ⚙️

Configure your podcast generation:

#### Topics & Weights

- **Add Topics**: Click "+ Add Topic" to add new topics
- **Adjust Weights**: Each topic has a weight (0-1) representing its priority
- **Validation**: Weights must sum to 1.0 (±0.001)
- **Auto-Balance**: Click to automatically normalize weights
- **Examples**:
  ```
  AI: 0.5
  Verizon: 0.3
  Accenture: 0.2
  ───────────
  Total: 1.0 ✓
  ```

#### Schedule

- **Timezone**: Select your local timezone for display
- **Cron Schedule**: Shows when episodes will generate (read-only)
- Default: `0 12 * * *` (Daily at 12:00 UTC)

#### Content Filters

- **Rumor Filter**: Enable to exclude unverified stories
- **Banned Domains**: Block specific news sources (one per line)
- **Window Hours**: How far back to look for stories (default: 36)

#### Voice & Style

- **Host Voice**: Primary narrator voice
- **Analyst Voice**: Secondary voice for analysis
- **Available Voices**: alloy, echo, fable, onyx, nova, shimmer
- **Pronunciation Glossary**: Fix TTS pronunciation
  ```
  AI=A I
  GPT=G P T
  ML=M L
  API=A P I
  ```

#### System Health

Shows status of:
- ✓ OpenAI API (configured/not configured)
- ✓ Blob Storage (configured/not configured)

### Runs Tab ▶️

Monitor and control episode generation:

#### Run Now Button

- Manually trigger episode generation
- Takes 2-5 minutes
- Disabled when a run is active
- Shows spinner and progress

#### Recent Runs Table

Columns:
- **Date**: Episode date (YYYY-MM-DD)
- **Status**: running | success | failed
- **Stories**: Number of stories included
- **Duration**: Generation time in seconds
- **Actions**: Play episode, view details

#### Active Run Status

When a run is in progress:
- Shows run ID
- Displays current phase (Ingestion, Ranking, etc.)
- Auto-updates every 5 seconds
- Disables "Run Now" button

### Logs Tab 📋

Real-time log viewing and analysis:

#### Controls

- **🔄 Refresh**: Reload logs from server
- **⏸️ Pause Auto-scroll**: Stop automatic scrolling
- **⬇️ Download**: Export logs as JSONL file
- **Level Filter**: Show only INFO/WARN/ERROR/DEBUG
- **Search**: Find specific log messages

#### Log Viewer

- Dark theme console-style viewer
- Color-coded by level:
  - 🔵 INFO: Blue
  - 🟡 WARN: Orange
  - 🔴 ERROR: Red
  - ⚫ DEBUG: Gray
- Shows timestamp, agent, and message
- Auto-scrolls to bottom (when enabled)
- 600px height, scrollable

#### Log Levels

- **INFO**: Normal operations (ingestion complete, ranking done, etc.)
- **WARN**: Warnings (slow API, missing data, etc.)
- **ERROR**: Failures (API errors, missing config, etc.)
- **DEBUG**: Detailed debug info (usually hidden)

### URLs Tab 🔗

Quick access to all podcast URLs:

#### RSS Feed

- Full RSS feed URL
- Copy button for easy sharing
- Use this in podcast apps

#### Latest Episode

- Direct MP3 link to most recent episode
- Copy and share or play directly

#### All Episodes

- List of all generated episodes
- Each has:
  - Date
  - Direct MP3 URL
  - Play button (opens in new tab)
  - Copy button for URL

## Common Tasks

### First Time Setup

1. **Check Health**
   - Go to Settings tab
   - Verify OpenAI API and Blob Storage are configured
   - If not, set environment variables in Vercel

2. **Configure Topics**
   - Review default topics (AI, Verizon, Accenture)
   - Adjust weights based on your interests
   - Click "Auto-Balance" if needed
   - Save settings

3. **Generate First Episode**
   - Go to Runs tab
   - Click "Run Now"
   - Wait 2-5 minutes
   - Check Logs tab for progress

4. **Subscribe to Feed**
   - Go to URLs tab
   - Copy RSS Feed URL
   - Add to your podcast app

### Adjusting Topic Weights

**Goal**: Increase AI coverage to 60%

1. Go to Settings → Topics & Weights
2. Change AI weight from 0.5 to 0.6
3. Change Verizon from 0.3 to 0.25
4. Change Accenture from 0.2 to 0.15
5. Verify total = 1.0
6. Click "Save Settings"
7. Next run will use new weights

### Troubleshooting Failed Runs

1. **Go to Runs Tab**
   - Find failed run
   - Note the date/run ID

2. **Check Logs**
   - Switch to Logs tab
   - Filter by ERROR level
   - Look for error messages

3. **Common Issues**:
   - `No stories found`: Increase window_hours or check RSS feeds
   - `OpenAI API error`: Check API key and credits
   - `Rate limit exceeded`: Wait and retry later
   - `Storage error`: Check Blob configuration

4. **Fix and Retry**
   - Fix the issue (settings, API key, etc.)
   - Return to Runs tab
   - Click "Run Now" again

### Banning Problematic Domains

**Problem**: Low-quality stories from example-news.com

1. Go to Settings → Content Filters
2. In "Banned Domains", add:
   ```
   example-news.com
   ```
3. Click "Save Settings"
4. Future runs will skip this domain

### Monitoring Daily Runs

**Check if automated run succeeded:**

1. Open dashboard at 8am (12pm UTC + your timezone)
2. Go to Runs tab
3. Look for today's date in recent runs
4. Status should be "SUCCESS"
5. If failed, check Logs tab for errors

## API Usage (Advanced)

### Manual API Calls

All endpoints require authentication header:

```bash
# Bearer token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-project.vercel.app/api/config

# Basic auth
curl -u username:password \
  https://your-project.vercel.app/api/config
```

### Get Configuration

```bash
curl https://your-project.vercel.app/api/config
```

Response:
```json
{
  "version": 1,
  "topics": [
    {"label": "AI", "weight": 0.5},
    {"label": "Verizon", "weight": 0.3},
    {"label": "Accenture", "weight": 0.2}
  ],
  "rumor_filter": true,
  ...
}
```

### Update Configuration

```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rumor_filter": false}' \
  https://your-project.vercel.app/api/config
```

### Trigger Run

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-project.vercel.app/api/run
```

### Get Logs

```bash
# Latest run logs
curl https://your-project.vercel.app/api/logs/latest

# Specific run
curl https://your-project.vercel.app/api/logs/2024-01-15

# Download as file
curl https://your-project.vercel.app/api/logs/2024-01-15?download=true \
  -o logs.jsonl
```

### Stream Logs (SSE)

```bash
curl -N https://your-project.vercel.app/api/logs/stream?runId=latest
```

## Security Best Practices

### Token Management

1. **Generate Strong Tokens**
   ```bash
   openssl rand -base64 32
   ```

2. **Never Commit Tokens**
   - Keep tokens in environment variables
   - Never hardcode in code
   - Don't share in screenshots

3. **Rotate Regularly**
   - Change token every 90 days
   - Update in Vercel dashboard
   - Clear browser localStorage

### Access Control

- **Production**: Always set DASHBOARD_TOKEN or USER/PASS
- **Development**: Can run without auth (for testing)
- **Shared Access**: Use basic auth with individual credentials

### HTTPS Only

- Dashboard only works over HTTPS in production
- Vercel automatically provides SSL
- Never access via HTTP

## Troubleshooting

### "Authentication Required" Error

**Cause**: No token or invalid credentials

**Fix**:
1. Set DASHBOARD_TOKEN in Vercel
2. Redeploy: `vercel --prod`
3. Clear browser localStorage
4. Refresh page and re-enter token

### "Failed to Load Configuration"

**Cause**: Config not yet created or storage error

**Fix**:
1. Check Blob Storage is configured
2. Wait a moment and refresh
3. If persists, check Vercel logs

### "Run Already in Progress"

**Cause**: Another run is active (concurrency guard)

**Fix**:
1. Wait for active run to complete (2-5 minutes)
2. Check Runs tab for status
3. If stuck >10 minutes, check logs for errors

### Logs Not Loading

**Cause**: No runs yet or connection issue

**Fix**:
1. Generate first episode via "Run Now"
2. Check browser console for errors
3. Verify API endpoints are accessible

### Dashboard Blank/White Screen

**Cause**: JavaScript error or auth failure

**Fix**:
1. Check browser console for errors
2. Clear browser cache
3. Try different browser
4. Check Vercel deployment succeeded

## Environment Variables Summary

Required:
```bash
OPENAI_API_KEY=sk-...           # OpenAI API key
BLOB_READ_WRITE_TOKEN=...       # Vercel Blob (auto-set)
PODCAST_BASE_URL=https://...    # Your Vercel URL
```

Optional:
```bash
DASHBOARD_TOKEN=...             # Dashboard bearer token
DASHBOARD_USER=admin            # Dashboard username (alt auth)
DASHBOARD_PASS=...              # Dashboard password (alt auth)
```

## Support

- **Dashboard Issues**: Check browser console and Vercel logs
- **API Errors**: Review structured logs in Logs tab
- **Configuration**: See Settings tab inline help
- **General**: Refer to main README.md

---

**Happy podcasting! 🎙️**

