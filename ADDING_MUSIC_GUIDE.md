# How to Add Music to Your Podcast

## Overview

Adding music requires:
1. **Royalty-free music files** (MP3 format)
2. **Storage** for the music files (S3 or project files)
3. **Code updates** to load and concatenate music with TTS audio

---

## Step 1: Get Royalty-Free Music

### Free Sources:
- **Incompetech**: https://incompetech.com/music/royalty-free/
  - Huge library, free with attribution
  - Download MP3 format
  
- **Bensound**: https://www.bensound.com/
  - High-quality tracks
  - Free with attribution
  
- **YouTube Audio Library**: https://www.youtube.com/audiolibrary/music
  - Free, no attribution required
  
- **Free Music Archive**: https://freemusicarchive.org/
  - Curated collection

### What to Look For:
- **Intro music**: 3-5 seconds, upbeat, energetic (short sting/logo)
- **Outro music**: 2-4 seconds, conclusive, memorable
- **Format**: MP3 (128kbps or higher)
- **License**: Must allow commercial/podcast use

### Recommended Style:
For your news brief podcast:
- Corporate/tech sound
- Clean, modern
- Not too distracting
- Examples: "Digital Lemonade" (Incompetech), "Going Higher" (Bensound)

---

## Step 2: Prepare Music Files

1. **Download** your chosen tracks as MP3
2. **Edit** to desired length:
   - Use Audacity (free): https://www.audacityteam.org/
   - Or online: https://mp3cut.net/
3. **Name them**:
   - `intro-music.mp3` (3-5 seconds)
   - `outro-music.mp3` (2-4 seconds)
4. **Keep file size small** (< 100KB each for fast loading)

---

## Step 3: Upload to AWS S3

### Using AWS Console:

1. Go to your S3 bucket
2. Create a new folder: `music/`
3. Upload files:
   - `music/intro-music.mp3`
   - `music/outro-music.mp3`
4. **Make them public**:
   - Select each file
   - Actions → Make public
   - Or use bucket policy (see AWS_S3_SETUP.md)

### Get the URLs:
```
https://your-bucket.s3.amazonaws.com/music/intro-music.mp3
https://your-bucket.s3.amazonaws.com/music/outro-music.mp3
```

---

## Step 4: Update Code to Use Music

### A. Update `audio-engineer.ts`:

```typescript
// At the top of the class
private async loadMusicFile(key: string): Promise<Buffer> {
  try {
    const data = await this.storage.get(key);
    return Buffer.from(data);
  } catch (error) {
    Logger.warn('Failed to load music file', { key, error: (error as Error).message });
    return Buffer.alloc(0); // Return empty buffer if music not found
  }
}

// In the process() method:
protected async process(input: AudioEngineerInput): Promise<AudioEngineerOutput> {
  const { synthesis_plan } = input;
  
  Logger.info('Starting audio synthesis', { segments: synthesis_plan.length });
  
  const audioSegments: Buffer[] = [];
  
  // Load and add intro music (if enabled)
  const introMusic = await this.loadMusicFile('music/intro-music.mp3');
  if (introMusic.length > 0) {
    Logger.info('Adding intro music');
    audioSegments.push(introMusic);
  }
  
  // Synthesize all TTS segments
  for (const plan of synthesis_plan) {
    const audio = await this.ttsTool.synthesize({
      voice: plan.voice,
      text: plan.text_with_cues,
      format: 'mp3',
      speed: 1.0,
    });
    audioSegments.push(audio);
  }
  
  // Load and add outro music (if enabled)
  const outroMusic = await this.loadMusicFile('music/outro-music.mp3');
  if (outroMusic.length > 0) {
    Logger.info('Adding outro music');
    audioSegments.push(outroMusic);
  }
  
  // Concatenate all segments
  const concatenated = AudioTool.concat(audioSegments);
  
  // ... rest of the code
}
```

### B. Make it Configurable:

Update the `process()` method to use dashboard settings:

```typescript
protected async process(input: AudioEngineerInput): Promise<AudioEngineerOutput> {
  const { 
    synthesis_plan,
    enable_intro_music = false,
    enable_outro_music = false,
  } = input;
  
  const audioSegments: Buffer[] = [];
  
  // Intro music (only if enabled)
  if (enable_intro_music) {
    const introMusic = await this.loadMusicFile('music/intro-music.mp3');
    if (introMusic.length > 0) {
      audioSegments.push(introMusic);
    }
  }
  
  // TTS segments
  for (const plan of synthesis_plan) {
    const audio = await this.ttsTool.synthesize({ /* ... */ });
    audioSegments.push(audio);
  }
  
  // Outro music (only if enabled)
  if (enable_outro_music) {
    const outroMusic = await this.loadMusicFile('music/outro-music.mp3');
    if (outroMusic.length > 0) {
      audioSegments.push(outroMusic);
    }
  }
  
  return { /* ... */ };
}
```

---

## Step 5: Update `audio-engineer.ts` Interface

Add the new input parameters:

```typescript
export interface AudioEngineerInput {
  synthesis_plan: SynthesisPlan[];
  enable_intro_music?: boolean;
  enable_outro_music?: boolean;
  intro_music_path?: string;  // Optional: custom music path
  outro_music_path?: string;  // Optional: custom music path
}
```

---

## Step 6: Update Orchestrator to Pass Settings

In `lib/orchestrator.ts`, when calling audio engineer:

```typescript
const audioResult = await this.audioEngineerAgent.execute(runId, {
  synthesis_plan: ttsDirectorResult.output!.synthesis_plan,
  enable_intro_music: runConfig.podcast_production?.enable_intro_music,
  enable_outro_music: runConfig.podcast_production?.enable_outro_music,
});
```

---

## Alternative: Embed Music in Project

Instead of S3, you can bundle music files in your project:

### 1. Create a directory:
```bash
mkdir -p public/music
```

### 2. Add files:
```
public/music/intro-music.mp3
public/music/outro-music.mp3
```

### 3. Load from filesystem:

```typescript
import fs from 'fs';
import path from 'path';

private loadMusicFileLocal(filename: string): Buffer {
  try {
    const musicPath = path.join(process.cwd(), 'public', 'music', filename);
    return fs.readFileSync(musicPath);
  } catch (error) {
    Logger.warn('Failed to load local music', { filename });
    return Buffer.alloc(0);
  }
}
```

### Pros/Cons:
- **Pros**: No S3 costs, faster loading, version controlled
- **Cons**: Increases deployment size, harder to change music

---

## Testing

1. **Upload music files to S3** (or add to project)
2. **Update code** with changes above
3. **Deploy to Vercel**
4. **Enable intro/outro music** in dashboard settings
5. **Generate new episode** (Run Now)
6. **Listen and verify** music plays correctly

---

## Troubleshooting

### Music doesn't play:
- Check S3 file URLs are publicly accessible
- Verify MP3 format (not WAV or other formats)
- Check file size (< 1MB recommended)
- Look at logs for "Failed to load music file" warnings

### Music too loud/soft:
- Adjust volume in Audacity before uploading
- Target: -6dB to -3dB peak volume
- Normalize to match TTS voice level

### Music cuts off speech:
- Make intro music shorter (2-3 seconds max)
- Use fade-out on music if possible
- Ensure outro music starts AFTER speech ends

---

## Advanced: Music Mixing (Future)

For professional mixing (music under speech, fade-in/out):

Would require:
- **ffmpeg** (audio processing library)
- Lambda function or longer timeout
- More complex audio mixing code

Not recommended for Vercel Hobby plan due to:
- 10-second timeout
- No ffmpeg binary support
- Memory constraints

---

## Summary Checklist

- [ ] Download royalty-free music (MP3)
- [ ] Edit to 3-5 seconds (intro) and 2-4 seconds (outro)
- [ ] Upload to S3 in `music/` folder
- [ ] Make files publicly accessible
- [ ] Update `audio-engineer.ts` with loadMusicFile()
- [ ] Update AudioEngineerInput interface
- [ ] Update orchestrator to pass settings
- [ ] Deploy to Vercel
- [ ] Enable music in dashboard settings
- [ ] Test with new episode

---

**Once set up, your dashboard music toggles will actually work!** 🎵

