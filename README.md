# Daily Personal News Podcast

> **Production-ready AI-powered daily morning news podcast generator**  
> Personalized daily audio briefs on any topics you configure  
> Built with an agentic architecture on Vercel with OpenAI

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/daily-personal-news-podcast)

## Overview

This system automatically generates a personalized daily morning news podcast using a sophisticated agentic architecture. It ingests news from multiple sources, ranks stories by relevance, creates a professional script, synthesizes natural-sounding audio with OpenAI TTS, and publishes to an RSS feed—all running on Vercel's serverless platform.

### Key Features

- **🤖 Agentic Architecture**: 10 specialized agents working together
- **📰 Multi-Source Ingestion**: RSS feeds, company blogs, Google News
- **🎯 Smart Ranking**: AI-powered relevance scoring with diversity
- **✍️ Professional Scripting**: Conversational, cite-checked content
- **🔊 Natural TTS**: OpenAI's HD voices with proper pacing
- **📱 Podcast RSS**: Standard podcast feed for any app
- **⏰ Automated Daily**: Vercel Cron runs at 12:00 UTC
- **💾 Flexible Storage**: Vercel Blob or S3-compatible
- **🔒 Safety First**: Fact-checking and content safety agents
- **🌐 External API**: Programmatic access for AI agents to trigger and monitor runs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                           │
│              (Coordinates agent pipeline)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌───────────────┐        ┌──────────────────┐
│  INGESTION    │───────▶│    RANKING       │
│  Agent        │        │    Agent         │
│  • RSS feeds  │        │  • Embeddings    │
│  • Companies  │        │  • Diversity     │
└───────────────┘        └─────────┬────────┘
                                   │
                         ┌─────────┴─────────┐
                         ▼                   ▼
                  ┌─────────────┐    ┌──────────────┐
                  │  OUTLINE    │───▶│ SCRIPTWRITER │
                  │  Agent      │    │ Agent        │
                  └─────────────┘    └──────┬───────┘
                                            │
                         ┌──────────────────┴──────────────┐
                         ▼                                 ▼
                  ┌─────────────┐                 ┌──────────────┐
                  │ FACT-CHECK  │────────────────▶│   SAFETY     │
                  │ Agent       │                 │   Agent      │
                  └─────────────┘                 └──────┬───────┘
                                                         │
                         ┌───────────────────────────────┴──────┐
                         ▼                                      ▼
                  ┌─────────────┐                      ┌───────────────┐
                  │ TTS DIRECTOR│─────────────────────▶│ AUDIO ENGINEER│
                  │ Agent       │                      │ Agent         │
                  └─────────────┘                      └───────┬───────┘
                                                               │
                         ┌─────────────────────────────────────┴────┐
                         ▼                                          ▼
                  ┌─────────────┐                          ┌──────────────┐
                  │  PUBLISHER  │─────────────────────────▶│   MEMORY     │
                  │  Agent      │                          │   Agent      │
                  │  • MP3      │                          │  • Feedback  │
                  │  • RSS Feed │                          │  • Learning  │
                  └─────────────┘                          └──────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Vercel account
- OpenAI API key

### Local Development

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd daily-personal-news-podcast
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set:
   ```
   OPENAI_API_KEY=sk-...
   PODCAST_BASE_URL=http://localhost:3000
   ```

3. **Run locally**:
   ```bash
   npm run dev
   
   # In another terminal, trigger generation:
   curl -X POST http://localhost:3000/api/run
   ```

### Deploy to Vercel

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Set environment variables** in Vercel dashboard:
   - `OPENAI_API_KEY`
   - `PODCAST_BASE_URL` (your Vercel URL)
   - `BLOB_READ_WRITE_TOKEN` (auto-configured by Vercel Blob)

4. **Enable Vercel Blob Storage**:
   - Go to your project in Vercel dashboard
   - Navigate to Storage → Create Database → Blob
   - This automatically configures `BLOB_READ_WRITE_TOKEN`

5. **Verify cron is active**:
   - Check Settings → Cron Jobs
   - Should show: `POST /api/run` at `0 12 * * *`

6. **Manual trigger** (optional):
   ```bash
   curl -X POST https://your-domain.vercel.app/api/run
   ```

7. **Access your podcast feed**:
   ```
   https://your-domain.vercel.app/podcast/feed.xml
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | ✅ | - | OpenAI API key for embeddings and TTS |
| `PODCAST_BASE_URL` | ✅ | - | Public URL of your deployment |
| `STORAGE_BACKEND` | ❌ | `vercel-blob` | Storage backend (`vercel-blob` or `s3`) |
| `BLOB_READ_WRITE_TOKEN` | ⚠️ | - | Auto-set by Vercel when using Blob storage |
| `TIMEZONE` | ❌ | `America/New_York` | Timezone for scheduling |
| `TOPIC_WEIGHTS` | ❌ | `ai:0.5,vz:0.3,acn:0.2` | Topic importance weights |
| `WINDOW_HOURS` | ❌ | `36` | News lookback window in hours |
| `TARGET_DURATION_SECONDS` | ❌ | `900` | Target episode length (15 min) |

### S3-Compatible Storage (Optional)

To use S3, R2, or MinIO instead of Vercel Blob:

```env
STORAGE_BACKEND=s3
S3_ENDPOINT=https://your-bucket.r2.cloudflarestorage.com
S3_BUCKET=daily-podcast
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=auto
```

## API Endpoints

### `POST /api/run`

Triggers the podcast generation pipeline.

**Query Parameters**:
- `date` (optional): `YYYY-MM-DD` format for historical episodes
- `force` (optional): `true` to regenerate existing episodes

**Response**:
```json
{
  "success": true,
  "episode": {
    "date": "2024-01-15",
    "url": "https://...",
    "duration_sec": 892,
    "word_count": 2247
  },
  "metrics": {
    "total_time_ms": 125000,
    "agent_times": { ... }
  }
}
```

### `GET /podcast/feed.xml`

Returns the RSS podcast feed.

### `GET /podcast/episodes/:date.mp3`

Streams episode audio with Range support.

**Example**: `/podcast/episodes/2024-01-15.mp3`

### `GET /api/health`

Health check endpoint.

## Agent Details

### 1. Ingestion Agent
- Fetches from RSS feeds you configure (any company, topic, or industry)
- Normalizes content to `Story` objects
- Filters by language, quality, and relevance
- Deduplicates by domain

### 2. Ranking Agent
- Generates embeddings for stories and topics
- Scores by recency, topic match, and authority
- Ensures diversity (no duplicate/similar stories)
- Guarantees minimum one story per topic

### 3. Outline Agent
- Structures stories into radio segments:
  - Cold Open (hook)
  - Headlines (3-4 top stories)
  - Deep Dive (1 detailed story)
  - Quick Hits (4-6 brief updates)
  - What to Watch (forward-looking)
  - Sign-off (closing)

### 4. Scriptwriter Agent
- Writes conversational 2,300-word script
- Adds inline citations `[1]`, `[2]`, etc.
- Includes stage directions and pauses
- Maintains engaging, professional tone

### 5. Fact-Check Agent
- Validates all claims have citations
- Adds hedging language where needed
- Flags unsupported statements
- Ensures journalistic integrity

### 6. Safety Agent
- Screens for legal/compliance risks
- Removes defamation and unverified claims
- Adds disclaimers (not financial advice, etc.)
- Neutralizes inflammatory language

### 7. TTS Director Agent
- Assigns voices (Nova, Onyx, Alloy)
- Removes stage directions for TTS
- Splits long segments (< 4000 chars)
- Optimizes pacing

### 8. Audio Engineer Agent
- Synthesizes segments via OpenAI TTS
- Concatenates segments
- Normalizes loudness (target: -16 LUFS)
- Exports MP3

### 9. Publisher Agent
- Uploads MP3 to storage
- Updates RSS feed.xml
- Stores episode manifest
- Makes publicly accessible

### 10. Memory Agent
- Tracks listener preferences
- Adjusts topic weights over time
- Maintains pronunciation glossary
- Learns from feedback

## Operational Runbook

### Monitoring

**Check last run**:
```bash
curl https://your-domain.vercel.app/api/health | jq .
```

**View logs** in Vercel dashboard:
- Functions → Select function → Logs

### Troubleshooting

#### No episode generated

1. Check Vercel cron is enabled
2. Verify `OPENAI_API_KEY` is set
3. Check storage connectivity in `/api/health`
4. Review function logs for errors

#### Poor audio quality

- OpenAI TTS-1-HD is used (highest quality)
- Check script word count (target: 2,100-2,500)
- Verify no TTS errors in logs

#### Stories not relevant

- Adjust `TOPIC_WEIGHTS` in environment
- Check RSS feeds are accessible
- Review ingestion agent logs

### Manual Operations

**Regenerate today's episode**:
```bash
curl -X POST "https://your-domain.vercel.app/api/run?force=true"
```

**Generate historical episode**:
```bash
curl -X POST "https://your-domain.vercel.app/api/run?date=2024-01-10"
```

**Update topic weights**:
1. Go to Vercel dashboard → Settings → Environment Variables
2. Update `TOPIC_WEIGHTS=ai:0.6,vz:0.25,acn:0.15`
3. Redeploy or wait for next cron run

### Maintenance

**Feed keeps last 30 episodes**. Older episodes remain in storage but aren't listed in RSS.

**Storage cleanup** (if needed):
```bash
# List old episodes
vercel blob ls episodes/

# Delete specific episode
vercel blob rm episodes/2024-01-01_daily_rohit_news.mp3
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## Cost Estimates

Based on typical usage:

- **OpenAI API**: ~$0.50-1.00 per episode
  - Embeddings: $0.01
  - GPT-4 Turbo (agents): $0.30-0.50
  - TTS HD: $0.20-0.40
- **Vercel**: Free tier handles 1 episode/day
- **Storage**: Minimal (< 20 MB/episode)

**Monthly**: ~$15-30 for daily episodes

## Customization

### Change Voices

Edit `lib/agents/tts-director.ts`:
```typescript
private readonly voices = {
  host: 'nova',    // Change to 'shimmer', 'alloy', etc.
  analyst: 'onyx',
  stinger: 'alloy',
};
```

### Add Topics

Edit `lib/config.ts` → `getTopicConfigs()`:
```typescript
{
  name: 'Tesla',
  weight: 0.2,
  sources: ['https://www.tesla.com/blog/rss'],
  keywords: ['Tesla', 'electric vehicle', 'EV'],
}
```

### Adjust Script Length

Change `TARGET_DURATION_SECONDS` in `.env`:
```env
TARGET_DURATION_SECONDS=600  # 10 minutes
```

## Architecture Decisions

### Why Agentic?

- **Modularity**: Each agent is independently testable
- **Reliability**: Retry logic per agent
- **Observability**: Per-agent logging and metrics
- **Flexibility**: Easy to add/remove agents

### Why OpenAI Stack?

- **Embeddings**: Fast, high-quality semantic search
- **GPT-4 Turbo**: Best reasoning for fact-checking
- **TTS HD**: Most natural-sounding synthesis

### Why Vercel?

- **Serverless**: No infrastructure management
- **Cron**: Built-in scheduling
- **Blob**: Simple, fast storage
- **Edge**: Low latency globally

## Dashboard

### Overview

The podcast system includes a comprehensive web dashboard for configuration, monitoring, and manual control at `/dashboard`.

### Accessing the Dashboard

1. **Set Authentication** (required for production):
   ```bash
   # Option 1: Bearer Token
   vercel env add DASHBOARD_TOKEN
   # Enter a secure random token
   
   # Option 2: Basic Auth
   vercel env add DASHBOARD_USER
   vercel env add DASHBOARD_PASS
   ```

2. **Open Dashboard**:
   ```
   https://your-project.vercel.app/dashboard
   ```

3. **Login** with your token or credentials

### Dashboard Features

#### ⚙️ Settings Tab

Configure all aspects of your podcast:

- **Topics & Weights**: Add, remove, or adjust topic priorities
  - Weights must sum to 1.0
  - Use "Auto-Balance" to normalize weights
  - Inline validation shows weight errors

- **Schedule**: View cron schedule and set timezone

- **Content Filters**:
  - Enable/disable rumor filter
  - Ban specific domains
  - Adjust story window (hours)

- **Voice & Style**:
  - Choose OpenAI voices for host and analyst
  - Add pronunciation glossary (e.g., `AI=A I`)

- **System Health**: View OpenAI and storage configuration status

#### ▶️ Runs Tab

Monitor and trigger podcast generation:

- **Run Now**: Manually trigger episode generation
- **Recent Runs**: View history with status, duration, story count
- **Active Run Status**: See when a run is in progress
- **Run Details**: Click to view picks, outline, and metrics

#### 📋 Logs Tab

Real-time log viewing with powerful features:

- **Live Tail**: Auto-updating log stream (polling-based)
- **Search & Filter**: Find specific messages or filter by level (INFO/WARN/ERROR/DEBUG)
- **Auto-scroll**: Toggle automatic scrolling
- **Download**: Export logs as JSONL file

#### 🔗 URLs Tab

Quick access to all podcast URLs:

- RSS Feed URL (for podcast apps)
- Latest episode URL
- All episode URLs with play and copy buttons

### Dashboard API Endpoints

The dashboard uses these authenticated API endpoints:

- `GET /api/config` - Load configuration
- `PUT /api/config` - Save configuration
- `GET /api/runs` - List recent runs
- `GET /api/runs/:runId` - Get run details
- `GET /api/logs/latest` - Get latest logs
- `GET /api/logs/:runId` - Get specific run logs
- `GET /api/logs/stream` - Stream logs (SSE)

### Security

- All write endpoints require authentication
- Token stored in browser localStorage
- 401 responses trigger re-authentication
- No sensitive data in client-side code

### Tips

1. **First Time Setup**:
   - Check System Health to verify OpenAI and Storage
   - Review default topics and adjust weights
   - Save settings before first run

2. **Monitoring**:
   - Check Logs tab after each run
   - Look for WARN/ERROR messages
   - Download logs for debugging

3. **Manual Runs**:
   - Use "Run Now" to test configuration changes
   - Wait for active runs to complete
   - Check run details for story selections

## 🌐 External API

The system provides an external API for AI agents and automation tools to programmatically interact with the podcast system.

### Setup

1. Set the `EXTERNAL_API_KEY` environment variable:
   ```bash
   vercel env add EXTERNAL_API_KEY
   # Generate a secure key: openssl rand -hex 32
   ```

### Available Endpoints

- **POST** `/api/external/trigger-run` - Trigger a new podcast run
- **GET** `/api/external/run-status?runId={id}` - Get run status and progress
- **GET** `/api/external/run-logs?runId={id}` - Retrieve agent execution logs
- **GET** `/api/external/run-errors?runId={id}` - Get all errors from a run

### Authentication

All requests require the `X-API-Key` header:

```bash
curl -X POST https://your-domain.vercel.app/api/external/trigger-run \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{"force_overwrite": false}'
```

### Use Cases

- **Autonomous monitoring**: AI agents can monitor runs and detect issues
- **Automated retries**: Trigger re-runs when errors are detected
- **Integration testing**: Programmatically test the pipeline
- **Analytics**: Collect performance metrics across runs

📖 **Full documentation**: See [EXTERNAL_API_GUIDE.md](./EXTERNAL_API_GUIDE.md) for complete API reference, examples, and AI agent integration patterns.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file

## Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Dashboard**: `/dashboard` for configuration and monitoring
- **Email**: podcast@example.com

---

**Built with ❤️ for Rohit's morning routine**

