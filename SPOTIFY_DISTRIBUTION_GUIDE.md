# How to Get Your Podcast on Spotify

## Prerequisites ✅

You already have:
- ✅ **RSS Feed**: `https://daily-podcast-brown.vercel.app/podcast/feed.xml`
- ✅ **Episode MP3s**: Publicly accessible on AWS S3
- ✅ **Metadata**: Title, description, author info in your feed

---

## Step-by-Step: Submit to Spotify

### 1. **Go to Spotify for Podcasters**
Visit: https://podcasters.spotify.com/

### 2. **Sign Up / Log In**
- Use your existing Spotify account, or
- Create a new account (free)

### 3. **Click "Get Started"**
Look for the button that says "Get Started" or "Add Your Podcast"

### 4. **Enter Your RSS Feed URL**
```
https://daily-podcast-brown.vercel.app/podcast/feed.xml
```

### 5. **Verify Ownership**
Spotify will ask you to verify you own the podcast. Choose one method:

**Option A: Email Verification**
- Spotify sends an email to the email in your RSS feed
- Check your inbox for: `podcast@example.com` (or whatever you set)
- Click the verification link

**Option B: RSS Feed Verification**
- Add a specific tag to your RSS feed that Spotify provides
- Update your feed generator to include this tag

### 6. **Fill Out Podcast Details**
Spotify will pull info from your RSS feed, but you can customize:
- Podcast name
- Description
- Category (News, Technology, Business)
- Language (English)
- Country
- Explicit content rating

### 7. **Add Cover Art (if needed)**
- Minimum: 1400 x 1400 pixels
- Maximum: 3000 x 3000 pixels
- Format: JPG or PNG
- Square aspect ratio

### 8. **Submit for Review**
- Click "Submit"
- Spotify reviews submissions (usually 24-48 hours)

---

## After Approval

### What Happens Next:
1. **Spotify indexes your feed** - They'll check your RSS feed regularly for new episodes
2. **Episodes appear automatically** - New episodes you generate will show up within a few hours
3. **You get analytics** - View plays, followers, demographics in Spotify for Podcasters dashboard

### Your Podcast URL:
After approval, Spotify will give you a unique URL like:
```
https://open.spotify.com/show/[YOUR-SHOW-ID]
```

---

## Important: Keep Your RSS Feed Working

Spotify pulls episodes from your RSS feed. Make sure:
- ✅ Your Vercel deployment stays active
- ✅ Your S3 bucket remains publicly accessible
- ✅ Episode MP3 URLs don't change
- ✅ Feed XML is valid (test at https://podba.se/validate/)

---

## Update Your Feed Metadata (Optional)

Before submitting, you might want to update your podcast info in the dashboard:

### Current Settings:
- **Title**: "Rohit's Daily AI & Corporate News Brief"
- **Email**: `podcast@example.com` ⚠️ *Change this to your real email!*

### How to Update:
1. Go to your dashboard Settings tab
2. Look for "Podcast Metadata" section (we can add this if needed)
3. Update email, title, description
4. Save settings

---

## Other Podcast Platforms

Once on Spotify, you can also submit to:

### Apple Podcasts
- https://podcastsconnect.apple.com/
- Same RSS feed
- Similar submission process

### Google Podcasts
- https://podcastsmanager.google.com/
- Uses same RSS feed
- Automated indexing

### Amazon Music / Audible
- https://music.amazon.com/podcasters/
- RSS feed submission

### Pocket Casts, Overcast, Castro, etc.
- Most auto-discover your podcast once it's on Apple/Spotify
- Or users can manually add your RSS feed URL

---

## Quick Checklist Before Submitting

- [ ] RSS feed is publicly accessible
- [ ] Feed contains at least one episode
- [ ] Episode MP3s are publicly playable
- [ ] Cover art is at least 1400x1400px
- [ ] Email in feed is valid (for verification)
- [ ] Podcast title and description are professional
- [ ] Category is set correctly (News/Technology)

---

## Test Your Feed First

Visit these validators before submitting:
1. **Podbase**: https://podba.se/validate/?url=https://daily-podcast-brown.vercel.app/podcast/feed.xml
2. **Cast Feed Validator**: https://castfeedvalidator.com/
3. **RSS Feed Validator**: https://validator.w3.org/feed/

---

## Need Help?

If you encounter issues:
1. Check that your RSS feed loads in a browser
2. Verify episode MP3s are publicly accessible (not 403/404 errors)
3. Spotify for Podcasters has live chat support
4. Common issue: Email verification - make sure you use a real email in your config

---

## Quick Start Command

1. **Update your email** in dashboard settings (Settings → Podcast Production)
2. **Test your feed**: Visit `https://daily-podcast-brown.vercel.app/podcast/feed.xml` in browser
3. **Go to Spotify for Podcasters**: https://podcasters.spotify.com/
4. **Submit your RSS feed URL**
5. **Wait 24-48 hours for approval** ✅

Your podcast will then be searchable and playable on Spotify!


