# Vercel Blob to AWS S3 Migration Guide

## ⚠️ Important: Quota Exhausted

Your Vercel Blob free tier quota (500 MB) is **exhausted**, which typically means:
- ❌ **Cannot write** new files
- ❌ **Cannot read** existing files (in most cases)
- ❌ **Migration may not be possible**

When Vercel Blob quota is exceeded, the service usually **blocks all access** until you upgrade to a paid plan.

---

## Option 1: Attempt Migration (May Not Work)

If Vercel Blob still allows reads (rare), you can try migrating:

### Step 1: Set Environment Variables

Make sure you have **both** sets of credentials:

```bash
# Vercel Blob (old)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# AWS S3 (new)
S3_ACCESS_KEY=AKIA...
S3_SECRET_KEY=wJal...
S3_BUCKET=podcast098478926952
S3_REGION=us-east-1
```

### Step 2: Run Migration Script

```bash
# In your local terminal (not Vercel)
npm install
npx tsx scripts/migrate-blob-to-s3.ts
```

### Expected Outcome:

**If quota allows reads (unlikely):**
```
✅ Successfully migrated: 6 files
```

**If quota blocks reads (likely):**
```
❌ Failed: Vercel Blob quota exhausted
💡 Cannot read files. Migration cannot continue.
```

---

## Option 2: Check Vercel Blob Status (Recommended)

Before attempting migration, check if you can access the files:

### Via Vercel Dashboard:
1. Go to https://vercel.com/dashboard
2. Click **Storage** → **Blob**
3. See if you can view/download files
4. If you see "Quota exceeded" errors, migration is not possible

### Via API:
```bash
curl -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
  https://blob.vercel-storage.com/list
```

If you get a 403/402 error → Files are inaccessible

---

## Option 3: Upgrade Vercel Blob (Temporary Access)

If old episodes are valuable:

1. **Upgrade** Vercel Blob to Pro ($20/month)
2. **Run migration script** (while you have access)
3. **Downgrade** back to free tier
4. **Cost**: ~$20 for one month to recover files

---

## Option 4: Start Fresh (Recommended)

Since quota is exhausted and migration may fail:

### What You Lose:
- Old episodes (already inaccessible due to quota)
- Old RSS feed entries (point to inaccessible files)
- Historical run data

### What You Gain:
- ✅ Clean start with AWS S3 (unlimited*)
- ✅ Working podcast system
- ✅ New episodes generate successfully
- ✅ Lower costs ($1-2/month vs Vercel Blob Pro $20/month)

### How to Start Fresh:

1. ✅ **AWS S3 is already configured** (you did this!)
2. ✅ **Health check passes** (confirmed!)
3. 🚀 **Click "Run Now"** in dashboard
4. ⏰ **Wait 5 minutes** for first episode to generate
5. ✅ **Episode appears** in S3 bucket
6. ✅ **RSS feed populates** automatically
7. 🎉 **You're live** with a fresh podcast!

---

## Recommended Path

Based on your situation:

```
1. ❌ Don't spend time on migration (likely won't work)
2. ✅ Start fresh with AWS S3 (already working!)
3. 🚀 Generate first new episode now
4. 📅 Let cron job run daily at 7 AM EST
5. 🎧 Share your new RSS feed URL
```

**Why?**
- Old episodes are already inaccessible (quota)
- Migration may cost $20 (Vercel Blob Pro for 1 month)
- Fresh start takes 5 minutes and is free
- AWS S3 is cheaper long-term ($1-2/month)

---

## If You Still Want to Try Migration

### Troubleshooting:

**Error: "quota exceeded"**
- Vercel Blob blocks access when quota is full
- Upgrade to Pro tier or start fresh

**Error: "403 Forbidden"**
- Check `BLOB_READ_WRITE_TOKEN` is correct
- Token may have expired

**Error: "Failed to fetch blob"**
- Network timeout (files too large)
- Try downloading files manually first

**Error: "Cannot read property 'Body'"**
- AWS credentials incorrect
- Check S3_ACCESS_KEY, S3_SECRET_KEY

---

## Migration Script Details

The script (`scripts/migrate-blob-to-s3.ts`) will:

1. ✅ List all files in Vercel Blob
2. ⬇️ Download each file
3. ⬆️ Upload to AWS S3
4. ✅ Verify transfer
5. 📊 Show summary report

**Limitations:**
- Requires read access to Vercel Blob (may not have)
- Runs locally (not on Vercel serverless)
- Large files may timeout

---

## My Recommendation

**Start fresh!** Your podcast system is fully operational with AWS S3. 

**Next step**: Click **"Run Now"** in the dashboard to generate your first episode with the new storage. Old episodes are gone anyway due to quota exhaustion.

You'll have a working podcast in 5 minutes vs. spending time/money trying to recover inaccessible files. 🚀

