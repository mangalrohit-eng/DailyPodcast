# S3 Public Access Setup Guide

## Problem
Episode files uploaded to S3 return "Access Denied" errors when accessed via URL.

## Root Cause
S3 objects are private by default. We need to:
1. ✅ Set ACL to `public-read` when uploading (CODE FIX APPLIED)
2. ⚠️ Configure S3 bucket for public access (YOU NEED TO DO THIS)

---

## AWS S3 Bucket Configuration Steps

### Step 1: Disable Block Public Access

1. Go to **AWS S3 Console**: https://s3.console.aws.amazon.com/
2. Click on your bucket: `daily-podcast-episodes` (or whatever name you used)
3. Go to **Permissions** tab
4. Find **Block public access (bucket settings)**
5. Click **Edit**
6. **UNCHECK** all 4 options:
   - ❌ Block all public access
   - ❌ Block public access to buckets and objects granted through new access control lists (ACLs)
   - ❌ Block public access to buckets and objects granted through any access control lists (ACLs)
   - ❌ Block public access to buckets and objects granted through new public bucket or access point policies
   - ❌ Block public and cross-account access to buckets and objects through any public bucket or access point policies
7. Click **Save changes**
8. Type `confirm` and click **Confirm**

---

### Step 2: Add Bucket Policy for Public Read Access

1. Still in **Permissions** tab of your bucket
2. Scroll down to **Bucket policy**
3. Click **Edit**
4. Paste this policy (replace `YOUR-BUCKET-NAME` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

**Example** (if your bucket is `daily-podcast-episodes`):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::daily-podcast-episodes/*"
    }
  ]
}
```

5. Click **Save changes**

---

### Step 3: Enable ACLs (if needed)

Some newer S3 buckets have ACLs disabled by default. To enable:

1. In your bucket, go to **Permissions** tab
2. Scroll to **Object Ownership**
3. Click **Edit**
4. Select **ACLs enabled**
5. Select **Bucket owner preferred**
6. Check the acknowledgment box
7. Click **Save changes**

---

### Step 4: Update IAM User Permissions (if using IAM)

If you created an IAM user for S3 access, ensure it has these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME",
        "arn:aws:s3:::YOUR-BUCKET-NAME/*"
      ]
    }
  ]
}
```

Note the **`s3:PutObjectAcl`** permission - this allows setting ACLs when uploading.

---

## Verification Steps

### Test 1: Upload a test file
```bash
# In your AWS CLI or S3 console, upload a test file
aws s3 cp test.txt s3://YOUR-BUCKET-NAME/test.txt --acl public-read
```

### Test 2: Try accessing it
```bash
# Should NOT return Access Denied
curl https://YOUR-BUCKET-NAME.s3.YOUR-REGION.amazonaws.com/test.txt
```

### Test 3: Re-run Episode Generation
1. Go to dashboard: `/dashboard`
2. Click **"Run Now"**
3. Wait for success
4. Click **Play** button on the episode
5. Should play audio instead of showing "Access Denied"

---

## Alternative: Make Existing Files Public

If you already have episodes uploaded that are private, you can make them public:

### Option A: Via AWS Console
1. Go to your S3 bucket
2. Select the `episodes/` folder (or individual files)
3. Click **Actions** → **Make public using ACL**
4. Confirm

### Option B: Via AWS CLI
```bash
# Make all episode files public
aws s3 sync s3://YOUR-BUCKET-NAME/episodes/ s3://YOUR-BUCKET-NAME/episodes/ \
  --acl public-read \
  --exclude "*" \
  --include "*.mp3"
```

---

## Security Considerations

### ✅ Safe for Podcast Episodes
- Podcast MP3 files are **meant to be publicly accessible**
- RSS feeds require public URLs for audio files
- This is standard for podcast hosting

### 🔒 Keep These Private
- **DO NOT** make your entire bucket public if it contains:
  - User data
  - Configuration files with secrets
  - Internal manifests with sensitive info

### Recommended Structure
```
your-bucket/
├── episodes/          ← PUBLIC (MP3 files)
│   ├── 2025-11-12_daily_rohit_news.mp3
│   └── 2025-11-13_daily_rohit_news.mp3
├── podcast/           ← PUBLIC (feed.xml)
│   └── feed.xml
├── runs/              ← PRIVATE (manifests, logs)
│   ├── 2025-11-12/
│   └── index.json
└── config/            ← PRIVATE (settings)
    └── config.json
```

**Solution**: Use a bucket policy that only makes `episodes/*` and `podcast/*` public:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadPodcastFiles",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::YOUR-BUCKET-NAME/episodes/*",
        "arn:aws:s3:::YOUR-BUCKET-NAME/podcast/*"
      ]
    }
  ]
}
```

This way, only podcast files are public, while configs and manifests stay private.

---

## Common Errors & Fixes

### Error: "AccessDenied"
**Cause**: Bucket policy not set or Block Public Access enabled  
**Fix**: Follow Steps 1 & 2 above

### Error: "InvalidAccessControlList"
**Cause**: ACLs disabled on bucket  
**Fix**: Follow Step 3 above

### Error: "AccessControlListNotSupported"
**Cause**: Bucket created with ACLs disabled  
**Fix**: Either enable ACLs (Step 3) OR remove `ACL: 'public-read'` from code and rely solely on bucket policy

### Error: 403 Forbidden
**Cause**: IAM user lacks `s3:PutObjectAcl` permission  
**Fix**: Update IAM policy (Step 4)

---

## Quick Fix Commands (All-in-One)

If you just want to make it work quickly:

```bash
# 1. Make bucket public-readable
aws s3api put-bucket-policy --bucket YOUR-BUCKET-NAME --policy '{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/episodes/*"
  }]
}'

# 2. Make all existing episode files public
aws s3 sync s3://YOUR-BUCKET-NAME/episodes/ s3://YOUR-BUCKET-NAME/episodes/ \
  --acl public-read --exclude "*" --include "*.mp3"

# 3. Make feed public
aws s3 cp s3://YOUR-BUCKET-NAME/podcast/feed.xml s3://YOUR-BUCKET-NAME/podcast/feed.xml \
  --acl public-read
```

---

## Need Help?

**Check current bucket policy:**
```bash
aws s3api get-bucket-policy --bucket YOUR-BUCKET-NAME
```

**Check if object is public:**
```bash
aws s3api get-object-acl --bucket YOUR-BUCKET-NAME --key episodes/FILENAME.mp3
```

**List all objects:**
```bash
aws s3 ls s3://YOUR-BUCKET-NAME/episodes/ --recursive
```

---

## Summary

✅ **Code fix applied**: Objects now upload with `ACL: 'public-read'`  
⚠️ **You need to do**: Configure S3 bucket permissions (Steps 1-3 above)  
🎯 **Result**: Episode URLs will be publicly accessible  

**After completing Steps 1-3, redeploy and generate a new episode to test!**

