# Podcast Customization - Implementation Status

## ✅ COMPLETED

### 1. Dashboard UI (DONE)
- ✅ Added "🎙️ Podcast Production" settings card
- ✅ Style/Tone selector (Executive/Casual/Technical)
- ✅ Number of stories (min/max)
- ✅ Custom intro/outro text templates
- ✅ Music enable/disable with duration controls
- ✅ Pause timing controls (after intro, between stories, before outro)
- ✅ Settings load from config
- ✅ Settings save to config/config.json
- ✅ Music duration toggles show/hide based on checkbox

### 2. Config Storage (DONE)
- ✅ Added `podcast_production` to `DashboardConfig` interface in `lib/tools/config-storage.ts`
- ✅ Default values set for all production settings
- ✅ Settings persist across sessions

### 3. Orchestrator Config Loading (DONE)
- ✅ Orchestrator loads dashboard config from ConfigStorage
- ✅ Falls back to defaults if config not found
- ✅ `buildRunConfig()` includes `podcast_production` settings
- ✅ Logs when dashboard config is loaded

## 🔄 IN PROGRESS (Need to complete)

### 4. Agent Integration (TODO)

**Need to update these agent calls in orchestrator:**

```typescript
// lib/orchestrator.ts

// OUTLINE AGENT (line ~233)
const outlineResult = await this.outlineAgent.execute(runId, {
  picks: rankingResult.output.picks,
  date: runConfig.date,
  target_duration_sec: runConfig.target_duration_sec,
  // ADD:
  num_stories_min: runConfig.podcast_production.num_stories_min,
  num_stories_max: runConfig.podcast_production.num_stories_max,
});

// SCRIPTWRITER AGENT (line ~261)
const scriptResult = await this.scriptwriterAgent.execute(runId, {
  outline: outlineResult.output!.outline,
  picks: rankingResult.output.picks,
  date: runConfig.date,
  listener_name: 'Rohit',
  // ADD:
  intro_text: runConfig.podcast_production.intro_text,
  outro_text: runConfig.podcast_production.outro_text,
  style: runConfig.podcast_production.style,
});

// AUDIO ENGINEER AGENT (line ~342)
const audioResult = await this.audioEngineerAgent.execute(runId, {
  synthesis_plan: ttsDirectorResult.output!.synthesis_plan,
  // ADD:
  enable_intro_music: runConfig.podcast_production.enable_intro_music,
  intro_music_duration_ms: runConfig.podcast_production.intro_music_duration_ms,
  enable_outro_music: runConfig.podcast_production.enable_outro_music,
  outro_music_duration_ms: runConfig.podcast_production.outro_music_duration_ms,
  pause_after_intro_ms: runConfig.podcast_production.pause_after_intro_ms,
  pause_between_stories_ms: runConfig.podcast_production.pause_between_stories_ms,
  pause_before_outro_ms: runConfig.podcast_production.pause_before_outro_ms,
});
```

**Agent interface/implementation updates needed:**

1. **`lib/agents/outline.ts`**:
   - Update `OutlineInput` interface to include `num_stories_min?` and `num_stories_max?`
   - Use these values in the prompt to AI

2. **`lib/agents/scriptwriter.ts`**:
   - Update `ScriptwriterInput` interface to include `intro_text?`, `outro_text?`, `style?`
   - Modify system prompt based on `style` (executive/casual/technical)
   - Use custom intro/outro text in the generated script

3. **`lib/agents/audio-engineer.ts`**:
   - Update `AudioEngineerInput` interface with music/pause settings
   - Use settings to conditionally add music/pauses
   - Use custom durations from config

## Summary

**Files Modified So Far:**
- ✅ `lib/tools/config-storage.ts` - Added podcast_production config
- ✅ `public/dashboard.html` - Added UI controls
- ✅ `lib/orchestrator.ts` - Loads config from ConfigStorage

**Files Still Need Updates:**
- 🔄 `lib/orchestrator.ts` - Pass settings to agents
- 🔄 `lib/agents/outline.ts` - Accept & use num_stories_min/max
- 🔄 `lib/agents/scriptwriter.ts` - Accept & use intro/outro/style
- 🔄 `lib/agents/audio-engineer.ts` - Accept & use music/pause settings

**User Experience:**
Once complete, users can customize their podcast from the dashboard, save settings, and all future episodes will use those custom settings automatically!


