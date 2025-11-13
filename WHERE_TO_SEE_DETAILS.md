# Where to See Detailed Episode Generation Logs

## Option 1: Vercel Runtime Logs (Real-Time) ⭐ BEST FOR NOW

### How to Access:
1. Go to: https://vercel.com/
2. Click your project: **daily-podcast-brown**
3. Click **"Runtime Logs"** tab (top navigation)
4. Click "Run Now" in your dashboard
5. Watch logs stream in real-time

### What You'll See:

**Ingestion Details:**
```
✓ Story accepted for AI: OpenAI announces GPT-5 with groundbreaking...
✓ Story accepted for Verizon: Verizon expands 5G network to rural...
✗ Story failed quality filter: Short news snippet...
✗ Story doesn't match topic keywords: Generic tech article...
AI - Source processed: 25 stories, 18 accepted so far
Verizon - Source processed: 10 stories, 3 accepted so far
```

**Ranking Details:**
```
🎯 Passing weights to ranking agent
{ 
  weights: { verizon: 0.5, accenture: 0.3, ai: 0.1 },
  story_count_by_topic: { AI: 45, Verizon: 8, Accenture: 5 }
}
Ranking stories: 58 stories, target: 5 picks
```

**Outline Details:**
```
Creating outline: 5 picks, 900 seconds target
Topic distribution: { AI: 1, Verizon: 2, Accenture: 2 }
```

---

## Option 2: Dashboard Progress Modal (During Generation)

### How to Access:
1. Go to your dashboard
2. Click "Run Now"
3. **Don't close the modal!**
4. Click "View Details" on each phase

### What You'll See:

**Ingestion Phase:**
- Top 20 stories found
- By topic (AI, Verizon, Accenture)
- Source URLs

**Ranking Phase:**
- Selected stories with scores
- Why each was selected
- Rejected stories with reasons

**Outline Phase:**
- Story sections planned
- Duration targets

---

## Option 3: Episode Manifest (After Generation)

### How to Access:

#### Via API (Manual):
```bash
# Get list of runs
curl https://daily-podcast-brown.vercel.app/api/runs \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific run details
curl https://daily-podcast-brown.vercel.app/api/runs?runId=2025-11-13_1731522800123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Via S3 Directly:
1. Go to your S3 bucket
2. Navigate to: `episodes/2025-11-13_1731522800123_manifest.json`
3. Download and view

### What's in the Manifest:

```json
{
  "date": "2025-11-13",
  "mp3_url": "...",
  "picks": [
    {
      "story_id": "...",
      "topic": "Verizon",
      "score": 0.847,
      "story": {
        "title": "Verizon announces...",
        "summary": "Full summary...",
        "source": "https://..."
      }
    }
  ],
  "pipeline_report": {
    "ingestion": {
      "sources_scanned": [
        {
          "name": "Verizon RSS",
          "url": "https://verizon.com/rss",
          "items_found": 12,
          "status": "success"
        }
      ],
      "total_items_before_filter": 85,
      "filtered_out": [
        {
          "title": "Story title",
          "reason": "Too old (2025-11-10)"
        }
      ],
      "topics_breakdown": {
        "AI": 45,
        "Verizon": 8,
        "Accenture": 5
      }
    },
    "ranking": {
      "stories_ranked": 58,
      "top_picks": [
        {
          "title": "Story title",
          "topic": "Verizon",
          "score": 0.847,
          "why_selected": "Top Verizon story - guaranteed coverage"
        }
      ],
      "rejected_stories": [
        {
          "title": "Story title",
          "score": 0.412,
          "reason": "Score below threshold"
        }
      ]
    },
    "scriptwriting": {
      "sections_generated": 5,
      "total_word_count": 687,
      "full_script_text": "...",
      "citations_used": [1, 2, 3, 4, 5]
    }
  }
}
```

---

## Option 4: Dashboard Pipeline Report Tab (COMING SOON)

**Status:** Planned but not yet implemented

Will add a new tab to the run details modal showing:
- ✅ Sources scanned with success/fail status
- ✅ Stories filtered with reasons (too old, no keywords, etc.)
- ✅ Topic breakdown before/after filtering
- ✅ Selected stories with scores and rationale
- ✅ Rejected stories with reasons
- ✅ Full script text
- ✅ Fact-check changes
- ✅ Safety edits

---

## Quick Command to See Last Episode Details

### Using `curl`:
```bash
# Get latest run
curl "https://daily-podcast-brown.vercel.app/api/runs" \
  -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  | jq '.[0]'

# Get full manifest
curl "https://daily-podcast-brown.vercel.app/api/runs?runId=LATEST_RUN_ID" \
  -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  | jq '.manifest.pipeline_report'
```

### Using Browser:
1. Open: https://daily-podcast-brown.vercel.app/api/runs
2. Login with your dashboard credentials
3. Click on a run's manifest link
4. View JSON in browser

---

## What to Look For

### To Debug "All AI Stories":

**Check Ingestion:**
```
topics_breakdown: {
  "AI": 45,      ← Lots of AI stories
  "Verizon": 3,  ← Very few Verizon! Why?
  "Accenture": 2 ← Very few Accenture! Why?
}
```

**Check Sources:**
```
sources_scanned: [
  {
    "name": "Verizon RSS",
    "items_found": 12,
    "status": "success"  ← Good, found some
  },
  {
    "name": "Google News - Verizon",
    "items_found": 0,     ← Problem! No results
    "status": "success"
  }
]
```

**Check Filtered:**
```
filtered_out: [
  {
    "title": "Verizon Q3 Earnings",
    "reason": "No keyword match for Verizon"  ← Keyword issue!
  }
]
```

---

## Recommendations

**For Real-Time Debugging:**
→ Use **Vercel Runtime Logs** (Option 1)

**For Detailed Analysis:**
→ Download **Episode Manifest** from S3 (Option 3)

**For Quick Review:**
→ Use **Dashboard Progress Modal** "View Details" (Option 2)

**For Best Experience (Future):**
→ Wait for **Pipeline Report Tab** (Option 4) - Coming soon!

---

## Next Steps

I can implement Option 4 (Pipeline Report Tab in dashboard) to make this much easier. Would you like me to:

1. **Add a "Pipeline Report" tab** to the run details modal?
2. **Keep using Vercel logs for now** (quick to access)?
3. **Both** - implement UI but logs are still useful for real-time?

Let me know and I can build the UI tab! 🎯

