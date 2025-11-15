# Dynamic Episode Titles - Implementation Guide

## Overview

Your podcast episodes now have **dynamic, content-based titles** instead of the generic "Daily Brief - [date]" format.

## How It Works

### Title Generation Algorithm

The system automatically generates titles based on the **top topics** in each episode:

**Single Topic:**
```
"Artificial Intelligence - Nov 15"
```

**Two Topics:**
```
"AI & Corporate News - Nov 15"
```

**Three or More Topics:**
```
"AI, Markets & Technology - Nov 15"
```

### Title Format

- **Topics are ranked** by the number of stories in each category
- The **top 3 topics** are used (sorted by story count)
- The **date** is formatted as "Nov 15" (short month + day)
- Topics are connected with commas and an ampersand (&) before the last one

### Description Generation

Along with the title, each episode gets a descriptive summary:

```
"Your daily news brief for Friday, November 15, 2024. 5 stories covering 
2 artificial intelligence, 2 corporate news, 1 technology. 
AI-generated podcast powered by OpenAI."
```

## Where Titles Are Used

### 1. **RSS Feed**
- Each `<item>` in your podcast RSS feed now has a unique title
- Apple Podcasts, Spotify, and other platforms display this title
- Better SEO and discoverability

### 2. **Episode Manifest**
- Stored in `episodes/{run_id}_manifest.json`
- Includes both `title` and `description` fields

### 3. **Runs Index**
- The runs index (`runs/index.json`) stores titles for all episodes
- Used for displaying episode lists in your dashboard
- Used for generating RSS feeds

## Example Titles

Based on your configured topics, you might see titles like:

- **"AI & Accenture - Nov 15"** (2 AI stories, 2 Accenture stories)
- **"Verizon, AI & Corporate News - Nov 16"** (Multiple topics)
- **"Technology - Nov 17"** (All stories from one topic)
- **"AI, Markets & Healthcare - Nov 18"** (Diverse coverage)

## Technical Details

### Files Modified

1. **`lib/types.ts`**
   - Added `title` and `description` to `EpisodeManifest`
   - Added `title`, `description`, and `file_size` to `RunSummary`

2. **`lib/orchestrator.ts`**
   - Added `generateEpisodeTitle()` method
   - Added `generateEpisodeDescription()` method
   - Generates title/description during episode creation

3. **`lib/agents/publisher.ts`**
   - Uses `manifest.title` instead of hardcoded string
   - Falls back to old format for backwards compatibility

4. **`api/podcast/feed.ts`**
   - RSS feed now uses stored title from runs index
   - Escapes XML properly for special characters

5. **`lib/tools/runs-storage.ts`**
   - Stores title and description in runs index
   - Makes titles available for RSS feed generation

### Code Example

Here's how titles are generated:

```typescript
private generateEpisodeTitle(picks: any[], date: string): string {
  // Count stories per topic
  const topicCounts: Record<string, number> = {};
  for (const pick of picks) {
    topicCounts[pick.topic] = (topicCounts[pick.topic] || 0) + 1;
  }
  
  // Sort by count, take top 3
  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);
  
  // Format date
  const dateObj = new Date(date);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formattedDate = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
  
  // Build title
  if (sortedTopics.length === 1) {
    return `${sortedTopics[0]} - ${formattedDate}`;
  } else if (sortedTopics.length === 2) {
    return `${sortedTopics[0]} & ${sortedTopics[1]} - ${formattedDate}`;
  } else if (sortedTopics.length >= 3) {
    const topThree = sortedTopics.slice(0, 3);
    return `${topThree[0]}, ${topThree[1]} & ${topThree[2]} - ${formattedDate}`;
  }
  
  // Fallback
  return `Daily Brief - ${formattedDate}`;
}
```

## Backwards Compatibility

The system maintains **backwards compatibility**:

- ✅ Old episodes without titles still work (fallback to "Daily Brief - [date]")
- ✅ RSS feed checks for `manifest.title` and falls back gracefully
- ✅ Existing runs index entries work fine

## Testing

To see the new titles in action:

### 1. Generate a New Episode
```bash
npm run generate-episode
```

### 2. Check the Manifest
Look for the `title` field in `episodes/{run_id}_manifest.json`:
```json
{
  "title": "AI, Markets & Technology - Nov 15",
  "description": "Your daily news brief for...",
  ...
}
```

### 3. Check the RSS Feed
Visit: `https://your-app.vercel.app/podcast/feed.xml`

Look for the `<item>` entries:
```xml
<item>
  <title>AI, Markets &amp; Technology - Nov 15</title>
  <description>Your daily news brief for Friday, November 15, 2024...</description>
  ...
</item>
```

### 4. Check Your Dashboard
The runs list will show the new titles instead of just dates.

## Customization Options

If you want to customize the title format, edit these methods in `lib/orchestrator.ts`:

### Change Date Format
```typescript
// Current: "Nov 15"
const formattedDate = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;

// Alternative: "11/15" 
const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;

// Alternative: "November 15"
const formattedDate = dateObj.toLocaleDateString('en-US', { 
  month: 'long', 
  day: 'numeric' 
});
```

### Change Title Pattern
```typescript
// Current: "Topic1, Topic2 & Topic3 - Nov 15"

// Alternative: "Daily Brief: Topic1, Topic2, Topic3 (Nov 15)"
return `Daily Brief: ${sortedTopics.join(', ')} (${formattedDate})`;

// Alternative: "Nov 15: Topic1 | Topic2 | Topic3"
return `${formattedDate}: ${sortedTopics.join(' | ')}`;
```

### Limit Title Length
```typescript
// Truncate long topic names
const shortTopics = sortedTopics.map(t => 
  t.length > 15 ? t.substring(0, 15) + '...' : t
);
```

## Impact on Podcast Platforms

### Apple Podcasts
- ✅ Each episode shows its unique title
- ✅ Better search results (topic names are searchable)
- ✅ More professional appearance

### Spotify
- ✅ Episode titles display correctly
- ✅ Helps with recommendation algorithm
- ✅ Better user engagement

### Google Podcasts / Other Platforms
- ✅ Automatic support via RSS feed
- ✅ No additional configuration needed

## Next Steps

1. **Deploy the changes**: `git push origin main`
2. **Generate a test episode**: Check the new title format
3. **Wait for platforms to refresh**: Apple/Spotify update periodically
4. **Verify RSS feed**: Use a validator to check the XML
5. **Customize if needed**: Edit title format to your preference

## FAQs

**Q: Will old episodes get new titles?**
A: No, only new episodes generated after this update will have dynamic titles. Old episodes keep their original titles.

**Q: Can I customize the title format?**
A: Yes! Edit the `generateEpisodeTitle()` method in `lib/orchestrator.ts`.

**Q: What if I only have one topic configured?**
A: The title will just show that topic name and the date: "Technology - Nov 15"

**Q: Are special characters handled correctly?**
A: Yes, the RSS feed properly escapes XML special characters (& becomes &amp;, etc.)

**Q: Do I need to update my dashboard?**
A: No, the dashboard will automatically display the new titles.

---

**Committed**: These changes are committed and ready to push to GitHub!

**Next**: Push to deploy, then generate a test episode to see the new titles in action.

