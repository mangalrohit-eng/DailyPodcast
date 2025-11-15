# 🚀 Quick Start Guide

Get your personalized daily news podcast running in **5 minutes**!

## What You're Building

A fully automated system that:
- 📰 Fetches news from 10+ sources daily
- 🤖 Uses AI to select, script, and narrate stories
- 🎙️ Generates professional 15-minute audio episodes
- 📱 Publishes to a podcast RSS feed
- ⏰ Runs automatically every day at 12:00 UTC (7 AM ET)

**Your topics**: AI, Verizon, Accenture (customizable)

## Prerequisites

- ✅ OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- ✅ Vercel account ([sign up free](https://vercel.com/signup))
- ✅ 5 minutes of time

## Step 1: Get OpenAI API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the key (starts with `sk-`)
4. Add $5-10 to your OpenAI account balance

## Step 2: Deploy to Vercel

### Option A: Deploy Button (Easiest)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Click the button above
2. Connect your GitHub account
3. Deploy the project

### Option B: Command Line

```bash
# Install Vercel CLI
npm i -g vercel

# Clone and deploy
git clone <your-repo-url>
cd daily-personal-news-podcast
vercel
```

## Step 3: Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

### Add These Variables:

```env
# Required
OPENAI_API_KEY=sk-your-key-here
PODCAST_BASE_URL=https://your-project-name.vercel.app

# Optional (customize)
PODCAST_TITLE=Rohit's Daily AI & Corporate News Brief
PODCAST_AUTHOR=Rohit
PODCAST_EMAIL=your-email@example.com
TOPIC_WEIGHTS=ai:0.5,vz:0.3,acn:0.2
```

**Important**: Set these for **Production, Preview, and Development** environments.

## Step 4: Enable Vercel Blob Storage

1. In Vercel Dashboard, go to your project
2. Click **Storage** tab
3. Click **Create Database**
4. Select **Blob**
5. Click **Create**

✅ This automatically sets `BLOB_READ_WRITE_TOKEN`

## Step 5: Verify Cron Job

1. Go to Settings → Cron Jobs
2. Verify you see:
   ```
   Path: /api/run
   Schedule: 0 12 * * * (Every day at 12:00 UTC)
   ```

## Step 6: Generate First Episode

Trigger manually to test:

```bash
curl -X POST https://your-project-name.vercel.app/api/run
```

**Wait 2-5 minutes**. You should see:
```json
{
  "success": true,
  "episode": {
    "date": "2024-01-15",
    "url": "https://...",
    "duration_sec": 892
  }
}
```

## Step 7: Subscribe to Your Podcast

**Your feed URL**: `https://your-project-name.vercel.app/podcast/feed.xml`

### In Apple Podcasts:
1. File → Library → Follow a Show by URL
2. Paste your feed URL
3. Click Subscribe

### In Overcast:
1. Tap **+** → Add URL
2. Paste your feed URL

### In Pocket Casts:
1. Settings → Import
2. Enter feed URL

### In Spotify:
Note: Spotify doesn't support private RSS feeds directly. Use Apple Podcasts or other apps.

## Step 8: Test It!

✅ Check health:
```bash
curl https://your-project-name.vercel.app/api/health
```

✅ View feed:
```bash
curl https://your-project-name.vercel.app/podcast/feed.xml
```

✅ Play episode in your podcast app

## 🎉 You're Done!

Your podcast will automatically generate every day at 12:00 UTC (7 AM Eastern Time).

## What Happens Next?

### Daily Automated Flow:
1. **12:00 UTC**: Vercel Cron triggers generation
2. **2-5 minutes later**: New episode published
3. **Podcast app**: Auto-downloads new episode

### Your First Week:
- **Day 1**: Listen to first episode, note quality
- **Day 2-3**: Verify automated generation works
- **Day 4-7**: Adjust topic weights if needed

### Customize (Optional):

**Change topic weights** (more AI, less Verizon):
```env
TOPIC_WEIGHTS=ai:0.6,vz:0.2,acn:0.2
```

**Change schedule** (edit `vercel.json`):
```json
"schedule": "0 7 * * *"  # 7:00 AM UTC = 2 AM ET
```

**Add topics** (edit `lib/config.ts`):
```typescript
{
  name: 'Tesla',
  weight: 0.15,
  sources: ['https://www.tesla.com/blog/rss'],
  keywords: ['Tesla', 'EV'],
}
```

## Common Issues

### "Episode not found"
- **Cause**: First run not complete yet
- **Fix**: Wait 5 minutes, check `/api/health`

### "OpenAI API error"
- **Cause**: Invalid key or no credits
- **Fix**: Check key at platform.openai.com, add credits

### "Storage error"
- **Cause**: Vercel Blob not created
- **Fix**: Create Blob storage in Vercel dashboard

### Cron not running
- **Cause**: Not on Pro plan (Hobby has limits)
- **Fix**: Upgrade to Pro ($20/month) or trigger manually

## Cost Breakdown

| Service | Cost | Notes |
|---------|------|-------|
| OpenAI API | ~$0.50-1.00/episode | ~$15-30/month for daily |
| Vercel | Free | Hobby tier sufficient |
| Storage | Free | < 1 GB for 30 episodes |
| **Total** | **~$15-30/month** | |

## Need Help?

### Check These First:
1. **Logs**: Vercel Dashboard → Functions → Logs
2. **Health**: `curl https://your-project.vercel.app/api/health`
3. **Documentation**: See README.md, RUNBOOK.md, DEPLOYMENT.md

### Still Stuck?
- Review DEPLOYMENT.md for detailed troubleshooting
- Check OpenAI status: status.openai.com
- Check Vercel status: vercel-status.com

## Advanced Usage

### Regenerate an episode:
```bash
curl -X POST "https://your-project-name.vercel.app/api/run?force=true"
```

### Generate historical episode:
```bash
curl -X POST "https://your-project-name.vercel.app/api/run?date=2024-01-10"
```

### Monitor logs:
```bash
vercel logs --follow
```

### List episodes:
```bash
vercel blob ls episodes/
```

## What You Get

Every morning at 12:00 UTC:
- ✅ 15-minute audio episode
- ✅ 8-12 curated stories
- ✅ AI, Verizon, and Accenture coverage
- ✅ Conversational narration with OpenAI voices
- ✅ Full citations and sources
- ✅ Professional production quality

## Architecture Overview

```
RSS Feeds → Ingestion → Ranking → Outline → Script 
→ Fact-Check → Safety → TTS → Audio → Publish → RSS Feed
```

**10 AI agents** working together to create your daily brief!

## Next Steps

1. ✅ Listen to your first episode
2. ✅ Set up monitoring (optional but recommended)
3. ✅ Customize topic weights based on preference
4. ✅ Share your feed URL (if desired)
5. ✅ Relax and enjoy automated daily news!

## Resources

- **Full README**: [README.md](README.md)
- **Deployment Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Operations Manual**: [RUNBOOK.md](RUNBOOK.md)
- **Architecture Details**: [ARCHITECTURE.md](ARCHITECTURE.md)

---

**🎧 Enjoy your personalized daily news podcast!**

Built with ❤️ using OpenAI, TypeScript, and Vercel.




