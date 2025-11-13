# Test and generate first podcast episode
# Update the URL below with your Vercel project URL

$BASE_URL = "https://daily-podcast-brown.vercel.app"

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Daily Podcast Deployment Test" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 4: Test Health
Write-Host "Step 4: Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/api/health-simple" -Method Get
    Write-Host "✅ Health Check Successful!" -ForegroundColor Green
    Write-Host ($health | ConvertTo-Json -Depth 10)
    Write-Host ""
} catch {
    Write-Host "❌ Health Check Failed: $_" -ForegroundColor Red
    exit 1
}

# Check if OpenAI is configured
if ($health.checks.openai -ne "configured") {
    Write-Host "❌ OpenAI API key not configured!" -ForegroundColor Red
    Write-Host "Please set OPENAI_API_KEY in Vercel Settings > Environment Variables" -ForegroundColor Yellow
    exit 1
}

# Check if Blob Storage is configured
if ($health.checks.blob_storage -ne "configured") {
    Write-Host "❌ Blob Storage not configured!" -ForegroundColor Red
    Write-Host "Please create Blob Storage in Vercel Project > Storage" -ForegroundColor Yellow
    exit 1
}

# Step 5: Generate First Episode
Write-Host "Step 5: Generating First Episode..." -ForegroundColor Yellow
Write-Host "⏳ This will take 2-5 minutes. Please wait..." -ForegroundColor Cyan
Write-Host ""

try {
    $result = Invoke-RestMethod -Uri "$BASE_URL/api/run" -Method Post -TimeoutSec 300
    
    if ($result.success) {
        Write-Host "✅ Episode Generated Successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Episode Details:" -ForegroundColor Cyan
        Write-Host "  Date: $($result.episode.date)"
        Write-Host "  Duration: $($result.episode.duration_sec) seconds (~$([math]::Round($result.episode.duration_sec/60, 1)) minutes)"
        Write-Host "  Word Count: $($result.episode.word_count)"
        Write-Host "  URL: $($result.episode.url)"
        Write-Host ""
        Write-Host "Metrics:" -ForegroundColor Cyan
        Write-Host "  Total Time: $([math]::Round($result.metrics.total_time_ms/1000, 1)) seconds"
        Write-Host ""
    } else {
        Write-Host "❌ Episode Generation Failed!" -ForegroundColor Red
        Write-Host "Error: $($result.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Episode Generation Failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "  - Function timeout (Vercel free tier has 10s limit on Hobby plan)" -ForegroundColor Yellow
    Write-Host "  - OpenAI API rate limits or no credits" -ForegroundColor Yellow
    Write-Host "  - Storage not configured" -ForegroundColor Yellow
    exit 1
}

# Step 6: Check Feed
Write-Host "Step 6: Checking Podcast Feed..." -ForegroundColor Yellow
try {
    $feed = Invoke-WebRequest -Uri "$BASE_URL/podcast/feed.xml" -Method Get
    
    if ($feed.StatusCode -eq 200) {
        Write-Host "✅ Podcast Feed Available!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 SUCCESS! Your podcast is ready!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📱 Subscribe to your podcast feed:" -ForegroundColor Cyan
        Write-Host "   $BASE_URL/podcast/feed.xml" -ForegroundColor White
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "  1. Copy the feed URL above" -ForegroundColor White
        Write-Host "  2. Add it to your podcast app (Apple Podcasts, Overcast, etc.)" -ForegroundColor White
        Write-Host "  3. New episodes will generate automatically every day at 12:00 UTC" -ForegroundColor White
        Write-Host ""
    }
} catch {
    Write-Host "❌ Feed Check Failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ All Tests Passed!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan

