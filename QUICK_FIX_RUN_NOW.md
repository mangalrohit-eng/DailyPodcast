# Quick Fix: Force New Episode Generation

## Problem
"Run Now" shows instant success but doesn't generate new episode.

## Immediate Solution: Generate Tomorrow's Episode

Open browser console (F12) and paste this:

```javascript
fetch(`${window.location.origin}/api/run`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': localStorage.getItem('dashboard_token') ? 
            `Bearer ${localStorage.getItem('dashboard_token')}` : 
            `Basic ${btoa('admin:' + prompt('Enter dashboard password:'))}`
    },
    body: JSON.stringify({
        date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
        force_overwrite: true
    })
}).then(r => r.json()).then(data => {
    console.log('API Response:', data);
    alert(JSON.stringify(data, null, 2));
});
```

This will generate an episode for **tomorrow** which definitely doesn't exist yet.

---

## Debug: Check What's Being Sent

1. Open browser console (F12)
2. Go to **Network** tab
3. Click "Run Now"
4. Find the request to `/api/run`
5. Click on it
6. Go to **Payload** or **Request** tab
7. Tell me what you see in the body

**Expected:**
```json
{
  "force_overwrite": true
}
```

**If you see this instead:**
```
(empty body)
```

Then the dashboard changes haven't deployed yet.

---

## Nuclear Option: Delete Today's Episode

If you want to force regeneration for TODAY:

### Via AWS Console:
1. Go to https://s3.console.aws.amazon.com/
2. Open your bucket
3. Go to `episodes/` folder
4. Delete these files:
   - `2025-11-13_daily_rohit_news.mp3`
   - `2025-11-13_manifest.json`
5. Go back to dashboard, click "Run Now"

### Via AWS CLI:
```bash
aws s3 rm s3://YOUR-BUCKET-NAME/episodes/2025-11-13_daily_rohit_news.mp3
aws s3 rm s3://YOUR-BUCKET-NAME/episodes/2025-11-13_manifest.json
```

---

## Check Vercel Deployment Status

1. Go to https://vercel.com/dashboard
2. Find your project
3. Check **Deployments** tab
4. Look for the latest commit: "fix: Force overwrite on manual Run Now clicks"
5. Status should be **Ready** (green checkmark)

If it's still **Building** or **Failed**, that's why it's not working.

---

## What Should Happen (When Working)

When you click "Run Now":
1. Modal opens immediately
2. Shows "Ingestion - Fetching news from RSS feeds" (~30s)
3. Shows "Ranking - Analyzing and ranking stories" (~20s)
4. Shows "Scriptwriting - Writing conversational script" (~30s)
5. Shows "TTS & Audio" (~60-90s)
6. Shows "Complete - Episode generated" 
7. **Total time: 2-3 minutes**

If it completes in **< 5 seconds**, it's returning a cached episode.

---

## Still Not Working?

Tell me:
1. What does the **Network tab** show in the request payload?
2. What does the **Console tab** show when you click Run Now?
3. What's the Vercel deployment status?

And I'll dig deeper into why force_overwrite isn't working.


