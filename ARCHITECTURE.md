# Architecture Documentation

## System Overview

The Daily Personal News Podcast is a production-ready agentic AI system that automatically generates personalized podcast episodes. The architecture follows a multi-agent pattern where specialized agents collaborate to transform raw news into professional audio content.

## Core Principles

1. **Agent Autonomy**: Each agent is responsible for a single, well-defined task
2. **Loose Coupling**: Agents communicate through standardized message protocols
3. **Idempotency**: Pipeline can be safely re-run without side effects
4. **Observability**: Every agent logs inputs, outputs, and performance metrics
5. **Resilience**: Retry logic and error handling at every layer
6. **Serverless-First**: Designed for stateless, time-limited execution

## Architecture Diagram

```
                            ┌─────────────────┐
                            │   Vercel Cron   │
                            │   (12:00 UTC)   │
                            └────────┬────────┘
                                     │
                            ┌────────▼────────┐
                            │  POST /api/run  │
                            └────────┬────────┘
                                     │
                    ┌────────────────▼────────────────┐
                    │       ORCHESTRATOR              │
                    │  • Pipeline coordination        │
                    │  • Retry & circuit breakers     │
                    │  • State management             │
                    │  • Metrics collection           │
                    └────────────────┬────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           │                         │                         │
    ┌──────▼──────┐          ┌──────▼──────┐          ┌──────▼──────┐
    │  INGESTION  │──────────│   RANKING   │──────────│   OUTLINE   │
    │   AGENT     │          │    AGENT    │          │    AGENT    │
    │             │          │             │          │             │
    │ • RSS Parse │          │ • Embeddings│          │ • Structure │
    │ • Filter    │          │ • Scoring   │          │ • Segments  │
    │ • Normalize │          │ • Diversity │          │ • Timing    │
    └─────────────┘          └─────────────┘          └──────┬──────┘
                                                              │
                                                       ┌──────▼──────┐
                                                       │SCRIPTWRITER │
                                                       │   AGENT     │
                                                       │             │
                                                       │ • Write     │
                                                       │ • Citations │
                                                       │ • Tone      │
                                                       └──────┬──────┘
                                                              │
                                          ┌───────────────────┼───────────────────┐
                                          │                   │                   │
                                   ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
                                   │ FACT-CHECK  │    │   SAFETY    │    │TTS DIRECTOR │
                                   │   AGENT     │────│   AGENT     │────│   AGENT     │
                                   │             │    │             │    │             │
                                   │ • Validate  │    │ • Screen    │    │ • Voices    │
                                   │ • Cite      │    │ • Rewrite   │    │ • Pacing    │
                                   │ • Flag      │    │ • Disclaim  │    │ • Segment   │
                                   └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                                 │
                                                                          ┌──────▼──────┐
                                                                          │   AUDIO     │
                                                                          │  ENGINEER   │
                                                                          │   AGENT     │
                                                                          │             │
                                                                          │ • Synth TTS │
                                                                          │ • Stitch    │
                                                                          │ • Normalize │
                                                                          └──────┬──────┘
                                                                                 │
                                          ┌──────────────────────────────────────┴────┐
                                          │                                           │
                                   ┌──────▼──────┐                            ┌──────▼──────┐
                                   │  PUBLISHER  │                            │   MEMORY    │
                                   │   AGENT     │                            │   AGENT     │
                                   │             │                            │             │
                                   │ • Upload    │                            │ • Profile   │
                                   │ • Feed XML  │                            │ • Feedback  │
                                   │ • Manifest  │                            │ • Learning  │
                                   └──────┬──────┘                            └─────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
             ┌──────▼──────┐       ┌──────▼──────┐      ┌──────▼──────┐
             │   Storage   │       │  GET /feed  │      │GET /episodes│
             │             │       │             │      │             │
             │ • Episodes  │       │ • RSS XML   │      │ • MP3 Stream│
             │ • Feed      │       │ • Metadata  │      │ • Range     │
             │ • Manifests │       │             │      │             │
             └─────────────┘       └─────────────┘      └─────────────┘
```

## Agent Specifications

### 1. Ingestion Agent

**Responsibility**: Fetch and normalize news from multiple sources

**Inputs**:
- Topic configurations (sources, keywords)
- Time window (hours to look back)
- Cutoff date

**Outputs**:
- Array of `Story` objects
- Ingestion metrics

**Implementation Details**:
- Uses `FeedTool` for RSS/Atom parsing
- Applies quality filters (length, language, spam keywords)
- Deduplicates by URL and domain
- Rate limits: respects `MAX_STORIES_PER_DOMAIN`

**Error Handling**:
- Individual feed failures don't stop pipeline
- Returns empty array if all sources fail
- Logs each source fetch attempt

### 2. Ranking Agent

**Responsibility**: Score and select top stories based on relevance and diversity

**Inputs**:
- Array of stories
- Topic weights
- Target count (8-12)

**Outputs**:
- Array of `Pick` objects with scores and rationale
- Topic distribution

**Implementation Details**:
- Generates embeddings for all story titles + summaries
- Pre-computed topic vectors for matching
- Scoring formula:
  ```
  score = 0.3 * recency + 0.5 * topic_match * weight + 0.2 * authority
  ```
- Diversity enforcement: rejects stories with >85% similarity to selected

**Performance**:
- Embedding: ~1-2s for 50 stories
- Scoring: < 100ms
- Total: ~2-3s

### 3. Outline Agent

**Responsibility**: Structure selected stories into radio segments

**Inputs**:
- Ranked picks
- Target duration
- Episode date

**Outputs**:
- Outline with sections and word budgets

**Segments**:
1. **Cold Open** (30-45s / 80 words): Hook
2. **Headlines** (3 min / 450 words): Top 3-4 stories
3. **Deep Dive** (5 min / 750 words): Detailed analysis of 1 story
4. **Quick Hits** (4 min / 600 words): 4-6 brief updates
5. **What to Watch** (2 min / 300 words): Forward-looking
6. **Sign-off** (15-30s / 60 words): Closing

**Implementation Details**:
- Uses GPT-4 to intelligently assign stories to segments
- Ensures topic balance across segments
- Adjusts word budgets dynamically based on story count

### 4. Scriptwriter Agent

**Responsibility**: Write conversational, cited script

**Inputs**:
- Outline
- Story picks (full content)
- Listener name

**Outputs**:
- Script sections with text and citations
- Source list

**Style Guidelines**:
- Conversational tone, contractions
- Stage directions: `(warmly)`, `[beat 300ms]`
- Citations: `[1]`, `[2]`, etc.
- Target: 2,300 ± 200 words
- Reading pace: ~150 wpm

**Implementation Details**:
- Generates each section separately for better focus
- Uses GPT-4 with temperature=0.8 for natural variation
- Extracts citation references from text
- Maps citations to source URLs

### 5. Fact-Check Agent

**Responsibility**: Validate claims and ensure proper attribution

**Inputs**:
- Script
- Sources

**Outputs**:
- Revised script (if needed)
- List of changes made
- Flags raised

**Checks**:
- All factual claims have citations
- No unsupported speculation
- Statistics and quotes attributed
- Claims match source content

**Actions**:
- Adds citations where missing
- Adds hedging language ("reports suggest")
- Flags serious concerns for review
- Suggests rewrites

### 6. Safety Agent

**Responsibility**: Screen for risky or sensitive content

**Inputs**:
- Script

**Outputs**:
- Safe script
- List of edits
- Risk level (low/medium/high)

**Screening**:
- Legal/compliance (SEC, insider trading)
- Defamation
- Leaked/confidential information
- Investment advice
- Inflammatory language
- Privacy violations

**Actions**:
- Rewrites problematic content
- Removes unverifiable claims
- Adds disclaimers
- Flags high-risk content

**Temperature**: 0.2 (conservative)

### 7. TTS Director Agent

**Responsibility**: Prepare script for text-to-speech synthesis

**Inputs**:
- Script

**Outputs**:
- Synthesis plan (segments with voices)
- Estimated duration

**Voice Assignments**:
- **Host** (Nova): Cold Open, Headlines, Quick Hits, Sign-off
- **Analyst** (Onyx): Deep Dive
- **Stinger** (Alloy): Transitions

**Transformations**:
- Removes stage directions `(warmly)`
- Converts pause markers to ellipsis
- Splits segments at 4000 chars (TTS limit)
- Maintains natural sentence breaks

### 8. Audio Engineer Agent

**Responsibility**: Synthesize and assemble final audio

**Inputs**:
- Synthesis plan

**Outputs**:
- Final MP3 buffer
- Actual duration

**Process**:
1. Synthesize each segment via OpenAI TTS
2. Concatenate segments
3. Normalize loudness (target: -16 LUFS)
4. Export as MP3

**Concurrency**: 3 parallel TTS requests

**Performance**:
- TTS: ~30-60s for 15-minute episode
- Concatenation: < 1s
- Total: ~1-2 minutes

### 9. Publisher Agent

**Responsibility**: Publish episode and update feed

**Inputs**:
- Audio buffer
- Manifest
- Podcast config

**Outputs**:
- Episode URL
- Feed URL
- Publish status

**Tasks**:
1. Upload MP3 to storage
2. Store episode manifest as JSON
3. Fetch all episode manifests
4. Generate RSS feed XML
5. Upload feed.xml to storage

**Feed Management**:
- Shows last 30 episodes
- Older episodes remain accessible by URL
- RSS 2.0 with iTunes extensions

### 10. Memory Agent

**Responsibility**: Learn from episodes and feedback

**Inputs**:
- Episode manifest
- Optional feedback (rating, preferences)

**Outputs**:
- Updated listener profile
- Insights

**Profile Contents**:
- Topic weights
- Preferred/avoided sources
- Pronunciation glossary
- Average rating
- Total episodes

**Learning**:
- Adjusts topic weights based on skipped sections
- Tracks source reliability
- Maintains pronunciation rules
- Calculates rolling average rating

## Tools Layer

### EmbeddingsTool
- **Model**: `text-embedding-3-small`
- **Batch**: Up to 100 texts at once
- **Cost**: ~$0.01 per 50 stories

### HttpTool
- **Timeout**: 15s per request
- **Retries**: 3 with exponential backoff
- **User-Agent**: Custom for identification

### FeedTool
- **Parser**: rss-parser
- **Timeout**: 15s
- **Handles**: RSS 2.0, Atom 1.0

### TtsTool
- **Model**: `tts-1-hd`
- **Voices**: alloy, echo, fable, onyx, nova, shimmer
- **Format**: MP3
- **Cost**: ~$0.015 per 1000 chars

### StorageTool
- **Backends**: Vercel Blob, S3-compatible
- **Auto-selects**: Based on `STORAGE_BACKEND` env
- **Public URLs**: Automatically signed

### AudioTool
- **Concatenation**: Simple buffer concat (MP3)
- **Normalization**: Placeholder (TTS already normalized)
- **Future**: ffmpeg integration for advanced processing

## Data Flow

### Story Object
```typescript
{
  id: string;              // SHA-256 hash of URL
  url: string;             // Canonical URL
  title: string;           // Cleaned title
  source: string;          // Domain
  published_at: Date;      // Publication timestamp
  summary?: string;        // Extracted summary
  raw?: string;            // Full content
  domain: string;          // Normalized domain
  topic?: string;          // Assigned topic (AI, VZ, ACN)
}
```

### Pick Object
```typescript
{
  story_id: string;        // Reference to Story
  story: Story;            // Full story object
  topic: string;           // Topic category
  score: number;           // 0-1 relevance score
  cluster_id?: number;     // Diversity cluster
  rationale: string;       // Why selected
}
```

### Script Object
```typescript
{
  sections: ScriptSection[];  // Array of sections
  sources: Source[];          // Citation list
  word_count: number;         // Total words
  token_count?: number;       // Estimated tokens
}
```

### EpisodeManifest
```typescript
{
  date: string;               // YYYY-MM-DD
  run_id: string;             // Same as date
  picks: Pick[];              // Selected stories
  outline_hash: string;       // Content hash
  script_hash: string;        // Content hash
  audio_hash: string;         // Content hash
  mp3_url: string;            // Public URL
  duration_sec: number;       // Actual duration
  word_count: number;         // Script words
  created_at: string;         // ISO timestamp
  metrics?: {...};            // Performance data
}
```

## Orchestrator State Machine

```
START
  ├─> CHECK_EXISTING
  │     ├─ exists & !force_overwrite → LOAD_MANIFEST → RETURN
  │     └─ !exists or force_overwrite → CONTINUE
  │
  ├─> INGESTION
  │     ├─ success → RANKING
  │     └─ failure → ERROR
  │
  ├─> RANKING
  │     ├─ success → OUTLINE
  │     └─ failure → ERROR
  │
  ├─> OUTLINE
  │     ├─ success → SCRIPTWRITING
  │     └─ failure → ERROR
  │
  ├─> SCRIPTWRITING
  │     ├─ success → FACT_CHECK
  │     └─ failure → ERROR
  │
  ├─> FACT_CHECK
  │     ├─ success → SAFETY
  │     └─ failure → ERROR
  │
  ├─> SAFETY
  │     ├─ risk=high → WARNING + CONTINUE
  │     └─ success → TTS_DIRECTOR
  │
  ├─> TTS_DIRECTOR
  │     ├─ success → AUDIO_ENGINEER
  │     └─ failure → ERROR
  │
  ├─> AUDIO_ENGINEER
  │     ├─ success → CREATE_MANIFEST → PUBLISHER
  │     └─ failure → ERROR
  │
  ├─> PUBLISHER
  │     ├─ success → MEMORY
  │     └─ failure → ERROR
  │
  └─> MEMORY
        ├─ success → SUCCESS
        └─ failure → WARNING (non-critical) + SUCCESS
```

## Storage Structure

```
storage/
├── episodes/
│   ├── 2024-01-15_daily_rohit_news.mp3
│   ├── 2024-01-15_manifest.json
│   ├── 2024-01-16_daily_rohit_news.mp3
│   ├── 2024-01-16_manifest.json
│   └── ...
├── runs/
│   ├── 2024-01-15/
│   │   ├── agents/
│   │   │   ├── IngestionAgent.json
│   │   │   ├── RankingAgent.json
│   │   │   └── ...
│   │   └── artifacts/
│   │       ├── ScriptwriterAgent/
│   │       │   └── script.json
│   │       └── ...
│   └── ...
├── memory/
│   └── listener_profile.json
└── feed.xml
```

## Performance Characteristics

### Typical Pipeline Timing

| Agent | Typical Duration | Max Duration | Bottleneck |
|-------|------------------|--------------|------------|
| Ingestion | 10-30s | 60s | Network I/O (RSS feeds) |
| Ranking | 2-5s | 10s | OpenAI Embeddings API |
| Outline | 3-8s | 15s | GPT-4 Turbo generation |
| Scriptwriter | 30-60s | 120s | GPT-4 Turbo (long output) |
| Fact-Check | 10-20s | 40s | GPT-4 Turbo analysis |
| Safety | 10-20s | 40s | GPT-4 Turbo analysis |
| TTS Director | 1-2s | 5s | Text processing |
| Audio Engineer | 60-120s | 180s | OpenAI TTS API |
| Publisher | 5-10s | 20s | Storage uploads |
| Memory | 1-2s | 5s | Storage I/O |

**Total**: 2-5 minutes typical, 8 minutes max

### Scalability Limits

**Current (Single Listener)**:
- Episodes/day: 1
- Concurrent pipeline: 1
- Storage: ~20 MB/episode
- Cost: ~$0.50-1.00/episode

**With Optimization**:
- Episodes/day: 10-100
- Concurrent pipeline: 3-5 (Vercel limits)
- Storage: ~600 MB-2 GB/month
- Cost: ~$50-100/month

**Enterprise Scale** (requires architecture changes):
- Episodes/day: 1000+
- Concurrent pipeline: 100+
- Storage: Dedicated CDN
- Cost: $1000+/month

## Security Considerations

### Secrets Management
- All API keys in environment variables
- No secrets in code or Git
- Vercel encrypts environment variables

### Content Safety
- Safety Agent screens all content
- Fact-Check Agent validates claims
- Human review available for high-risk content

### API Security
- Cron endpoint protected by Vercel authentication
- Optional `CRON_SECRET` for additional security
- Rate limiting via Vercel platform

### Data Privacy
- No user tracking
- No PII collected
- Listener profile stored in storage (not shared)

## Future Architecture Enhancements

### Planned Improvements

1. **Caching Layer**:
   - Redis for topic embeddings
   - Reduces Embeddings API calls
   - Faster ranking

2. **Job Queue**:
   - BullMQ or Inngest for parallel generation
   - Better reliability for multiple listeners
   - Retry management

3. **CDN Integration**:
   - CloudFlare Workers for MP3 delivery
   - Reduced bandwidth costs
   - Global low latency

4. **Database**:
   - PostgreSQL for episode metadata
   - Better querying and analytics
   - Easier feed generation

5. **Streaming TTS**:
   - Stream synthesis to storage
   - Reduce memory usage
   - Faster time-to-publish

6. **Advanced Audio**:
   - ffmpeg for proper loudness normalization
   - Background music mixing
   - Crossfades between segments

---

**Document Version**: 1.0  
**Last Updated**: 2024-01-15  
**Maintainer**: System Architecture Team

