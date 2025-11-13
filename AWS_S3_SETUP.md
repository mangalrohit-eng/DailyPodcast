# AWS S3 Storage Setup Guide

Your podcast system now uses **AWS S3** for storage instead of Vercel Blob.

## Required Environment Variables

Add these to your Vercel project settings (https://vercel.com/dashboard → Your Project → Settings → Environment Variables):

### AWS S3 Configuration

```bash
# AWS Credentials
S3_ACCESS_KEY=your_access_key_id
S3_SECRET_KEY=your_secret_access_key
S3_REGION=us-east-1                    # or your preferred region
S3_BUCKET=your-podcast-bucket-name

# Optional: For S3-compatible services (MinIO, DigitalOcean Spaces, etc.)
S3_ENDPOINT=https://your-endpoint.com  # Leave empty for standard AWS S3
```

### Other Required Variables (Keep these)

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# Podcast
PODCAST_BASE_URL=https://your-app.vercel.app

# Optional Dashboard Auth
DASHBOARD_TOKEN=your-secret-token
# OR
DASHBOARD_USER=admin
DASHBOARD_PASS=your-password
```

## AWS S3 Setup Steps

### Option 1: AWS S3 (Recommended)

1. **Create an AWS Account**
   - Go to https://aws.amazon.com
   - Sign up for an account (Free tier available)

2. **Create an S3 Bucket**
   ```bash
   - Go to S3 console: https://s3.console.aws.amazon.com/
   - Click "Create bucket"
   - Name: something like "rohit-daily-podcast"
   - Region: Choose closest to you (e.g., us-east-1)
   - Block Public Access: UNCHECK (we need public access for podcast files)
   - Click "Create bucket"
   ```

3. **Set Bucket Policy for Public Read**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadGetObject",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::rohit-daily-podcast/*"
       }
     ]
   }
   ```
   - Go to bucket → Permissions → Bucket Policy
   - Paste the above (replace `rohit-daily-podcast` with your bucket name)

4. **Create IAM User**
   ```bash
   - Go to IAM console: https://console.aws.amazon.com/iam/
   - Click "Users" → "Create user"
   - Name: "podcast-app"
   - Permissions: Attach "AmazonS3FullAccess" policy
   - Create access key → Application running outside AWS
   - Save the Access Key ID and Secret Access Key
   ```

5. **Set Vercel Environment Variables**
   ```bash
   S3_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
   S3_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   S3_REGION=us-east-1
   S3_BUCKET=rohit-daily-podcast
   # S3_ENDPOINT= (leave empty for AWS S3)
   ```

### Option 2: DigitalOcean Spaces (Cheaper Alternative)

1. **Create a DigitalOcean Account**
   - Go to https://www.digitalocean.com
   - $200 free credit for new users

2. **Create a Space**
   ```bash
   - Go to Spaces: https://cloud.digitalocean.com/spaces
   - Click "Create a Space"
   - Choose region (e.g., NYC3)
   - Name: rohit-podcast
   - Enable CDN
   - Click "Create a Space"
   ```

3. **Generate API Keys**
   ```bash
   - Go to API → Spaces Keys
   - Click "Generate New Key"
   - Name: podcast-app
   - Save the Access Key and Secret Key
   ```

4. **Set Vercel Environment Variables**
   ```bash
   S3_ACCESS_KEY=DO00ABC1234567890...
   S3_SECRET_KEY=xyz789...
   S3_REGION=nyc3
   S3_BUCKET=rohit-podcast
   S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
   ```

### Option 3: MinIO (Self-Hosted, Free)

If you have your own server:

```bash
# Install MinIO
docker run -p 9000:9000 -p 9001:9001 \
  -e "MINIO_ROOT_USER=admin" \
  -e "MINIO_ROOT_PASSWORD=password123" \
  quay.io/minio/minio server /data --console-address ":9001"

# Vercel Environment Variables
S3_ACCESS_KEY=admin
S3_SECRET_KEY=password123
S3_REGION=us-east-1
S3_BUCKET=podcast
S3_ENDPOINT=http://your-server-ip:9000
```

## Testing the Setup

1. **Deploy to Vercel**
   ```bash
   git add . && git commit -m "Switch to AWS S3 storage" && git push origin main
   ```

2. **Run Health Check**
   - Go to your dashboard: https://your-app.vercel.app/dashboard
   - Click "🏥 Run Full System Check"
   - Should show: ✅ **Vercel Blob Storage: PASS** (it still says "Blob" but it's actually S3)

3. **Index Existing Episodes**
   - If you have existing episodes in Vercel Blob, they're lost
   - Click "🔄 Index Existing Episodes" (will find 0 episodes initially)
   - Click "▶️ Run Now" to generate a new episode

4. **Verify S3 Storage**
   - Go to your S3 bucket
   - You should see:
     ```
     episodes/2025-11-13_daily_rohit_news.mp3
     runs/index.json
     ```

## Cost Comparison

### AWS S3
- Storage: $0.023/GB/month
- GET requests: $0.0004 per 1,000
- PUT requests: $0.005 per 1,000
- **Estimate**: ~$1-2/month for daily podcast

### DigitalOcean Spaces
- Flat rate: $5/month
- Includes 250 GB storage + 1 TB bandwidth
- **Better for**: Predictable costs

### MinIO (Self-hosted)
- Free (if you have a server)
- **Better for**: Full control, no cloud costs

## Troubleshooting

### "Access Denied" Errors
- Check IAM user permissions
- Verify bucket policy allows public read
- Confirm access keys are correct

### "Bucket does not exist"
- Verify bucket name matches `S3_BUCKET` env var
- Check region matches bucket location
- Ensure bucket is created in correct AWS account

### "Endpoint not found"
- For AWS S3, leave `S3_ENDPOINT` empty
- For DigitalOcean, use: `https://REGION.digitaloceanspaces.com`
- For MinIO, use: `http://your-server:9000`

### Still see Vercel Blob errors?
- Redeploy after setting env vars
- Wait 30 seconds for deployment
- Hard refresh browser (Ctrl+Shift+R)

## Migration from Vercel Blob

Since you don't have a Vercel Blob subscription, your existing episodes are **not accessible**. You'll need to:

1. ✅ Set up AWS S3 (follow steps above)
2. ✅ Deploy new code
3. ✅ Generate new episodes (old ones are lost)
4. ✅ RSS feed will start working once new episodes are generated

This is a **fresh start** - all previous episodes are gone, but going forward everything will work perfectly with S3.

