# Source Tier Filtering

## Overview

Your podcast now filters out **Tier 3** (medium authority) and **Tier 5** (unknown) sources **before** the ranking stage. Only high-quality sources make it into your episodes.

---

## What's Filtered

### ❌ **Filtered Out (Tier 3)**
*Industry publications & regional news*

- Axios, Politico, The Hill
- Regional papers (LA Times, Chicago Tribune, etc.)
- Industry trades (Industry Week, Manufacturing.net)
- Press release services (PR Newswire, Business Wire, GlobeNewswire)

### ❌ **Filtered Out (Tier 5)**
*Unknown/unclassified sources*

- Blogs and personal sites
- Unknown news outlets
- Any source not explicitly in Tier 1, 2, or 4

---

## What's Allowed

### ✅ **Tier 1: Highest Authority (Allowed)**
*Major news organizations & wire services*

- **Wire Services**: Reuters, Bloomberg, AP News
- **Prestige Press**: WSJ, NYT, Washington Post, Financial Times, The Economist
- **Major Broadcasters**: BBC, CNN, CNBC, ABC, CBS, NBC, NPR, PBS
- **Quality Print**: The Guardian, USA Today

### ✅ **Tier 2: High Authority (Allowed)**
*Tech publications & business news*

- **Tech**: TechCrunch, The Verge, Wired, Ars Technica, VentureBeat, CNET, Engadget
- **Business**: Forbes, Fortune, Business Insider, MarketWatch, Seeking Alpha, Barron's, Yahoo Finance

### ✅ **Tier 4: Corporate Sources (Allowed)**
*Official company announcements*

- **Tech Giants**: Microsoft, Google, Meta, Apple, Amazon
- **AI Companies**: OpenAI, Anthropic, NVIDIA, Intel, AMD
- **Enterprise**: IBM, Oracle, Salesforce, SAP
- **Telecom/Consulting**: Verizon, Accenture, T-Mobile, AT&T

**Note**: Google News aggregator is treated as Tier 4 (allowed)

---

## How It Works

### Filter Location

The filtering happens in the **Ingestion Agent** at line ~177:

```typescript
// Filter by source tier - only allow Tier 1, 2, and 4
const sourceTier = this.getSourceTier(story.domain);
if (sourceTier === 3 || sourceTier === 5) {
  const tierName = sourceTier === 3 ? 'Tier 3 (Medium Authority)' : 'Tier 5 (Unknown Source)';
  const reason = `Source filtered out: ${tierName} - ${story.domain}`;
  // Story is rejected and logged
  continue;
}
```

### Filter Order

Stories go through multiple filters in this order:

1. **Age Check** - Must be within time window (e.g., 72 hours)
2. **Quality Check** - Must have sufficient content length
3. **🆕 Tier Check** - Must be Tier 1, 2, or 4 (NOT 3 or 5)
4. **Keyword Match** - Must match topic keywords
5. **Deduplication** - Limit stories per domain/topic

### Impact on Pipeline

**Before Filtering:**
```
100 stories ingested from all sources
  ↓
60 stories pass age/quality filters
  ↓
[OLD] All 60 go to ranking
```

**After Filtering:**
```
100 stories ingested from all sources
  ↓
60 stories pass age/quality filters
  ↓
[NEW] Tier filter removes Tier 3 & 5
  ↓
45 stories (only Tier 1, 2, 4) go to ranking
```

---

## Visibility

### Pipeline Report

Filtered stories are tracked in the pipeline report:

```json
{
  "ingestion": {
    "filtered_out": [
      {
        "title": "Tech Industry Analysis",
        "reason": "Source filtered out: Tier 3 (Medium Authority) - axios.com"
      },
      {
        "title": "Unknown Blog Post",
        "reason": "Source filtered out: Tier 5 (Unknown Source) - techblog.example.com"
      }
    ]
  }
}
```

### Logging

Each filtered story is logged:

```
Story filtered by tier: Tech Industry Analysis... (Tier 3 (Medium Authority): axios.com)
Story filtered by tier: Unknown Blog Post... (Tier 5 (Unknown Source): techblog.example.com)
```

---

## Why This Matters

### Quality Control
- **Higher Standards**: Only established, reputable sources
- **Consistency**: Predictable quality across episodes
- **Trust**: Your audience knows they're getting reliable information

### Efficiency
- **Faster Ranking**: Fewer stories to score and rank
- **Lower Costs**: Fewer embeddings to compute
- **Better Selection**: More "slots" available for high-quality stories

### Example Impact

**Before Tier Filtering:**
- 60 stories ranked
- Mix of quality (Tiers 1-5)
- Top 5 selected might include Tier 3 stories

**After Tier Filtering:**
- 45 stories ranked (only Tiers 1, 2, 4)
- Consistent high quality
- Top 5 selected are always from reputable sources

---

## Special Cases

### Google News

Google News aggregator URLs are treated as **Tier 4** (allowed):
```typescript
// Google News aggregator
if (domainLower.includes('news.google.com')) return 4; // Allow Google News
```

**Why?** Google News curates from many sources, and we extract the actual domain from the redirect URL. If extraction fails and we see `news.google.com`, we still allow it.

### Custom RSS Feeds

If you add a custom RSS feed in the dashboard:
- **If it's from a Tier 1, 2, or 4 domain**: Stories are allowed ✅
- **If it's from a Tier 3 or 5 domain**: Stories are filtered out ❌

**Solution**: To use a custom source not in the tier lists:
1. Edit `lib/agents/ingestion.ts`
2. Add the domain to `tier1`, `tier2`, or `tier4` array
3. Commit and deploy

---

## Customization

### To Allow More Sources

Add domains to the appropriate tier in `getSourceTier()` method:

```typescript
// TIER 2: Add a new tech publication
const tier2 = [
  'techcrunch.com', 'theverge.com', 'wired.com',
  'yournewsource.com', // ← Add here
];
```

### To Change Filter Rules

Modify the filter condition (line ~179):

```typescript
// Current: Block Tier 3 and 5
if (sourceTier === 3 || sourceTier === 5) {
  // filtered out
}

// Alternative: Only allow Tier 1
if (sourceTier !== 1) {
  // Only Tier 1 allowed
}

// Alternative: Allow all except Tier 5
if (sourceTier === 5) {
  // Only block unknown sources
}
```

### To Disable Filtering

Comment out or remove the tier filter:

```typescript
// Filter by source tier - only allow Tier 1, 2, and 4
const sourceTier = this.getSourceTier(story.domain);
if (sourceTier === 3 || sourceTier === 5) {
  // ... filtering logic
  continue; // ← Comment out this block to disable
}
```

---

## Testing

### Verify Filtering Works

1. **Generate an episode**:
   ```bash
   npm run dev
   # Then trigger episode generation
   ```

2. **Check pipeline report** in the dashboard:
   - Go to episode details
   - Look at "Ingestion" tab
   - Check "filtered_out" list
   - Should see Tier 3 and Tier 5 rejections

3. **Check final story sources**:
   - All stories should be from Tier 1, 2, or 4
   - No Axios, Politico, or unknown blogs

---

## Files Modified

### `lib/agents/ingestion.ts`

**Added:**
- `getSourceTier()` method (lines 470-519)
  - Checks domain against tier lists
  - Returns tier number (1-5)

**Modified:**
- Story filtering logic (lines 177-194)
  - Added tier check after quality filter
  - Rejects Tier 3 and Tier 5 stories
  - Logs rejection reason

---

## Migration Notes

### Backward Compatibility

- ✅ **Old episodes unchanged**: Filter only affects new episodes
- ✅ **Existing tier logic preserved**: Ranking agent still has tier scoring
- ✅ **Dashboard unchanged**: No UI changes needed

### Expected Changes

After deploying this update:

1. **Fewer stories ingested**: ~25-40% reduction (varies by topics)
2. **Higher quality episodes**: All stories from reputable sources
3. **More consistent results**: Less variation in source quality
4. **Clearer pipeline reports**: See exactly why stories were filtered

---

## Related Documentation

- **Tier System Details**: See section "News Source Tier System" in chat history
- **Ranking Logic**: `lib/agents/ranking.ts` (authority scoring still applies)
- **Architecture**: `ARCHITECTURE.md` (ingestion agent overview)

---

## Summary

**What Changed:**
- ✅ Added tier checking to ingestion agent
- ✅ Filtered out Tier 3 (medium authority) sources
- ✅ Filtered out Tier 5 (unknown) sources
- ✅ Kept Tier 1, 2, and 4 sources only

**Result:**
- 🎯 Higher quality episodes
- ⚡ Faster processing
- 💰 Lower API costs
- 📊 Better reporting

**Action Required:**
- None! Deploy and it works automatically
- Monitor first episode to verify filtering works as expected

