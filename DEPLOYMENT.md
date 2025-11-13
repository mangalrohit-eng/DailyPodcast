# Deployment Guide

Complete guide for deploying the Daily Personal News Podcast to Vercel.

## Prerequisites

Before deploying, ensure you have:

- ✅ Vercel account (free tier works)
- ✅ OpenAI API key with credits
- ✅ Node.js 18+ installed locally
- ✅ Git repository (GitHub, GitLab, or Bitbucket)

## Step-by-Step Deployment

### 1. Prepare Your Repository

```bash
# Clone the project
git clone <your-repo-url>
cd daily-personal-news-podcast

# Install dependencies
npm install

# Verify everything builds
npm run build
```

### 2. Create Vercel Project

**Option A: Vercel Dashboard** (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. Configure:
   - **Framework Preset**: Other
   - **Build Command**: `npm run build`
   - **Output Directory**: (leave empty)
   - **Install Command**: `npm install`

**Option B: Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel
```

### 3. Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables, add:

#### Required Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `OPENAI_API_KEY` | `sk-...` | From platform.openai.com |
| `PODCAST_BASE_URL` | `https://your-project.vercel.app` | Your Vercel URL |

#### Optional Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `PODCAST_TITLE` | `Rohit's Daily AI & Corporate News Brief` | Customize |
| `PODCAST_AUTHOR` | `Rohit` | Your name |
| `PODCAST_EMAIL` | `your-email@example.com` | Contact email |
| `TOPIC_WEIGHTS` | `ai:0.5,vz:0.3,acn:0.2` | Adjust as needed |
| `TIMEZONE` | `America/New_York` | Your timezone |

### 4. Enable Vercel Blob Storage

1. In Vercel Dashboard, go to your project
2. Navigate to **Storage** tab
3. Click **Create Database**
4. Select **Blob**
5. Choose a region close to you
6. Click **Create**

Vercel automatically sets `BLOB_READ_WRITE_TOKEN` environment variable.

### 5. Verify Cron Configuration

1. Go to Settings → Cron Jobs
2. Verify `vercel.json` cron configuration is detected:
   ```
   Path: /api/run
   Schedule: 0 12 * * * (Daily at 12:00 UTC)
   ```

If not detected:
- Ensure `vercel.json` is in repository root
- Redeploy: `vercel --prod`

### 6. Deploy to Production

```bash
vercel --prod
```

Or use the Vercel Dashboard → Deployments → Promote to Production

### 7. First Run and Verification

#### Trigger First Episode

```bash
curl -X POST https://your-project.vercel.app/api/run
```

**Expected**: Takes 2-5 minutes, returns:
```json
{
  "success": true,
  "episode": {
    "date": "2024-01-15",
    "url": "https://...",
    "duration_sec": 892,
    "word_count": 2247
  }
}
```

#### Check Health

```bash
curl https://your-project.vercel.app/api/health | jq .
```

Should return `"status": "healthy"`.

#### Access Podcast Feed

```bash
curl https://your-project.vercel.app/podcast/feed.xml
```

Should return valid RSS XML.

#### Test in Podcast App

1. Open your podcast app (Apple Podcasts, Overcast, Pocket Casts, etc.)
2. Add podcast by URL: `https://your-project.vercel.app/podcast/feed.xml`
3. Verify episode appears and plays

### 8. Set Up Monitoring (Optional but Recommended)

#### Option 1: Vercel Log Drains

1. Settings → Observability → Log Drains
2. Add integration (Datadog, New Relic, etc.)

#### Option 2: External Monitoring

Set up uptime monitoring for:
- Health endpoint: `https://your-project.vercel.app/api/health`
- Alert if status != 200 or `"status" != "healthy"`

Services:
- [UptimeRobot](https://uptimerobot.com) (Free)
- [Pingdom](https://www.pingdom.com)
- [Better Uptime](https://betteruptime.com)

## Advanced Configuration

### Custom Domain

1. Vercel Dashboard → Settings → Domains
2. Add your domain (e.g., `podcast.yourdomain.com`)
3. Follow DNS configuration instructions
4. Update `PODCAST_BASE_URL` to use custom domain

### S3-Compatible Storage (Alternative to Vercel Blob)

If you prefer S3, R2, or MinIO:

1. Set environment variables:
   ```
   STORAGE_BACKEND=s3
   S3_ENDPOINT=https://...
   S3_BUCKET=daily-podcast
   S3_ACCESS_KEY=...
   S3_SECRET_KEY=...
   S3_REGION=auto
   ```

2. Ensure bucket is publicly readable for MP3s and feed.xml

### Cron Secret (Security)

Add extra security to prevent unauthorized runs:

1. Generate a secret:
   ```bash
   openssl rand -base64 32
   ```

2. Add to Vercel environment variables:
   ```
   CRON_SECRET=<your-secret>
   ```

3. Update `vercel.json`:
   ```json
   {
     "crons": [
       {
         "path": "/api/run",
         "schedule": "0 12 * * *",
         "headers": {
           "x-vercel-cron-secret": "${CRON_SECRET}"
         }
       }
     ]
   }
   ```

## Troubleshooting Deployment

### Issue: Build Fails

**Error**: `Module not found` or `Cannot find package`

**Solution**:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Issue: Environment Variables Not Working

**Solution**:
1. Verify variables are set in Vercel Dashboard
2. Ensure no typos in variable names
3. Redeploy after adding variables
4. Check variable scope (Production, Preview, Development)

### Issue: Cron Not Triggering

**Solution**:
1. Verify cron in Settings → Cron Jobs
2. Check `vercel.json` syntax
3. Ensure project is on Pro plan (Hobby has cron limits)
4. Redeploy after changing `vercel.json`

### Issue: Storage Errors

**Solution**:
1. Verify Blob storage is created
2. Check `BLOB_READ_WRITE_TOKEN` is set
3. Test storage:
   ```bash
   vercel blob ls
   ```

### Issue: OpenAI API Errors

**Common causes**:
- Invalid API key
- Insufficient credits
- Rate limits exceeded

**Solution**:
1. Verify API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Check usage limits and billing
3. Add payment method if needed
4. Review rate limits: [platform.openai.com/account/rate-limits](https://platform.openai.com/account/rate-limits)

## Deployment Checklist

Before going live:

- [ ] All environment variables set
- [ ] Vercel Blob storage created
- [ ] OpenAI API key valid and funded
- [ ] First manual run successful
- [ ] Health check returns healthy
- [ ] Feed XML valid
- [ ] Episode playable in podcast app
- [ ] Cron job configured and scheduled
- [ ] Monitoring/alerts set up
- [ ] Custom domain configured (optional)
- [ ] Documentation reviewed

## Post-Deployment

### Day 1
- Monitor first automated cron run
- Verify episode generated successfully
- Check logs for any warnings

### Week 1
- Listen to 2-3 episodes for quality
- Adjust `TOPIC_WEIGHTS` if needed
- Fine-tune `WINDOW_HOURS` for better story freshness

### Month 1
- Review OpenAI costs
- Optimize agent performance if needed
- Consider adding more RSS sources
- Collect feedback and iterate

## Updating the Deployment

### Code Changes

```bash
# Make changes
git add .
git commit -m "Your changes"
git push origin main

# Vercel auto-deploys from Git
# Or manually:
vercel --prod
```

### Environment Variable Changes

1. Update in Vercel Dashboard → Settings → Environment Variables
2. Redeploy for changes to take effect

### Configuration Changes

Changes to `vercel.json` require redeployment:
```bash
vercel --prod
```

## Rollback

If a deployment has issues:

1. Go to Vercel Dashboard → Deployments
2. Find last stable deployment
3. Click **...** → **Promote to Production**

Or via CLI:
```bash
vercel rollback
```

## Cost Optimization

### Reduce OpenAI Costs

1. Use `gpt-3.5-turbo` for non-critical agents
2. Reduce target word count to 2,000
3. Decrease `WINDOW_HOURS` to limit stories
4. Cache topic embeddings

### Reduce Vercel Costs

- Free tier: 100 GB-hours/month (sufficient for daily podcast)
- Upgrade to Pro ($20/month) only if hitting limits

### Reduce Storage Costs

- Delete episodes older than 60 days
- Compress MP3s (lower bitrate)
- Use external CDN for serving MP3s

## Security Best Practices

1. ✅ Never commit `.env` to Git
2. ✅ Use environment variables for secrets
3. ✅ Set `CRON_SECRET` to prevent unauthorized runs
4. ✅ Regularly update dependencies: `npm update`
5. ✅ Run security audit: `npm audit`
6. ✅ Use Vercel's built-in DDoS protection
7. ✅ Review Vercel access logs regularly

## Support

**Issues during deployment?**

1. Check this guide thoroughly
2. Review [Vercel Documentation](https://vercel.com/docs)
3. Check [OpenAI API Status](https://status.openai.com)
4. Review project logs in Vercel Dashboard
5. Open an issue on GitHub

---

**Congratulations!** 🎉 Your podcast system is now live and will automatically generate episodes daily.

Next steps:
- Subscribe to your feed in a podcast app
- Share the feed URL with others (if desired)
- Monitor the first few automated runs
- Customize and iterate based on feedback

