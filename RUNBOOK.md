# Operational Runbook

This runbook provides detailed operational guidance for running and maintaining the Daily Personal News Podcast system.

## Table of Contents

1. [System Health Checks](#system-health-checks)
2. [Daily Operations](#daily-operations)
3. [Incident Response](#incident-response)
4. [Performance Tuning](#performance-tuning)
5. [Backup and Recovery](#backup-and-recovery)
6. [Scaling Guidelines](#scaling-guidelines)

## System Health Checks

### Daily Health Check (Automated)

The system performs health checks automatically. View status:

```bash
curl https://your-domain.vercel.app/api/health | jq .
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "storage": "ok",
    "openai": "ok"
  },
  "last_run": {
    "date": "2024-01-15",
    "duration_sec": 892,
    "created_at": "2024-01-15T12:15:00.000Z"
  },
  "config": {
    "storage_backend": "vercel-blob",
    "timezone": "America/New_York",
    "target_duration_sec": 900
  }
}
```

### Weekly Checks

1. **Feed Validation**:
   ```bash
   curl https://your-domain.vercel.app/podcast/feed.xml | xmllint --noout -
   ```
   Should return no errors.

2. **Storage Usage**:
   ```bash
   vercel blob ls episodes/ | wc -l
   ```
   Typical: 60-90 files (30 episodes × 2-3 files each)

3. **Recent Episode Test**:
   ```bash
   # Get latest episode URL from feed
   curl -I "$(curl -s https://your-domain.vercel.app/podcast/feed.xml | grep -o 'https://[^"]*\.mp3' | head -1)"
   ```
   Should return `200 OK` or `206 Partial Content`.

## Daily Operations

### Normal Operation Flow

**12:00 UTC Daily**:
1. Vercel Cron triggers `POST /api/run`
2. Orchestrator starts 10-agent pipeline
3. Episode generated in ~2-5 minutes
4. MP3 and feed.xml published to storage
5. RSS feed updated automatically

### Monitoring

**View Latest Logs**:
```bash
vercel logs --follow
```

**Check Specific Function**:
```bash
vercel logs api/run
```

**Filter for Errors**:
```bash
vercel logs | grep ERROR
```

### Key Metrics to Monitor

| Metric | Healthy Range | Alert If |
|--------|---------------|----------|
| Total pipeline time | 120-300 seconds | > 300s |
| Episode duration | 780-960 seconds | < 600s or > 1200s |
| Word count | 2,100-2,500 | < 1,800 or > 2,800 |
| Stories ingested | 30-100 | < 10 |
| Stories ranked | 8-12 | < 5 |
| TTS segments | 10-20 | > 30 (too fragmented) |
| OpenAI API errors | 0 | > 0 |

## Incident Response

### Issue: No Episode Generated

**Symptoms**:
- No new episode in feed
- Health check shows old `last_run` date

**Investigation**:
1. Check cron is enabled:
   ```bash
   vercel crons ls
   ```
   Should show: `0 12 * * * → POST /api/run`

2. Check recent invocations:
   ```bash
   vercel logs api/run --since 24h
   ```

3. Look for errors:
   - "No stories found" → RSS feeds unreachable
   - "OpenAI API error" → Check API key/quota
   - "Storage error" → Check Blob storage

**Resolution**:
- If cron disabled: Re-enable in Vercel dashboard
- If API key issue: Verify `OPENAI_API_KEY` in settings
- If storage issue: Check Blob storage is provisioned
- Manual trigger: `curl -X POST https://your-domain.vercel.app/api/run`

### Issue: Poor Episode Quality

**Symptoms**:
- Irrelevant stories selected
- Awkward script flow
- Audio artifacts

**Investigation**:
1. Review manifest:
   ```bash
   curl https://your-domain.vercel.app/api/podcast/feed.xml
   # Get latest episode date
   # Then fetch manifest:
   # https://storage.vercel-blob.com/.../episodes/YYYY-MM-DD_manifest.json
   ```

2. Check story picks and scores
3. Review agent logs for warnings

**Resolution**:

**For irrelevant stories**:
- Adjust `TOPIC_WEIGHTS` to prioritize better topics
- Check RSS feeds are working: manually visit them
- Increase `WINDOW_HOURS` if insufficient recent news

**For script issues**:
- Review fact-check and safety agent logs
- Check if multiple stories were flagged/removed
- Consider adjusting scriptwriter temperature

**For audio issues**:
- OpenAI TTS is deterministic; re-run usually fixes
- Check segment lengths (should be < 4000 chars)
- Verify no special characters causing TTS issues

### Issue: Slow Pipeline

**Symptoms**:
- Pipeline takes > 5 minutes
- Timeout errors

**Investigation**:
```bash
# Check agent timing breakdown in response
curl -X POST https://your-domain.vercel.app/api/run | jq '.metrics.agent_times'
```

**Common Bottlenecks**:
- **Ingestion**: Many slow RSS feeds
- **TTS**: Many segments or API slowness
- **Embeddings**: Many stories to embed

**Resolution**:
- Remove slow/unreliable RSS feeds
- Reduce `WINDOW_HOURS` to limit stories
- Consider caching embeddings for topics
- Increase Vercel function timeout (already at 300s)

### Issue: Storage Full

**Symptoms**:
- "Storage quota exceeded" errors
- Upload failures

**Resolution**:
1. List all episodes:
   ```bash
   vercel blob ls episodes/
   ```

2. Delete old episodes:
   ```bash
   # Delete episodes older than 60 days
   vercel blob ls episodes/ | grep "2023-" | awk '{print $1}' | xargs -I {} vercel blob rm {}
   ```

3. Feed automatically shows only last 30 episodes

## Performance Tuning

### Optimize for Speed

**Reduce ingestion time**:
- Limit RSS feeds to most reliable sources
- Decrease `WINDOW_HOURS` to 24

**Reduce TTS time**:
- Use `tts-1` instead of `tts-1-hd` (faster, slightly lower quality)
- Reduce target word count to 2,000

**Reduce cost**:
- Use `gpt-3.5-turbo` for non-critical agents (outline, TTS director)
- Cache topic embeddings
- Reduce story target count to 8

### Optimize for Quality

**Better story selection**:
- Increase `WINDOW_HOURS` to 48 for more options
- Adjust topic weights based on listener feedback
- Add more authoritative RSS sources

**Better script**:
- Increase scriptwriter max_tokens for longer elaboration
- Add custom pronunciation glossary in memory agent
- Fine-tune safety agent temperature

## Backup and Recovery

### Backup Strategy

**Automated** (handled by storage):
- Episodes and manifests stored durably
- Feed.xml regenerated from manifests
- No database to back up

**Manual Backup** (optional):
```bash
# Download all episodes
mkdir backup
vercel blob ls episodes/ | awk '{print $1}' | xargs -I {} vercel blob download {} --output backup/{}
```

### Recovery Scenarios

**Lost all episodes**:
1. Episodes in Vercel Blob are durable
2. If deleted, regenerate from dates:
   ```bash
   for date in 2024-01-{01..31}; do
     curl -X POST "https://your-domain.vercel.app/api/run?date=$date"
   done
   ```

**Corrupted feed.xml**:
- Feed regenerates automatically on next episode
- Or manually trigger: `curl -X POST https://your-domain.vercel.app/api/run?force=true`

**Lost configuration**:
- All config in `.env` / Vercel environment variables
- Document your custom settings separately

## Scaling Guidelines

### Single Listener (Current)

- Current architecture: ✅ Optimal
- Cost: ~$15-30/month
- Maintenance: Minimal

### Multiple Listeners (10-100)

**Changes needed**:
1. Add listener profiles to memory agent
2. Generate multiple episodes per day (different topics per listener)
3. Use separate feed URLs: `/podcast/feed-{listener_id}.xml`
4. Consider parallel episode generation

**Estimated cost**: $50-200/month

### Enterprise Scale (1000+ listeners)

**Architecture changes**:
1. Move from Vercel Blob to dedicated S3/R2
2. Use CDN for MP3 delivery (CloudFlare, AWS CloudFront)
3. Implement job queue (BullMQ, Inngest) for parallel generation
4. Cache embeddings in Redis
5. Consider dedicated hosting (not serverless)

**Estimated cost**: $500-2000/month

## Alerts and Notifications

### Recommended Alerts

**Critical** (immediate):
- Episode generation failed 2 days in a row
- Storage quota > 90%
- OpenAI API errors > 5 in 1 hour

**Warning** (within 24 hours):
- Episode duration < 10 minutes
- < 5 stories selected
- Pipeline time > 5 minutes
- Safety agent risk level = 'high'

### Setting Up Alerts

**Option 1: Vercel Log Drains**
1. Go to Project Settings → Observability → Log Drains
2. Add drain to Datadog, LogDNA, or custom webhook

**Option 2: External Monitoring**
```bash
# Use uptime monitoring service (UptimeRobot, Pingdom)
# Monitor: https://your-domain.vercel.app/api/health
# Alert if status != "healthy"
```

**Option 3: Custom Script**
```bash
# Add to cron (separate server):
#!/bin/bash
HEALTH=$(curl -s https://your-domain.vercel.app/api/health | jq -r .status)
if [ "$HEALTH" != "healthy" ]; then
  # Send alert (email, Slack, PagerDuty)
  curl -X POST https://hooks.slack.com/... -d "{\"text\":\"Podcast health check failed!\"}"
fi
```

## Maintenance Schedule

### Daily
- Automatic health check (via monitoring)

### Weekly
- Review logs for warnings
- Check feed validity
- Verify latest episode

### Monthly
- Review OpenAI API usage/costs
- Check storage usage trends
- Update dependencies: `npm update`
- Review and adjust topic weights based on trends

### Quarterly
- Full test of backup/recovery
- Review and optimize agent performance
- Update RSS feed sources
- Security audit of dependencies: `npm audit`

## Useful Commands

```bash
# Quick health check
curl https://your-domain.vercel.app/api/health | jq '.status'

# Trigger manual run
curl -X POST https://your-domain.vercel.app/api/run

# Regenerate today's episode
curl -X POST "https://your-domain.vercel.app/api/run?force=true"

# Check feed
curl https://your-domain.vercel.app/podcast/feed.xml | head -50

# List episodes
vercel blob ls episodes/

# View recent logs
vercel logs --since 24h

# Deploy changes
vercel --prod

# Check environment variables
vercel env ls
```

## Contact and Escalation

**System Owner**: [Your Name]  
**Email**: [Your Email]  
**On-Call**: [Phone/Slack]

**Escalation Path**:
1. Check this runbook
2. Review logs in Vercel dashboard
3. Check OpenAI status: https://status.openai.com
4. Contact system owner

---

*Last updated: 2024-01-15*


