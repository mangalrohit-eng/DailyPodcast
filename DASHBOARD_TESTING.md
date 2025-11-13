# Dashboard Testing Checklist

Complete testing guide for the podcast dashboard before going live.

## Pre-Deployment Tests

### Environment Variables

- [ ] `OPENAI_API_KEY` is set in Vercel
- [ ] `BLOB_READ_WRITE_TOKEN` is auto-configured (Vercel Blob created)
- [ ] `PODCAST_BASE_URL` matches your Vercel URL
- [ ] `DASHBOARD_TOKEN` or `DASHBOARD_USER`/`DASHBOARD_PASS` is set

### Build & Deploy

```bash
# Type check
npm run type-check

# Build (should show no errors)
npm run build

# Deploy to production
vercel --prod
```

Expected:
- ✓ No TypeScript errors
- ✓ All API routes deployed
- ✓ Dashboard route accessible

## Post-Deployment Tests

### 1. Authentication Tests

#### Test 1.1: Access Without Auth (Dev Mode)
```bash
# If no DASHBOARD_TOKEN set
curl https://your-project.vercel.app/dashboard
```
Expected: HTML page or 401 (if auth configured)

#### Test 1.2: Bearer Token Auth
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-project.vercel.app/api/config
```
Expected: JSON config response

#### Test 1.3: Basic Auth
```bash
curl -u username:password \
  https://your-project.vercel.app/api/config
```
Expected: JSON config response

#### Test 1.4: Invalid Token
```bash
curl -H "Authorization: Bearer invalid-token" \
  https://your-project.vercel.app/api/config
```
Expected: 401 Unauthorized

### 2. Config API Tests

#### Test 2.1: GET Config
```bash
curl https://your-project.vercel.app/api/config
```
Expected:
- Status: 200
- Body: JSON with `topics`, `timezone`, `rumor_filter`, etc.
- Default values if first load

#### Test 2.2: PUT Config (Update Topics)
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topics": [
      {"label": "AI", "weight": 0.6},
      {"label": "Verizon", "weight": 0.4}
    ]
  }' \
  https://your-project.vercel.app/api/config
```
Expected:
- Status: 200
- Body: Updated config with incremented version
- Weights normalized to 1.0

#### Test 2.3: PUT Config (Invalid Weights)
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topics": [
      {"label": "AI", "weight": 0.8},
      {"label": "Verizon", "weight": 0.4}
    ]
  }' \
  https://your-project.vercel.app/api/config
```
Expected:
- Status: 400
- Error: "Topic weights must sum to 1.0"

#### Test 2.4: PUT Config (Duplicate Topics)
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "topics": [
      {"label": "AI", "weight": 0.5},
      {"label": "AI", "weight": 0.5}
    ]
  }' \
  https://your-project.vercel.app/api/config
```
Expected:
- Status: 400
- Error: "Duplicate topic labels found"

### 3. Runs API Tests

#### Test 3.1: List Runs (Empty)
```bash
curl https://your-project.vercel.app/api/runs
```
Expected:
- Status: 200
- Body: `{"runs": [], "total": 0, "activeRun": null}`

#### Test 3.2: Trigger Run
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-project.vercel.app/api/run
```
Expected:
- Status: 200 (after 2-5 minutes)
- Body: `{"success": true, "episode": {...}, "metrics": {...}}`

#### Test 3.3: List Runs (After Run)
```bash
curl https://your-project.vercel.app/api/runs
```
Expected:
- Status: 200
- Body: Array with one run, status "success" or "failed"

#### Test 3.4: Get Run Details
```bash
curl https://your-project.vercel.app/api/runs/2024-01-15
```
Expected:
- Status: 200
- Body: `{"summary": {...}, "manifest": {...}}`

#### Test 3.5: Concurrent Run Prevention
```bash
# While a run is active
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-project.vercel.app/api/run
```
Expected:
- Status: 200 (fast response)
- Body: `{"success": false, "error": "Another run is already in progress"}`

### 4. Logs API Tests

#### Test 4.1: Get Latest Logs (Empty)
```bash
curl https://your-project.vercel.app/api/logs/latest
```
Expected:
- Status: 200
- Body: `{"logs": [], "runId": null}` or empty logs

#### Test 4.2: Get Latest Logs (After Run)
```bash
curl https://your-project.vercel.app/api/logs/latest
```
Expected:
- Status: 200
- Body: Array of log entries with `ts`, `level`, `msg`, `agent`

#### Test 4.3: Get Specific Run Logs
```bash
curl https://your-project.vercel.app/api/logs/2024-01-15
```
Expected:
- Status: 200
- Body: `{"logs": [...], "nextCursor": 123}`

#### Test 4.4: Download Logs
```bash
curl https://your-project.vercel.app/api/logs/2024-01-15?download=true \
  -o logs.jsonl
```
Expected:
- Status: 200
- Content-Type: application/x-ndjson
- File: JSONL format with one log entry per line

#### Test 4.5: Stream Logs (SSE)
```bash
curl -N https://your-project.vercel.app/api/logs/stream?runId=latest
```
Expected:
- Status: 200
- Content-Type: text/event-stream
- Events: `connected`, `log`, `complete`

### 5. Dashboard UI Tests

Open dashboard in browser: `https://your-project.vercel.app/dashboard`

#### Test 5.1: Authentication
- [ ] Prompt for token/credentials appears
- [ ] Entering valid token grants access
- [ ] Invalid token shows error
- [ ] Token stored in localStorage
- [ ] Refresh preserves authentication

#### Test 5.2: Settings Tab

**System Health**
- [ ] Shows OpenAI status (configured/not configured)
- [ ] Shows Blob Storage status (configured/not configured)
- [ ] Health check loads without errors

**Topics & Weights**
- [ ] Default topics load (AI, Verizon, Accenture)
- [ ] Can edit topic names
- [ ] Can edit weights (number input)
- [ ] Can add new topic
- [ ] Can remove topic
- [ ] Weight validation shows error when sum ≠ 1.0
- [ ] "Auto-Balance" button normalizes weights
- [ ] "Save Settings" persists changes
- [ ] Success toast appears on save

**Schedule**
- [ ] Timezone dropdown works
- [ ] Cron schedule displays correctly (read-only)

**Content Filters**
- [ ] Rumor filter checkbox works
- [ ] Can add banned domains (textarea)
- [ ] Window hours input accepts numbers

**Voice & Style**
- [ ] Host voice dropdown works
- [ ] Analyst voice dropdown works
- [ ] Pronunciation glossary textarea works
- [ ] Can enter key=value pairs

#### Test 5.3: Runs Tab

**Initial State**
- [ ] "Run Now" button enabled
- [ ] Runs table shows "No runs yet" message
- [ ] No active run status displayed

**Trigger Run**
- [ ] Click "Run Now" button
- [ ] Confirmation dialog appears
- [ ] Button disables and shows spinner
- [ ] Active run status appears
- [ ] Table updates when run completes (2-5 min)

**After Run**
- [ ] Table shows run with date, status, stories, duration
- [ ] Status badge colored correctly (green=success, red=failed)
- [ ] "Play" button links to episode MP3
- [ ] "Details" button shows run information
- [ ] "Run Now" re-enables after completion

**Concurrent Run Prevention**
- [ ] Trigger first run
- [ ] Try to trigger second run
- [ ] Error message appears
- [ ] First run continues unaffected

#### Test 5.4: Logs Tab

**Initial Load**
- [ ] "Connecting to log stream..." message
- [ ] Controls visible (Refresh, Pause, Download, Filter, Search)
- [ ] Log viewer empty or shows connection message

**After Run**
- [ ] Logs appear in viewer
- [ ] Color-coded by level (INFO=blue, WARN=orange, ERROR=red)
- [ ] Timestamp displayed for each entry
- [ ] Agent name shown in brackets
- [ ] Auto-scrolls to bottom

**Controls**
- [ ] "Refresh" button reloads logs
- [ ] "Pause Auto-scroll" stops scrolling
- [ ] "Resume Auto-scroll" re-enables scrolling
- [ ] "Download" exports JSONL file
- [ ] Level filter dropdown filters logs
- [ ] Search input filters logs by text

**Polling**
- [ ] Logs update every 2 seconds
- [ ] New logs appear automatically (when auto-scroll enabled)
- [ ] No errors in browser console

#### Test 5.5: URLs Tab

**RSS Feed**
- [ ] Feed URL displayed correctly
- [ ] "Copy" button copies to clipboard
- [ ] Success toast appears on copy

**Latest Episode**
- [ ] Episode URL shown (or "Loading...")
- [ ] "Copy" button works
- [ ] URL format: `/podcast/episodes/{date}.mp3`

**All Episodes**
- [ ] List shows after first run
- [ ] Each episode has date, URL, Play, and Copy buttons
- [ ] "Play" opens MP3 in new tab
- [ ] "Copy" copies URL to clipboard

**Header Links**
- [ ] RSS Feed link in header works
- [ ] Latest Episode link in header works

### 6. Integration Tests

#### Test 6.1: Full Run Workflow
1. Open dashboard
2. Go to Settings
3. Adjust topic weights (e.g., AI to 0.6)
4. Save settings
5. Go to Runs tab
6. Click "Run Now"
7. Switch to Logs tab
8. Watch logs stream in real-time
9. Return to Runs tab after 5 minutes
10. Verify run succeeded
11. Go to URLs tab
12. Click "Play" on episode

Expected:
- [ ] Settings saved successfully
- [ ] Run triggered without errors
- [ ] Logs show all phases (Ingestion, Ranking, etc.)
- [ ] Run completes with status "success"
- [ ] Episode playable via URL
- [ ] Feed updated with new episode

#### Test 6.2: Error Handling
1. Set invalid OpenAI API key in Vercel
2. Trigger run from dashboard
3. Wait for failure

Expected:
- [ ] Run fails with "ERROR" status
- [ ] Logs show OpenAI error message
- [ ] Dashboard doesn't crash
- [ ] Can retry after fixing API key

#### Test 6.3: Configuration Persistence
1. Change settings in dashboard
2. Save
3. Refresh page
4. Check settings still applied

Expected:
- [ ] All settings persist across refresh
- [ ] Version number incremented
- [ ] Updated timestamp shown

### 7. Performance Tests

#### Test 7.1: Dashboard Load Time
- [ ] Dashboard loads in < 2 seconds
- [ ] No console errors
- [ ] All tabs switch instantly

#### Test 7.2: API Response Times
- [ ] Config API: < 500ms
- [ ] Runs list: < 1s
- [ ] Logs latest: < 1s
- [ ] Run trigger: Immediate response (actual run is async)

#### Test 7.3: Large Data Sets
- [ ] Load logs with 1000+ entries
- [ ] Filter/search remains responsive
- [ ] Download works for large files

### 8. Browser Compatibility

Test in:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome (Android)
- [ ] Mobile Safari (iOS)

Check:
- [ ] Layout responsive on mobile
- [ ] All buttons work
- [ ] Tables scrollable
- [ ] Toast notifications visible
- [ ] Forms functional

### 9. Security Tests

#### Test 9.1: Unauthorized Access
```bash
curl https://your-project.vercel.app/api/config
```
Expected: Config loads (read is public) or 401 if auth required

```bash
curl -X PUT https://your-project.vercel.app/api/config
```
Expected: 401 Unauthorized

#### Test 9.2: HTTPS Only
- [ ] Verify dashboard only accessible via HTTPS
- [ ] HTTP redirects to HTTPS (Vercel handles)
- [ ] No mixed content warnings

#### Test 9.3: Token in URL
- [ ] Token NOT visible in URL
- [ ] Token only in Authorization header
- [ ] localStorage used for persistence

### 10. Regression Tests

After any code changes, verify:
- [ ] Existing episodes still accessible
- [ ] Feed XML still valid
- [ ] Cron job still scheduled
- [ ] Episode generation still works
- [ ] No broken API endpoints

## Manual Smoke Test (5 minutes)

Quick test before release:

1. **Open Dashboard** → Loads successfully
2. **Check Health** → All green
3. **View Settings** → Topics and config display
4. **Check Runs** → Previous runs visible
5. **View Logs** → Logs load without error
6. **Check URLs** → Feed and episodes accessible
7. **Test Run** → Click "Run Now", verify starts
8. **Watch Logs** → Real-time updates work
9. **Verify Episode** → New episode playable
10. **Test Feed** → RSS feed updated

If all pass: ✅ Ready for production

## Automated Testing (Future)

### Unit Tests
```bash
# Test config storage
npm test -- config-storage.test.ts

# Test auth middleware
npm test -- auth.test.ts

# Test runs storage
npm test -- runs-storage.test.ts
```

### Integration Tests
```bash
# Test full API workflow
npm test -- integration/dashboard.test.ts
```

### E2E Tests
```bash
# Test UI with Playwright
npm test:e2e
```

## Issue Tracking

Found issues during testing:

| #   | Issue | Severity | Status |
|-----|-------|----------|--------|
| 1   |       |          |        |
| 2   |       |          |        |

## Sign-Off

- [ ] All tests passed
- [ ] No critical issues
- [ ] Documentation updated
- [ ] Environment variables set
- [ ] Deployed to production
- [ ] Stakeholders notified

**Tester**: _______________  
**Date**: _______________  
**Version**: _______________

---

**Dashboard is ready for production! 🎉**

