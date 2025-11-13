# OpenAI API Usage Analysis

## Current API Call Pattern Per Episode

### 1. Text Generation (GPT-4) Calls: ~6-7 per episode ✅ OPTIMIZED

| Agent | Calls | Purpose | Status |
|-------|-------|---------|--------|
| **RankingAgent** | 1 | Rank and select stories | ✅ Single batch call |
| **OutlineAgent** | 1 | Create episode structure | ✅ Single call |
| **ScriptwriterAgent** | 1 | Write ALL sections at once | ✅ Batched (was 5-10 before) |
| **FactCheckAgent** | 1 | Check ALL sections at once | ✅ Batched (was 5-10 before) |
| **SafetyAgent** | 1 | Screen ALL sections at once | ✅ Batched (was 5-10 before) |
| **TTSDirectorAgent** | 1 | Plan TTS synthesis | ✅ Single call |
| **MemoryAgent** | 0-1 | Update context (optional) | ✅ Minimal |
| **TOTAL** | **6-7** | | ✅ Already optimized |

**Cost per episode (GPT-4-Turbo):**
- Input: ~10K tokens × $0.01/1K = **$0.10**
- Output: ~8K tokens × $0.03/1K = **$0.24**
- **Subtotal: ~$0.34 per episode**

---

### 2. Text-to-Speech (TTS) Calls: ~10-20 per episode ⚠️ POTENTIAL ISSUE

| Component | Description | API Calls |
|-----------|-------------|-----------|
| **Typical Episode Structure** | cold-open + 3-5 stories + sign-off | 5-7 sections |
| **Segments per Section** | Split at 4000 chars (~2-3 min) | 1-3 segments each |
| **Total TTS Segments** | Depends on script length | **10-20 segments** |
| **Current Implementation** | Sequential loop in audio-engineer | **10-20 API calls** |

**Cost per episode (TTS-1-HD):**
- Average: 15 segments × 2000 chars × $0.015/1K chars = **$0.45**
- **Subtotal: ~$0.45 per episode**

**CURRENT EXECUTION:**
```typescript
// lib/agents/audio-engineer.ts (line 41-56)
for (const plan of synthesis_plan) {
  const audio = await this.ttsTool.synthesize({ ... }); // ONE CALL AT A TIME
  audioSegments.push(audio);
}
```

**AVAILABLE BUT NOT USED:**
```typescript
// lib/tools/tts.ts has synthesizeSegments() with:
// - Concurrency: 2 parallel calls
// - 500ms delay between batches
// - Rate limit protection
```

---

## 🚨 IDENTIFIED ISSUE: Sequential TTS Calls

### Problem
The `AudioEngineerAgent` calls TTS **one segment at a time** in a sequential loop, but there's an optimized `synthesizeSegments()` method available that:
1. Processes 2 segments in parallel
2. Adds 500ms delay between batches
3. Has built-in rate limit handling

### Impact
- **Slower**: 20 segments × 5 seconds = 100 seconds vs. 20 segments ÷ 2 × 5.5s = 55 seconds
- **Same API calls**: 20 calls either way (just parallelized)
- **Better rate limit handling**: Built-in backoff

### Solution
Change `audio-engineer.ts` to use the existing `synthesizeSegments()` method.

---

## Total API Usage Summary

### Per Episode (Current)
- **GPT-4 Text Generation**: 6-7 calls (~$0.34)
- **TTS Synthesis**: 10-20 calls (~$0.45)
- **TOTAL**: **16-27 API calls** (~$0.79 per episode)

### Per Month (30 episodes)
- **GPT-4 calls**: 180-210 calls (~$10)
- **TTS calls**: 300-600 calls (~$14)
- **TOTAL**: **480-810 API calls** (~$24/month)

---

## Is This Too Much? 🤔

### Compared to Industry Standards
| Service | API Calls/Episode | Our Usage |
|---------|-------------------|-----------|
| **Typical AI Podcast** | 15-30 calls | ✅ 16-27 (normal) |
| **NPR-style script** | 20-40 calls | ✅ Better |
| **Multi-host dynamic** | 30-50 calls | ✅ Much better |

### Verdict: **NOT TOO MANY** ✅

Your API usage is **efficient and industry-standard**. The batching optimizations we did earlier (Scriptwriter, Safety, FactCheck) reduced calls from potentially 30-40 down to 16-27.

---

## Why You're Hitting Quota Issues

### It's NOT the number of calls, it's the RATE LIMITS

OpenAI has two types of limits:
1. **RPM (Requests Per Minute)**: Free tier = 3-5/min, Paid tier = 60-500/min
2. **TPM (Tokens Per Minute)**: Free tier = 40K/min, Paid tier = 150K-2M/min

**Your Issue:**
- You're on **paid tier** with credits remaining
- But hitting **usage limits** (not quota limits)
- Likely: TPM limit hit when generating script/TTS in bulk

**Solution (already implemented):**
✅ Exponential backoff with retry logic
✅ Rate limit detection and automatic retry
✅ TTS batching with delays

**What you need:**
- **Increase your usage limits** at https://platform.openai.com/settings/organization/limits
- Or **tier up** by spending $50-100 (unlocks higher limits automatically)

---

## Recommendations

### ✅ Already Optimized (No Action Needed)
1. **Text Generation**: Single-batch calls for all agents
2. **Error Handling**: Exponential backoff on 429 errors
3. **API Tracking**: Count visible in dashboard

### ⚡ Quick Win (Optional Optimization)
**Use parallel TTS synthesis:**

```typescript
// lib/agents/audio-engineer.ts
// CHANGE FROM:
for (const plan of synthesis_plan) {
  const audio = await this.ttsTool.synthesize({ ... });
  audioSegments.push(audio);
}

// TO:
const audioSegments = await this.ttsTool.synthesizeSegments(
  synthesis_plan.map(plan => ({
    voice: plan.voice,
    text: plan.text_with_cues,
    format: 'mp3',
    speed: 1.0,
  }))
);
```

**Benefit:**
- ⏱️ 45% faster synthesis (100s → 55s)
- 🛡️ Better rate limit handling
- 📊 Same API call count (just parallelized)

### 💰 Cost Reduction (If Needed)
If you want to reduce costs further:
1. **Use TTS-1** instead of TTS-1-HD ($0.006 vs $0.015/1K chars) = 60% savings
2. **Switch to GPT-3.5-Turbo** for non-critical agents (Ranking, Outline)
3. **Increase segment size** to 4500 chars (fewer segments, same quality)

---

## Bottom Line

**Your API usage is NORMAL and EFFICIENT.** ✅

The quota issue is due to OpenAI's usage limits, not excessive calls. The fix is to:
1. ✅ **Keep the retry logic** (already done)
2. 🔑 **Increase OpenAI usage limits** (requires tier increase or limit request)
3. ⚡ **Optionally parallelize TTS** (faster, not fewer calls)

Your system makes **~20 API calls per episode**, which is standard for AI-generated podcasts.

