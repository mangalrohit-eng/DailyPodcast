# RSS Feed Metadata Fix - Summary

## Problem
When adding your podcast feed to Apple Podcasts, you experienced:
1. **Podcast name** was different from your dashboard settings
2. **Description** was different from your dashboard settings  
3. **No cover image** was shown

## Root Cause
The system had a **configuration mismatch**:
- The RSS feed generation was using **environment variables** instead of **dashboard settings**
- There was **no field** to configure a custom podcast cover image URL
- The image URL was hardcoded to `${baseUrl}/podcast-artwork.jpg`

## What Was Fixed

### 1. Added Podcast Image URL Field
- ✅ Added `podcast_image_url` field to `DashboardConfig` interface
- ✅ Added input field in dashboard under "Podcast Metadata" section
- ✅ Image URL is now saved with your other podcast settings

### 2. Fixed Configuration Source
- ✅ Updated `Config.getPodcastConfig()` to load from **dashboard settings** (preferred) instead of env vars
- ✅ Falls back to env vars only if dashboard config fails to load
- ✅ Updated orchestrator to await the async config call

### 3. Updated RSS Feed Generation
- ✅ Both feed generation locations now use `podcast_image_url` from config:
  - `lib/agents/publisher.ts` (when publishing episodes)
  - `api/podcast/feed.ts` (when serving the feed)
- ✅ Falls back to `${baseUrl}/podcast-artwork.jpg` if image URL not set

## What You Need to Do Next

### Step 1: Update Your Dashboard Settings
1. Go to your podcast dashboard
2. Navigate to the **Podcast Settings** tab
3. Scroll to **Podcast Metadata** section
4. You'll see a new field: **Podcast Cover Image URL**
5. Enter the **direct URL** to your podcast artwork (e.g., `https://your-domain.com/artwork.jpg`)
   - Image must be **at least 1400x1400px** for Apple Podcasts
   - Should be **square** (1:1 aspect ratio)
   - Supported formats: JPG or PNG
6. Verify your other metadata:
   - **Podcast Title** - Update if needed
   - **Description** - Update if needed
   - **Contact Email** - Make sure this is correct (Apple will send verification emails here)
   - **Author** - Update if needed
   - **Category** - Verify it's correct
7. Click **Save Settings**

### Step 2: Regenerate the RSS Feed
Option A: **Trigger a new episode generation**
- The next podcast episode will automatically regenerate the feed with your new settings

Option B: **Manually refresh the feed** (if you need it immediately)
- Run a new episode: `npm run generate-episode`
- Or use your PowerShell script: `.\manage-podcast.ps1 run`

### Step 3: Update Apple Podcasts (if already submitted)
1. Wait 24-48 hours for Apple to refresh your feed
2. If it doesn't update automatically:
   - Go to https://podcastsconnect.apple.com/
   - Find your podcast
   - Click "Refresh" or "Update Feed"
3. Apple will pull the new metadata from your RSS feed

### Step 4: Verify the Changes
Check your RSS feed at:
```
https://your-deployment-url.vercel.app/podcast/feed.xml
```

Look for these XML tags to verify they're correct:
```xml
<title>Your Correct Title</title>
<description>Your Correct Description</description>
<itunes:image href="https://your-image-url.jpg"/>
<itunes:author>Your Author Name</itunes:author>
```

You can also use a feed validator:
- https://podba.se/validate/?url=YOUR_FEED_URL
- https://castfeedvalidator.com/

## Technical Details

### Files Changed
1. `lib/tools/config-storage.ts` - Added `podcast_image_url` field to config
2. `lib/config.ts` - Made `getPodcastConfig()` async and load from dashboard
3. `lib/orchestrator.ts` - Updated to await async `getPodcastConfig()`
4. `api/podcast/feed.ts` - Updated RSS generation to use config image URL
5. `public/dashboard.html` - Added image URL input field

### Configuration Priority
The new system loads config in this order:
1. **Dashboard settings** (preferred) - What you set in the UI
2. **Environment variables** (fallback) - Only if dashboard config fails
3. **Hardcoded defaults** (last resort) - Built-in defaults

## FAQ

**Q: I updated my settings but Apple Podcasts still shows old info**
A: Apple caches podcast feeds. Wait 24-48 hours, or manually refresh in Podcasts Connect.

**Q: Where should I host my podcast artwork?**
A: Options:
- Upload to your Vercel deployment's `/public` folder
- Use a CDN like Cloudinary or ImgIx
- Host on your S3 bucket and make it publicly accessible
- Use any publicly accessible URL

**Q: What if I leave the Image URL field empty?**
A: The system will use `${baseUrl}/podcast-artwork.jpg` as a fallback. Make sure you have an image at `/public/podcast-artwork.jpg` in your deployment.

**Q: Do I need to redeploy to Vercel?**
A: **Yes**, you need to deploy these code changes:
```bash
git push origin main
```
Then Vercel will automatically deploy the updates.

**Q: Will this affect my existing episodes?**
A: No, existing episodes remain unchanged. The metadata applies to the podcast as a whole, not individual episodes.

## Next Steps (After Deploying)
1. ✅ Commit changes (DONE)
2. ⏳ Push to GitHub: `git push origin main` (you'll be asked to confirm)
3. ⏳ Wait for Vercel to deploy (~1-2 minutes)
4. ⏳ Update dashboard settings with your image URL
5. ⏳ Generate a new episode or wait for scheduled run
6. ⏳ Verify feed at `/podcast/feed.xml`
7. ⏳ Wait for Apple Podcasts to refresh (24-48 hours)

---

**Need help?** Check the feed validator or ask for assistance!

