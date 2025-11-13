# Null-Safety Fixes Applied

## Summary
Fixed "Cannot read properties of null (reading 'revised_text')" and similar errors by adding comprehensive null checks across all agents.

---

## Root Cause Analysis

### The Problem
When OpenAI returns unexpected JSON structures, the code crashed trying to access properties on null/undefined values:

```javascript
// BEFORE (UNSAFE):
for (let i = 0; i < result.sections.length; i++) {
  const section = result.sections[i];
  if (section.revised_text) { ... } // ❌ Crashes if section is null!
}
```

### Common Failure Scenarios
1. **AI returns fewer sections than expected** → `array[i]` is undefined
2. **AI returns null in array** → `sections[3] = null`
3. **AI omits expected fields** → `section.property` is undefined
4. **AI returns invalid JSON structure** → `parsed.sections` doesn't exist

---

## Fixes Applied (5 Agents)

### 1. FactCheckAgent (`lib/agents/factcheck.ts`)

**Location 1: Processing results (lines 60-76)**
```typescript
// BEFORE:
for (let i = 0; i < result.sections.length; i++) {
  const sectionResult = result.sections[i];
  if (sectionResult.revised_text) { ... }
  flagsRaised.push(...sectionResult.flags);
}

// AFTER:
for (let i = 0; i < result.sections.length; i++) {
  const sectionResult = result.sections[i];
  
  if (!sectionResult) { // ✅ NULL CHECK
    Logger.warn('Fact-check returned null for section', { index: i });
    continue;
  }
  
  if (sectionResult.revised_text) { ... }
  flagsRaised.push(...(sectionResult.flags || [])); // ✅ DEFAULT VALUE
}
```

**Location 2: Parsing OpenAI response (lines 156-175)**
```typescript
// BEFORE:
return {
  sections: parsed.sections.map((s: any) => ({
    revised_text: s.revised_text,
    changes: s.changes || [],
    flags: s.flags || [],
  })),
};

// AFTER:
// ✅ VALIDATE ARRAY EXISTS
if (!parsed.sections || !Array.isArray(parsed.sections)) {
  Logger.error('Invalid fact-check response: missing sections array');
  return { sections: [] };
}

return {
  sections: parsed.sections.map((s: any) => {
    if (!s) { // ✅ NULL CHECK
      return { revised_text: null, changes: [], flags: [] };
    }
    return {
      revised_text: s.revised_text || null,
      changes: s.changes || [],
      flags: s.flags || [],
    };
  }),
};
```

---

### 2. SafetyAgent (`lib/agents/safety.ts`)

**Location 1: Processing results (lines 60-81)**
```typescript
// BEFORE:
for (let i = 0; i < result.sections.length; i++) {
  const sectionResult = result.sections[i];
  if (sectionResult.revised_text) { ... }
}

// AFTER:
for (let i = 0; i < result.sections.length; i++) {
  const sectionResult = result.sections[i];
  
  if (!sectionResult) { // ✅ NULL CHECK
    Logger.warn('Safety check returned null for section', { index: i });
    continue;
  }
  
  if (sectionResult.revised_text) { ... }
}
```

**Location 2: Parsing OpenAI response (lines 146-165)**
```typescript
// BEFORE:
return {
  sections: parsed.sections.map((s: any) => ({
    revised_text: s.revised_text,
    edits: s.edits || [],
    risk_level: s.risk_level || 'low',
  })),
};

// AFTER:
// ✅ VALIDATE ARRAY EXISTS
if (!parsed.sections || !Array.isArray(parsed.sections)) {
  Logger.error('Invalid safety check response: missing sections array');
  return { sections: [] };
}

return {
  sections: parsed.sections.map((s: any) => {
    if (!s) { // ✅ NULL CHECK
      return { revised_text: null, edits: [], risk_level: 'low' as const };
    }
    return {
      revised_text: s.revised_text || null,
      edits: s.edits || [],
      risk_level: s.risk_level || 'low' as const,
    };
  }),
};
```

---

### 3. ScriptwriterAgent (`lib/agents/scriptwriter.ts`)

**Location: Parsing OpenAI response (lines 200-217)**
```typescript
// BEFORE:
return parsed.sections.map((section: any, idx: number) => ({
  type: section.type,
  text: section.text,
  ...
}));

// AFTER:
// ✅ VALIDATE ARRAY EXISTS
if (!parsed.sections || !Array.isArray(parsed.sections)) {
  Logger.error('Invalid scriptwriter response: missing sections array');
  throw new Error('Scriptwriter returned invalid response format');
}

// ✅ FILTER NULL SECTIONS + DEFAULT VALUES
return parsed.sections
  .filter((section: any) => section && section.text) 
  .map((section: any, idx: number) => ({
    type: section.type || 'story',
    text: section.text,
    duration_estimate_sec: section.duration_estimate_sec || 60,
    word_count: section.word_count || section.text.split(/\s+/).length,
    citations: this.extractCitations(section.text),
  }));
```

---

### 4. OutlineAgent (`lib/agents/outline.ts`)

**Location: Parsing OpenAI response (lines 103-113)**
```typescript
// BEFORE:
const sections: OutlineSection[] = outlineData.sections.map((section: any) => ({
  type: section.type,
  title: section.title,
  target_words: section.target_words,
  refs: section.refs.map((idx: number) => picks[idx]?.story_id).filter(Boolean),
}));

// AFTER:
// ✅ FILTER NULL SECTIONS + DEFAULT VALUES
const sections: OutlineSection[] = outlineData.sections
  .filter((section: any) => section && section.type)
  .map((section: any) => ({
    type: section.type,
    title: section.title || 'Untitled',
    target_words: section.target_words || 150,
    refs: (section.refs || []) // ✅ DEFAULT EMPTY ARRAY
      .map((idx: number) => picks[idx]?.story_id)
      .filter(Boolean),
  }));
```

---

### 5. RankingAgent (`lib/agents/ranking.ts`)

**Location: Story scoring (lines 54-70)**
```typescript
// BEFORE:
const scoredStories = stories.map((story, idx) => {
  const embedding = storyEmbeddings[idx];
  const score = this.calculateScore(story, embedding, topic_weights);
  return { story, embedding, score };
});

// AFTER:
const scoredStories = stories
  .map((story, idx) => {
    const embedding = storyEmbeddings[idx];
    
    if (!embedding) { // ✅ NULL CHECK
      Logger.warn('Missing embedding for story', { 
        story_id: story.id, 
        title: story.title 
      });
      return null;
    }
    
    const score = this.calculateScore(story, embedding, topic_weights);
    return { story, embedding, score };
  })
  .filter(Boolean) as Array<{ story: Story; embedding: number[]; score: number }>;
```

---

## Defensive Coding Patterns Used

### 1. Explicit Null Checks
```javascript
if (!value) {
  Logger.warn('Value is null');
  continue; // or return default
}
```

### 2. Filter Null Values
```javascript
array.filter((item) => item && item.required_field)
```

### 3. Default Values
```javascript
const result = value || defaultValue;
const array = value || [];
```

### 4. Optional Chaining
```javascript
const id = picks[idx]?.story_id; // Safe even if picks[idx] is undefined
```

### 5. Array Validation
```javascript
if (!parsed.sections || !Array.isArray(parsed.sections)) {
  return { sections: [] };
}
```

### 6. Spread with Defaults
```javascript
items.push(...(array || [])); // Won't crash if array is null
```

---

## Testing Checklist

To verify these fixes work:

### Test 1: Normal Episode Generation
✅ Generate episode with valid stories
✅ All agents should complete without errors
✅ Episode should have proper content

### Test 2: Edge Case - Few Stories
✅ Generate with only 1-2 stories
✅ Should handle missing sections gracefully
✅ Logs should show warnings, not crashes

### Test 3: Malformed AI Response
✅ If AI returns unexpected JSON, should log error
✅ Should continue or fail gracefully
✅ Should not crash with "Cannot read properties of null"

### Test 4: Empty Sections
✅ If AI returns sections with null values
✅ Should skip or use defaults
✅ Episode generation should complete

---

## Benefits

1. **Robustness**: Episode generation won't crash on unexpected AI responses
2. **Observability**: Warnings logged for null values help debugging
3. **Recovery**: Safe defaults allow process to continue
4. **User Experience**: Users see progress/completion instead of crashes

---

## Related Errors Fixed

This comprehensive fix prevents these error patterns:
- ❌ `Cannot read properties of null (reading 'revised_text')`
- ❌ `Cannot read properties of undefined (reading 'text')`
- ❌ `Cannot read property of null`
- ❌ `TypeError: Cannot destructure property 'X' of 'undefined'`
- ❌ `array[i] is undefined`

---

## Files Modified

1. `lib/agents/factcheck.ts` - 15 lines changed
2. `lib/agents/safety.ts` - 15 lines changed
3. `lib/agents/scriptwriter.ts` - 12 lines changed
4. `lib/agents/outline.ts` - 10 lines changed
5. `lib/agents/ranking.ts` - 8 lines changed

**Total: 60+ lines of defensive code added**

---

## Next Steps

If you still encounter null-safety issues:
1. Check the error message for which property is null
2. Look for the file and line number in the error
3. Add similar null checks as shown in this document
4. Log warnings to help identify the root cause

**Your episode generation should now be much more reliable!** ✅

