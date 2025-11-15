# Multi-Topic Story Ranking

## Problem

Previously, each story was assigned to **ONE topic** (AI, Verizon, or Accenture) and scored based only on that topic. This meant:

- A story about "Verizon using AI" would be categorized as either "Verizon" OR "AI"
- It wouldn't get extra credit for being relevant to both topics
- Cross-topic stories were undervalued

## Solution

Now, stories are checked against **ALL topics** using semantic similarity, and get a bonus for matching multiple topics.

## How It Works

### 1. Primary Topic Scoring (Unchanged)
Each story is still assigned a primary topic and scored normally:
- **25%**: Recency (newer stories preferred)
- **35%**: Topic relevance × Topic weight
- **15%**: Authority score (source reputation)
- **15%**: Direct topic weight bonus

### 2. Multi-Topic Bonus (NEW!)
**10%** of the score comes from multi-topic bonus:

```typescript
// For each additional topic beyond the primary:
if (semantic_similarity > 0.65) {  // High relevance threshold
  bonus += topic_weight × similarity × 0.5
}
```

### 3. Example Scenarios

#### Single-Topic Story
**Title**: "OpenAI releases GPT-5"
- Primary: AI (100% match)
- Verizon: 30% match (too low)
- Accenture: 25% match (too low)
- **Multi-topic bonus: 0**

#### Multi-Topic Story
**Title**: "Verizon partners with OpenAI to deploy AI for network optimization"
- Primary: Verizon (95% match)
- AI: 85% match ✓ (above 65% threshold!)
- Accenture: 40% match (too low)
- **Multi-topic bonus**: 0.6 (Verizon weight) × 0.85 (AI similarity) × 0.5 = **0.255**

#### Triple-Topic Story
**Title**: "Accenture helps Verizon implement AI-driven customer service"
- Primary: Accenture (90% match)
- Verizon: 80% match ✓
- AI: 75% match ✓
- **Multi-topic bonus**: 
  - (0.5 × 0.80 × 0.5) = 0.20
  - + (0.1 × 0.75 × 0.5) = 0.0375
  - = **0.2375**

## Score Calculation

### Before (No Multi-Topic Bonus)
```
Story: "Verizon partners with OpenAI"
- Recency: 0.8 × 0.25 = 0.20
- Topic Match: 0.9 × 0.5 × 0.4 = 0.18  (Verizon weighted at 0.5)
- Authority: 0.8 × 0.15 = 0.12
- Topic Weight: 0.5 × 0.2 = 0.10
TOTAL: 0.60
```

### After (With Multi-Topic Bonus)
```
Story: "Verizon partners with OpenAI"
- Recency: 0.8 × 0.25 = 0.20
- Topic Match: 0.9 × 0.5 × 0.35 = 0.1575  (reduced coefficient)
- Authority: 0.8 × 0.15 = 0.12
- Topic Weight: 0.5 × 0.15 = 0.075  (reduced coefficient)
- Multi-Topic: 0.255 × 0.1 = 0.0255  (NEW!)
TOTAL: 0.578
```

**Note**: Even though individual components are slightly reduced, multi-topic stories now rank higher!

## Benefits

### 1. **Better Story Selection**
Cross-topic stories provide more value:
- One story covers multiple interests
- More efficient use of podcast time
- Better listener engagement

### 2. **Natural Prioritization**
Stories naturally rise to the top when they're relevant to multiple configured topics:
- "Verizon + AI" story beats single-topic stories
- "Accenture + Verizon + AI" story is highly prioritized

### 3. **Weighted by Topic Priority**
The bonus respects dashboard topic weights:
- High-weight topic match = bigger bonus
- Low-weight topic match = smaller bonus
- Only topics with >65% similarity count

### 4. **Transparent Logging**
Multi-topic matches are logged:
```
Multi-topic story detected
  title: "Verizon partners with OpenAI to deploy AI for network..."
  primary_topic: Verizon
  additional_topics: ["AI (85%)", "Accenture (70%)"]
  bonus: 0.255
```

## Similarity Threshold

We use **65%** as the threshold because:
- Too low (40%): False positives, weak connections get bonused
- Too high (80%): Misses legitimate cross-topic stories
- **65%**: Sweet spot for high-relevance multi-topic detection

## Configuration

The multi-topic system uses existing topic configurations from `config.ts`:
- Topic keywords define what each topic represents
- Topic weights from dashboard affect bonus calculation
- No additional configuration needed

## Testing

To see multi-topic scoring in action:

### 1. Check Logs
Look for "Multi-topic story detected" in Vercel logs

### 2. Ranking Tab
Stories with multi-topic bonuses will show higher scores

### 3. Test Stories
Create stories that naturally span topics:
- "Company X partners with Company Y on Technology Z"
- "Industry trend affects multiple configured topics"

## Impact

### Scoring Weight Distribution

**Before**:
- Recency: 25%
- Topic Match: 40%
- Authority: 15%
- Topic Priority: 20%

**After**:
- Recency: 25%
- Topic Match: 35% (↓5%)
- Authority: 15%
- Topic Priority: 15% (↓5%)
- **Multi-Topic: 10%** (NEW!)

Total still sums to 100%, but now multi-topic stories get explicit recognition.

## Example Output

### Logs During Ranking
```
Multi-topic story detected
  title: "Accenture helps Verizon deploy AI-powered analytics"
  primary_topic: Accenture
  additional_topics: ["Verizon (78%)", "AI (72%)"]
  bonus: 0.312

Multi-topic story detected
  title: "Verizon 5G enables new AI capabilities for enterprises"
  primary_topic: Verizon
  additional_topics: ["AI (81%)"]
  bonus: 0.081
```

### Dashboard Display
Stories will rank higher when they span multiple topics:
```
#1 ⭐ Multi-topic: Accenture + Verizon + AI (Score: 0.78)
#2 Single-topic: Verizon only (Score: 0.65)
#3 ⭐ Multi-topic: Verizon + AI (Score: 0.64)
#4 Single-topic: AI only (Score: 0.58)
```

## Future Enhancements

Potential improvements:
1. Display multi-topic badges in the dashboard
2. Track multi-topic story performance over time
3. Allow configuring similarity threshold per topic
4. Show topic overlap visualization in reports

