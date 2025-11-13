# Quick Script to Generate Your First Episode
# This will create today's episode on your podcast

$BASE_URL = "https://daily-podcast-brown.vercel.app"

Write-Host ""
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Generate Your First Podcast Episode  " -ForegroundColor Cyan
Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Health
Write-Host "Step 1: Checking System Health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/api/health-simple" -Method Get
    
    if ($health.status -eq "healthy") {
        Write-Host "✅ System is healthy!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  System status: $($health.status)" -ForegroundColor Yellow
    }
    
    Write-Host "   OpenAI API: $($health.checks.openai)" -ForegroundColor Gray
    Write-Host "   Blob Storage: $($health.checks.blob_storage)" -ForegroundColor Gray
    Write-Host ""
    
    if ($health.checks.openai -ne "configured") {
        Write-Host "❌ OpenAI API key not configured!" -ForegroundColor Red
        Write-Host "Please set OPENAI_API_KEY in Vercel Settings > Environment Variables" -ForegroundColor Yellow
        exit 1
    }
    
    if ($health.checks.blob_storage -ne "configured") {
        Write-Host "❌ Blob Storage not configured!" -ForegroundColor Red
        Write-Host "Please create Blob Storage in Vercel Project > Storage" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ Health Check Failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Generate Episode
Write-Host "Step 2: Generating Today's Episode..." -ForegroundColor Yellow
Write-Host ""
Write-Host "⏳ This will take 2-5 minutes. Please be patient..." -ForegroundColor Cyan
Write-Host ""
Write-Host "What's happening:" -ForegroundColor Gray
Write-Host "  • Fetching news from AI, Verizon, and Accenture sources" -ForegroundColor Gray
Write-Host "  • Ranking and selecting top stories" -ForegroundColor Gray
Write-Host "  • Writing personalized script for you (Rohit)" -ForegroundColor Gray
Write-Host "  • Fact-checking and safety review" -ForegroundColor Gray
Write-Host "  • Generating audio with OpenAI TTS" -ForegroundColor Gray
Write-Host "  • Publishing to your feed" -ForegroundColor Gray
Write-Host ""

try {
    $result = Invoke-RestMethod -Uri "$BASE_URL/api/run" -Method Post -TimeoutSec 300
    
    if ($result.success) {
        Write-Host "✅ Episode Generated Successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "══════════════════════════════════════" -ForegroundColor Green
        Write-Host "         Episode Details" -ForegroundColor Green
        Write-Host "══════════════════════════════════════" -ForegroundColor Green
        Write-Host ""
        Write-Host "📅 Date: $($result.episode.date)" -ForegroundColor Cyan
        Write-Host "⏱️  Duration: $([math]::Round($result.episode.duration_sec/60, 1)) minutes ($($result.episode.duration_sec) seconds)" -ForegroundColor Cyan
        Write-Host "📝 Words: $($result.episode.word_count)" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "🎵 Play Episode:" -ForegroundColor Yellow
        Write-Host "   $BASE_URL/podcast/episodes/$($result.episode.date).mp3" -ForegroundColor White
        Write-Host ""
        Write-Host "📱 Subscribe to Feed:" -ForegroundColor Yellow
        Write-Host "   $BASE_URL/podcast/feed.xml" -ForegroundColor White
        Write-Host ""
        Write-Host "⚡ Generation Time: $([math]::Round($result.metrics.total_time_ms/1000, 1)) seconds" -ForegroundColor Gray
        Write-Host ""
        Write-Host "══════════════════════════════════════" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Success! Your first episode is ready!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next Steps:" -ForegroundColor Cyan
        Write-Host "  1. Copy the feed URL above" -ForegroundColor White
        Write-Host "  2. Add it to your podcast app (Apple Podcasts, Overcast, Pocket Casts, etc.)" -ForegroundColor White
        Write-Host "  3. New episodes will generate automatically every day at 12:00 UTC (7am EST)" -ForegroundColor White
        Write-Host ""
        Write-Host "💡 Tip: Use manage-podcast.ps1 for more options like:" -ForegroundColor Yellow
        Write-Host "   • Generate episodes for specific dates" -ForegroundColor Gray
        Write-Host "   • List all episodes" -ForegroundColor Gray
        Write-Host "   • Play episodes directly" -ForegroundColor Gray
        Write-Host ""
        
    } else {
        Write-Host "❌ Episode Generation Failed!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Error: $($result.error)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Common Issues:" -ForegroundColor Yellow
        Write-Host "  • No news stories found in the time window (try increasing window_hours)" -ForegroundColor Gray
        Write-Host "  • OpenAI API rate limits or low credits" -ForegroundColor Gray
        Write-Host "  • RSS feeds are temporarily unavailable" -ForegroundColor Gray
        Write-Host ""
        exit 1
    }
} catch {
    Write-Host "❌ Episode Generation Failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common Issues:" -ForegroundColor Yellow
    Write-Host "  • Function timeout (Vercel Hobby plan has 10s limit on /api/run)" -ForegroundColor Gray
    Write-Host "    Solution: Upgrade to Vercel Pro ($20/month) for 300s timeout" -ForegroundColor Gray
    Write-Host "  • OpenAI API rate limits or insufficient credits" -ForegroundColor Gray
    Write-Host "    Solution: Check https://platform.openai.com/account/billing" -ForegroundColor Gray
    Write-Host "  • Network timeout or connection issues" -ForegroundColor Gray
    Write-Host "    Solution: Try again in a few minutes" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

