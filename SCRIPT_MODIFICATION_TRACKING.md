# Script Modification Tracking and Agent Tuning

## Problem Statement

The podcast generation pipeline modifies the script through multiple agents:
1. **Scriptwriter Agent** - Creates the original script
2. **FactCheck Agent** - Adds citations and corrects factual errors
3. **Safety Agent** - Removes problematic content

Previously:
- Script modifications weren't tracked, making it hard to debug differences between script and final audio
- FactCheck and Safety agents were too aggressive, changing tone and style unnecessarily

## Solution

### 1. Script Version Tracking (Quick Fix)

**Changes:**
- `lib/types.ts`: Added `script_versions` field to `EpisodeManifest`
- `lib/orchestrator.ts`: Save all three script versions (original, after_factcheck, final)

```typescript
const scriptVersions = {
  original: JSON.parse(JSON.stringify(scriptResult.output!.script)),
  after_factcheck: JSON.parse(JSON.stringify(factCheckResult.output!.script)),
  final: safetyResult.output!.script,
};
```

**Benefits:**
- Can now compare what each agent changed
- Stored in episode manifest for debugging
- Helps identify which agent made which modifications

### 2. Less Aggressive Agents (Medium Fix)

**FactCheck Agent (`lib/agents/factcheck.ts`):**

**Before:**
- Required citation for every factual claim
- Would rephrase and rewrite content
- Temperature: 0.3

**After:**
- Add citations ONLY for specific claims (numbers, quotes, unique facts)
- Don't add citations to: general knowledge, obvious facts, contextual statements
- Preserve original wording - only fix CLEAR errors
- "If unsure whether to edit, DON'T edit"
- Temperature: 0.1 (more conservative)

**Safety Agent (`lib/agents/safety.ts`):**

**Before:**
- Screened for "inflammatory or divisive language"
- Would rewrite content to be "neutral"
- Removed speculation
- Temperature: 0.2

**After:**
- Screen for ONLY truly problematic content (defamation, legal risks)
- BE MINIMAL: "This is legitimate news reporting - don't over-edit"
- Don't soften normal news language
- Don't remove speculation that's labeled as such ("could", "might", etc.)
- "When in doubt, DON'T edit"
- Temperature: 0.1 (more conservative)

### 3. Episode Title Deduplication Fix

**Problem:**
Episode titles showed duplicates like "Verizon Layoffs & Verizon Layoff"

**Root Cause:**
The theme extraction was creating similar phrases from different story titles without normalizing for singular/plural variations.

**Solution (`lib/orchestrator.ts`):**

Added `normalizePhrase()` method:
```typescript
private normalizePhrase(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/s$/, '')         // Remove trailing 's' (plural)
    .replace(/es$/, '')        // Remove trailing 'es' (plural)
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .trim();
}
```

Updated deduplication logic:
```typescript
const normalizedPhrase = this.normalizePhrase(phrase);
const existing = keyPhrases.find(p => 
  this.normalizePhrase(p.phrase) === normalizedPhrase
);
```

**Benefits:**
- "Verizon Layoffs" and "Verizon Layoff" → same normalized phrase
- Avoids duplicate themes in episode titles
- Cleaner, more professional titles

## Testing

To verify these changes work:

1. **Run a new episode** - check that script_versions is populated in manifest
2. **Check episode title** - verify no duplicate themes
3. **Compare scripts** - original vs final should have minimal changes
4. **Review agent logs** - factcheck and safety should make fewer edits

## Example Usage

```typescript
// Access script versions from manifest
const manifest = await runsStorage.getManifest(runId);
console.log('Original script:', manifest.script_versions?.original);
console.log('After factcheck:', manifest.script_versions?.after_factcheck);
console.log('Final script:', manifest.script_versions?.final);
```

## Impact

- **Script fidelity**: Maintains scriptwriter's intended voice and style
- **Debuggability**: Can trace exactly what changed and when
- **Quality**: Episode titles are cleaner without duplicates
- **Efficiency**: Agents process faster with clearer, more conservative guidelines

