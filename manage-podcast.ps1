# Podcast Management Utility
# Manage your Daily Personal News Podcast

$BASE_URL = "https://daily-podcast-brown.vercel.app"

function Show-Menu {
    Write-Host ""
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host "  Podcast Management Menu" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Generate Today's Episode" -ForegroundColor Yellow
    Write-Host "2. Generate Specific Date Episode" -ForegroundColor Yellow
    Write-Host "3. Check Podcast Feed" -ForegroundColor Yellow
    Write-Host "4. List All Episodes" -ForegroundColor Yellow
    Write-Host "5. Play Episode by Date" -ForegroundColor Yellow
    Write-Host "6. Check System Health" -ForegroundColor Yellow
    Write-Host "7. Force Regenerate Episode" -ForegroundColor Yellow
    Write-Host "8. Exit" -ForegroundColor Yellow
    Write-Host ""
}

function Generate-Episode {
    param (
        [string]$Date = "",
        [bool]$Force = $false
    )
    
    Write-Host ""
    Write-Host "⏳ Generating episode..." -ForegroundColor Cyan
    if ($Date) {
        Write-Host "   Date: $Date" -ForegroundColor Gray
    } else {
        Write-Host "   Date: Today" -ForegroundColor Gray
    }
    Write-Host "   This takes 2-5 minutes. Please wait..." -ForegroundColor Gray
    Write-Host ""
    
    try {
        $uri = "$BASE_URL/api/run"
        if ($Date) {
            $uri += "?date=$Date"
        }
        if ($Force) {
            $uri += if ($Date) { "&force=true" } else { "?force=true" }
        }
        
        $result = Invoke-RestMethod -Uri $uri -Method Post -TimeoutSec 300
        
        if ($result.success) {
            Write-Host "✅ Episode Generated Successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Episode Details:" -ForegroundColor Cyan
            Write-Host "  Date: $($result.episode.date)" -ForegroundColor White
            Write-Host "  Duration: $($result.episode.duration_sec) seconds (~$([math]::Round($result.episode.duration_sec/60, 1)) minutes)" -ForegroundColor White
            Write-Host "  Word Count: $($result.episode.word_count)" -ForegroundColor White
            Write-Host "  URL: $($result.episode.url)" -ForegroundColor White
            Write-Host ""
            Write-Host "📱 Play URL: $BASE_URL/podcast/episodes/$($result.episode.date).mp3" -ForegroundColor Cyan
            Write-Host ""
        } else {
            Write-Host "❌ Episode Generation Failed!" -ForegroundColor Red
            Write-Host "Error: $($result.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Episode Generation Failed: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Common issues:" -ForegroundColor Yellow
        Write-Host "  - Function timeout (upgrade to Vercel Pro for 300s timeout)" -ForegroundColor Gray
        Write-Host "  - OpenAI API rate limits or insufficient credits" -ForegroundColor Gray
        Write-Host "  - Storage not configured properly" -ForegroundColor Gray
        Write-Host "  - No news stories found in the time window" -ForegroundColor Gray
    }
}

function Check-Feed {
    Write-Host ""
    Write-Host "📡 Checking Podcast Feed..." -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $feed = Invoke-WebRequest -Uri "$BASE_URL/podcast/feed.xml" -Method Get
        
        if ($feed.StatusCode -eq 200) {
            Write-Host "✅ Feed Available!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Feed URL:" -ForegroundColor Cyan
            Write-Host "  $BASE_URL/podcast/feed.xml" -ForegroundColor White
            Write-Host ""
            
            # Parse episode count from XML
            $xml = [xml]$feed.Content
            $episodes = $xml.rss.channel.item
            
            if ($episodes) {
                Write-Host "Episodes in Feed: $($episodes.Count)" -ForegroundColor Cyan
                Write-Host ""
                Write-Host "Recent Episodes:" -ForegroundColor Yellow
                $episodes | Select-Object -First 5 | ForEach-Object {
                    Write-Host "  - $($_.title)" -ForegroundColor White
                    Write-Host "    Date: $($_.pubDate)" -ForegroundColor Gray
                    Write-Host "    Duration: $(Format-Duration $_.enclosure.length)" -ForegroundColor Gray
                    Write-Host ""
                }
            } else {
                Write-Host "⚠️  Feed is empty. Generate your first episode!" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "❌ Feed Not Found: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "Generate your first episode to create the feed." -ForegroundColor Yellow
    }
}

function List-Episodes {
    Write-Host ""
    Write-Host "📚 All Episodes:" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $feed = Invoke-WebRequest -Uri "$BASE_URL/podcast/feed.xml" -Method Get
        $xml = [xml]$feed.Content
        $episodes = $xml.rss.channel.item
        
        if ($episodes) {
            $episodes | ForEach-Object {
                # Extract date from title or URL
                $date = if ($_.title -match '\d{4}-\d{2}-\d{2}') { $matches[0] } else { "Unknown" }
                
                Write-Host "📅 $date" -ForegroundColor Yellow
                Write-Host "   Title: $($_.title)" -ForegroundColor White
                Write-Host "   Published: $($_.pubDate)" -ForegroundColor Gray
                Write-Host "   Play: $BASE_URL/podcast/episodes/$date.mp3" -ForegroundColor Cyan
                Write-Host ""
            }
        } else {
            Write-Host "⚠️  No episodes found. Generate your first episode!" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "❌ Could not list episodes: $_" -ForegroundColor Red
    }
}

function Play-Episode {
    param ([string]$Date)
    
    Write-Host ""
    Write-Host "🎵 Opening episode for $Date..." -ForegroundColor Cyan
    Write-Host ""
    
    $url = "$BASE_URL/podcast/episodes/$Date.mp3"
    Write-Host "URL: $url" -ForegroundColor Gray
    Write-Host ""
    
    try {
        # Check if episode exists
        $response = Invoke-WebRequest -Uri $url -Method Head -ErrorAction Stop
        Write-Host "✅ Episode found! Opening in default player..." -ForegroundColor Green
        Start-Process $url
    } catch {
        Write-Host "❌ Episode not found for date: $Date" -ForegroundColor Red
        Write-Host ""
        Write-Host "Generate the episode first or check available dates." -ForegroundColor Yellow
    }
}

function Check-Health {
    Write-Host ""
    Write-Host "🏥 Checking System Health..." -ForegroundColor Cyan
    Write-Host ""
    
    try {
        $health = Invoke-RestMethod -Uri "$BASE_URL/api/health-simple" -Method Get
        
        Write-Host "Status: $($health.status)" -ForegroundColor $(if ($health.status -eq "healthy") { "Green" } else { "Red" })
        Write-Host ""
        Write-Host "System Checks:" -ForegroundColor Cyan
        Write-Host "  OpenAI API: $($health.checks.openai)" -ForegroundColor $(if ($health.checks.openai -eq "configured") { "Green" } else { "Red" })
        Write-Host "  Blob Storage: $($health.checks.blob_storage)" -ForegroundColor $(if ($health.checks.blob_storage -eq "configured") { "Green" } else { "Red" })
        Write-Host ""
        
        if ($health.status -ne "healthy") {
            Write-Host "⚠️  System not healthy. Check Vercel environment variables." -ForegroundColor Yellow
        } else {
            Write-Host "✅ All systems operational!" -ForegroundColor Green
        }
    } catch {
        Write-Host "❌ Health check failed: $_" -ForegroundColor Red
    }
}

# Main Script
Clear-Host
Write-Host ""
Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Daily Personal News Podcast Manager  ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Podcast URL: $BASE_URL" -ForegroundColor Gray
Write-Host "Feed: $BASE_URL/podcast/feed.xml" -ForegroundColor Gray
Write-Host ""

# Check if any arguments provided
if ($args.Count -gt 0) {
    switch ($args[0]) {
        "generate" { Generate-Episode -Date $args[1] }
        "feed" { Check-Feed }
        "list" { List-Episodes }
        "play" { Play-Episode -Date $args[1] }
        "health" { Check-Health }
        default { Write-Host "Unknown command: $($args[0])" -ForegroundColor Red }
    }
    exit
}

# Interactive menu
do {
    Show-Menu
    $choice = Read-Host "Enter your choice (1-8)"
    
    switch ($choice) {
        "1" {
            Generate-Episode
            Read-Host "Press Enter to continue"
        }
        "2" {
            $date = Read-Host "Enter date (YYYY-MM-DD)"
            if ($date -match '^\d{4}-\d{2}-\d{2}$') {
                Generate-Episode -Date $date
            } else {
                Write-Host "❌ Invalid date format. Use YYYY-MM-DD" -ForegroundColor Red
            }
            Read-Host "Press Enter to continue"
        }
        "3" {
            Check-Feed
            Read-Host "Press Enter to continue"
        }
        "4" {
            List-Episodes
            Read-Host "Press Enter to continue"
        }
        "5" {
            $date = Read-Host "Enter date (YYYY-MM-DD)"
            if ($date -match '^\d{4}-\d{2}-\d{2}$') {
                Play-Episode -Date $date
            } else {
                Write-Host "❌ Invalid date format. Use YYYY-MM-DD" -ForegroundColor Red
            }
            Read-Host "Press Enter to continue"
        }
        "6" {
            Check-Health
            Read-Host "Press Enter to continue"
        }
        "7" {
            $date = Read-Host "Enter date (YYYY-MM-DD) or leave blank for today"
            if ([string]::IsNullOrWhiteSpace($date) -or $date -match '^\d{4}-\d{2}-\d{2}$') {
                Generate-Episode -Date $date -Force $true
            } else {
                Write-Host "❌ Invalid date format. Use YYYY-MM-DD" -ForegroundColor Red
            }
            Read-Host "Press Enter to continue"
        }
        "8" {
            Write-Host ""
            Write-Host "Goodbye! 👋" -ForegroundColor Cyan
            Write-Host ""
            return
        }
        default {
            Write-Host "Invalid choice. Please select 1-8." -ForegroundColor Red
            Start-Sleep -Seconds 1
        }
    }
    
    Clear-Host
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║   Daily Personal News Podcast Manager  ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Podcast URL: $BASE_URL" -ForegroundColor Gray
    Write-Host ""
    
} while ($true)

