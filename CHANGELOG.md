# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added
- Initial release of Daily Personal News Podcast system
- 10 specialized agents with agentic architecture:
  - Ingestion Agent (RSS, company blogs, AI ecosystem)
  - Ranking Agent (embeddings, diversity, recency scoring)
  - Outline Agent (structured radio segments)
  - Scriptwriter Agent (conversational 2,300-word scripts)
  - Fact-Check Agent (citation validation)
  - Safety Agent (content screening)
  - TTS Director Agent (voice assignment, pacing)
  - Audio Engineer Agent (synthesis, stitching, normalization)
  - Publisher Agent (MP3 + RSS feed publishing)
  - Memory Agent (listener learning and feedback)
- Vercel deployment with cron scheduling (12:00 UTC daily)
- OpenAI integration (GPT-4 Turbo, Embeddings, TTS HD)
- Storage abstraction (Vercel Blob and S3-compatible)
- API endpoints:
  - `POST /api/run` - Pipeline trigger
  - `GET /podcast/feed.xml` - RSS feed
  - `GET /podcast/episodes/:date.mp3` - Episode streaming with Range support
  - `GET /api/health` - Health check
- Comprehensive test suite with Vitest
- Full documentation (README, RUNBOOK, DEPLOYMENT)
- Environment-driven configuration
- Retry logic and error handling
- Per-agent observability and metrics

### Features
- Automated daily 15-minute morning news brief
- Topics: AI, Verizon, Accenture (configurable weights)
- Natural conversational scripting with citations
- High-quality OpenAI TTS voices (Nova, Onyx, Alloy)
- Idempotent episode generation
- Historical episode regeneration support
- Topic weight personalization via memory agent
- Safety and fact-checking guardrails

### Technical
- TypeScript for type safety
- Node.js 18+ runtime
- Vercel serverless functions
- OpenAI API for all AI operations
- RSS/Atom feed parsing
- Podcast RSS 2.0 with iTunes extensions
- Agent message protocol for observability
- Storage abstraction for portability

## [Unreleased]

### Planned
- Multi-listener support
- Feedback API endpoint for rating episodes
- Enhanced memory agent with preference learning
- Additional topics (configurable via UI)
- Web dashboard for episode management
- Analytics and listening metrics
- Custom intro/outro music support
- Voice cloning option
- Multi-language support

---

For upgrade instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).
For operational guidance, see [RUNBOOK.md](RUNBOOK.md).



