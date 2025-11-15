# External API Guide

This guide explains how to use the External API to programmatically trigger podcast runs, monitor progress, and retrieve logs/errors.

## 🔐 Authentication

All external API endpoints require an API key for authentication.

### Setup API Key

1. Set the `EXTERNAL_API_KEY` environment variable in your Vercel project:
   ```bash
   vercel env add EXTERNAL_API_KEY
   ```

2. Generate a secure random API key:
   ```bash
   openssl rand -hex 32
   ```

3. Store this key securely - you'll need it for all API requests.

### Authentication Header

Include the API key in all requests:
```
X-API-Key: your-api-key-here
```

---

## 📡 API Endpoints

### 1. Trigger a Podcast Run

**Endpoint:** `POST /api/external/trigger-run`

**Description:** Starts a new podcast generation run.

**Headers:**
```
X-API-Key: your-api-key-here
Content-Type: application/json
```

**Body (all optional):**
```json
{
  "date": "2024-01-15",
  "force_overwrite": true,
  "window_hours": 24
}
```

**Response:**
```json
{
  "success": true,
  "run_id": "2024-01-15",
  "result": {
    "success": true,
    "run_id": "2024-01-15",
    "manifest_url": "https://...",
    "episode_url": "https://...",
    "feed_url": "https://..."
  },
  "message": "Podcast run triggered successfully"
}
```

**Example (curl):**
```bash
curl -X POST https://your-domain.vercel.app/api/external/trigger-run \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"date": "2024-01-15", "force_overwrite": true}'
```

**Example (JavaScript):**
```javascript
const response = await fetch('https://your-domain.vercel.app/api/external/trigger-run', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your-api-key-here',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    date: '2024-01-15',
    force_overwrite: true,
  }),
});

const result = await response.json();
console.log(result);
```

---

### 2. Get Run Status

**Endpoint:** `GET /api/external/run-status?runId=2024-01-15`

**Description:** Get the current status and progress of a podcast run.

**Query Parameters:**
- `runId` (optional): Specific run ID. If omitted, returns latest run.

**Headers:**
```
X-API-Key: your-api-key-here
```

**Response:**
```json
{
  "success": true,
  "run_id": "2024-01-15",
  "status": "completed",
  "current_phase": "Memory",
  "progress_updates": [
    {
      "phase": "Ingestion",
      "status": "completed",
      "message": "Found 50 stories",
      "timestamp": "2024-01-15T12:00:00.000Z"
    },
    ...
  ],
  "manifest": { ... },
  "agent_times": {
    "ingestion": 15000,
    "ranking": 3000,
    "scripting": 45000,
    "tts": 120000,
    "total": 250000
  }
}
```

**Example:**
```bash
curl https://your-domain.vercel.app/api/external/run-status?runId=2024-01-15 \
  -H "X-API-Key: your-api-key-here"
```

---

### 3. Get Run Logs

**Endpoint:** `GET /api/external/run-logs?runId=2024-01-15&agent=RankingAgent`

**Description:** Retrieve detailed logs from agent executions.

**Query Parameters:**
- `runId` (required): The run ID to get logs for
- `agent` (optional): Specific agent name. If omitted, returns all agent logs.

**Agent Names:**
- `IngestionAgent`
- `RankingAgent`
- `ScraperAgent`
- `OutlineAgent`
- `ScriptwriterAgent`
- `FactCheckAgent`
- `SafetyAgent`
- `TtsDirectorAgent`
- `AudioEngineerAgent`
- `PublisherAgent`
- `MemoryAgent`

**Headers:**
```
X-API-Key: your-api-key-here
```

**Response:**
```json
{
  "success": true,
  "run_id": "2024-01-15",
  "logs": {
    "RankingAgent": {
      "agent": "RankingAgent",
      "run_id": "2024-01-15",
      "timestamp": "2024-01-15T12:01:00.000Z",
      "input": { ... },
      "output": { ... },
      "errors": [],
      "duration_ms": 3000
    },
    ...
  }
}
```

**Example:**
```bash
# Get all logs
curl https://your-domain.vercel.app/api/external/run-logs?runId=2024-01-15 \
  -H "X-API-Key: your-api-key-here"

# Get specific agent logs
curl https://your-domain.vercel.app/api/external/run-logs?runId=2024-01-15&agent=RankingAgent \
  -H "X-API-Key: your-api-key-here"
```

---

### 4. Get Run Errors

**Endpoint:** `GET /api/external/run-errors?runId=2024-01-15`

**Description:** Get all errors that occurred during a podcast run.

**Query Parameters:**
- `runId` (required): The run ID to check for errors

**Headers:**
```
X-API-Key: your-api-key-here
```

**Response:**
```json
{
  "success": true,
  "run_id": "2024-01-15",
  "has_errors": true,
  "error_count": 2,
  "errors": [
    {
      "agent": "ScraperAgent",
      "timestamp": "2024-01-15T12:02:00.000Z",
      "errors": [
        "Failed to fetch https://example.com: timeout"
      ],
      "duration_ms": 15000
    }
  ]
}
```

**Example:**
```bash
curl https://your-domain.vercel.app/api/external/run-errors?runId=2024-01-15 \
  -H "X-API-Key: your-api-key-here"
```

---

## 🤖 AI Agent Usage Examples

### Automated Monitoring Script

Here's an example of how an AI agent could monitor and respond to podcast runs:

```javascript
const API_BASE = 'https://your-domain.vercel.app/api/external';
const API_KEY = process.env.EXTERNAL_API_KEY;

async function monitorRun(runId) {
  // Check status
  const statusRes = await fetch(`${API_BASE}/run-status?runId=${runId}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  const status = await statusRes.json();
  
  console.log(`Run ${runId} status: ${status.status}`);
  console.log(`Current phase: ${status.current_phase}`);
  
  // If completed, check for errors
  if (status.status === 'completed') {
    const errorsRes = await fetch(`${API_BASE}/run-errors?runId=${runId}`, {
      headers: { 'X-API-Key': API_KEY },
    });
    const errors = await errorsRes.json();
    
    if (errors.has_errors) {
      console.error(`⚠️ Run ${runId} completed with ${errors.error_count} errors:`);
      errors.errors.forEach(err => {
        console.error(`  - ${err.agent}: ${err.errors.join(', ')}`);
      });
      
      // AI could analyze errors and trigger fixes here
    } else {
      console.log(`✅ Run ${runId} completed successfully!`);
    }
  }
  
  return status;
}

// Trigger a run
async function triggerAndMonitor() {
  // Start run
  const triggerRes = await fetch(`${API_BASE}/trigger-run`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      force_overwrite: false,
    }),
  });
  const result = await triggerRes.json();
  
  console.log(`Started run: ${result.run_id}`);
  
  // Monitor until complete
  let status;
  do {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
    status = await monitorRun(result.run_id);
  } while (status.status === 'running');
}

triggerAndMonitor();
```

### Error Analysis and Auto-Fix

```javascript
async function analyzeAndFix(runId) {
  // Get errors
  const errorsRes = await fetch(`${API_BASE}/run-errors?runId=${runId}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  const { errors } = await errorsRes.json();
  
  // Analyze error patterns
  const scraperErrors = errors.filter(e => e.agent === 'ScraperAgent');
  
  if (scraperErrors.length > 0) {
    console.log('🔧 Detected scraper failures, triggering retry...');
    
    // Retry with increased timeout
    await fetch(`${API_BASE}/trigger-run`, {
      method: 'POST',
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        date: runId,
        force_overwrite: true,
      }),
    });
  }
}
```

---

## 🔒 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for API key storage
3. **Rotate keys regularly** (monthly recommended)
4. **Monitor API usage** for unusual patterns
5. **Use HTTPS only** for all API requests
6. **Restrict API access** to trusted IP addresses if possible

---

## ⚠️ Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (missing parameters) |
| 401 | Unauthorized (invalid or missing API key) |
| 404 | Not Found (run doesn't exist) |
| 405 | Method Not Allowed |
| 500 | Internal Server Error |

---

## 📊 Rate Limits

- **Trigger Run**: Max 10 requests per hour
- **Status/Logs/Errors**: Max 100 requests per hour

(Note: These limits are suggestions - implement via Vercel's rate limiting or external service)

---

## 🚀 Next Steps

1. Set up your `EXTERNAL_API_KEY` in Vercel
2. Test the API with curl or Postman
3. Build monitoring scripts
4. Set up automated alerts for failures
5. Integrate with your AI agent for autonomous operation

For issues or questions, check the logs or open an issue on GitHub.

