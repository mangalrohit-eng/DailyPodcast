# Pipeline Report UI - Implementation Plan

## Overview
Transform the current `alert()` in `viewRunDetails()` into a rich, tabbed modal showing all generation details.

## Current State
```javascript
// Line 1720 in dashboard.html
alert(`Run Details: ${runId}...`); // ❌ Not helpful!
```

## Target State
```
┌─────────────────────────────────────────────────────────────┐
│  Episode Generation Report - 2025-11-13                     │
│  ┌─────┬─────────┬────────┬──────┬────────┬────────┐      │
│  │ 📥  │ 🎯      │ 📝     │ ✅   │ 🛡️   │ 🎵     │      │
│  │Ingest│ Ranking │ Script │ Fact │ Safety│ Audio  │      │
│  └─────┴─────────┴────────┴──────┴────────┴────────┘      │
│                                                              │
│  [Tab Content Showing Details]                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Add Modal HTML (After line 640)

```html
<!-- Pipeline Report Modal -->
<div id="pipelineReportModal" class="modal" style="display: none;">
    <div class="modal-content" style="max-width: 1200px; height: 90vh;">
        <div class="modal-header">
            <h2 id="reportTitle">Episode Generation Report</h2>
            <button class="modal-close" onclick="hidePipelineReport()">&times;</button>
        </div>
        
        <!-- Tab Navigation -->
        <div class="report-tabs">
            <button class="report-tab active" onclick="switchReportTab('ingestion')">
                📥 Ingestion
            </button>
            <button class="report-tab" onclick="switchReportTab('ranking')">
                🎯 Ranking
            </button>
            <button class="report-tab" onclick="switchReportTab('outline')">
                📋 Outline
            </button>
            <button class="report-tab" onclick="switchReportTab('script')">
                📝 Script
            </button>
            <button class="report-tab" onclick="switchReportTab('factcheck')">
                ✅ Fact Check
            </button>
            <button class="report-tab" onclick="switchReportTab('safety')">
                🛡️ Safety
            </button>
        </div>
        
        <!-- Tab Content -->
        <div class="report-content">
            <!-- Ingestion Tab -->
            <div id="tab-ingestion" class="report-tab-content active">
                <div id="ingestionContent"></div>
            </div>
            
            <!-- Ranking Tab -->
            <div id="tab-ranking" class="report-tab-content">
                <div id="rankingContent"></div>
            </div>
            
            <!-- Outline Tab -->
            <div id="tab-outline" class="report-tab-content">
                <div id="outlineContent"></div>
            </div>
            
            <!-- Script Tab -->
            <div id="tab-script" class="report-tab-content">
                <div id="scriptContent"></div>
            </div>
            
            <!-- Fact Check Tab -->
            <div id="tab-factcheck" class="report-tab-content">
                <div id="factcheckContent"></div>
            </div>
            
            <!-- Safety Tab -->
            <div id="tab-safety" class="report-tab-content">
                <div id="safetyContent"></div>
            </div>
        </div>
    </div>
</div>
```

### Step 2: Add CSS Styles (In `<style>` section)

```css
.report-tabs {
    display: flex;
    gap: 5px;
    padding: 10px;
    background: #f8f9fa;
    border-bottom: 2px solid #e0e0e0;
    overflow-x: auto;
}

.report-tab {
    padding: 10px 20px;
    border: none;
    background: white;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    font-size: 14px;
    white-space: nowrap;
}

.report-tab.active {
    background: #007bff;
    color: white;
}

.report-tab:hover:not(.active) {
    background: #e9ecef;
}

.report-content {
    padding: 20px;
    overflow-y: auto;
    max-height: calc(90vh - 200px);
}

.report-tab-content {
    display: none;
}

.report-tab-content.active {
    display: block;
}

.report-section {
    margin-bottom: 30px;
}

.report-section h3 {
    color: #333;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 2px solid #007bff;
}

.source-item {
    padding: 10px;
    margin: 5px 0;
    background: #f8f9fa;
    border-left: 4px solid #28a745;
    border-radius: 4px;
}

.source-item.failed {
    border-left-color: #dc3545;
}

.story-item {
    padding: 12px;
    margin: 8px 0;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
}

.story-item .title {
    font-weight: 600;
    margin-bottom: 5px;
}

.story-item .meta {
    font-size: 12px;
    color: #666;
}

.topic-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    margin-right: 5px;
}

.topic-AI { background: #e3f2fd; color: #1976d2; }
.topic-Verizon { background: #ffebee; color: #c62828; }
.topic-Accenture { background: #f3e5f5; color: #7b1fa2; }

.score-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: #e9ecef;
    color: #495057;
}
```

### Step 3: Replace viewRunDetails() Function (Line 1713)

```javascript
async function viewRunDetails(runId) {
    try {
        const response = await fetch(`${API_BASE}/api/runs?runId=${runId}`, {
            headers: getAuthHeaders(),
        });
        const data = await response.json();
        
        // Show modal with pipeline report
        showPipelineReport(runId, data);
    } catch (error) {
        showToast('Failed to load run details', 'error');
        console.error(error);
    }
}

function showPipelineReport(runId, data) {
    const modal = document.getElementById('pipelineReportModal');
    const title = document.getElementById('reportTitle');
    
    title.textContent = `Episode Report - ${runId}`;
    
    // Populate tabs with data
    if (data.manifest && data.manifest.pipeline_report) {
        const report = data.manifest.pipeline_report;
        
        renderIngestionTab(report.ingestion);
        renderRankingTab(report.ranking);
        renderOutlineTab(report.outline);
        renderScriptTab(report.scriptwriting);
        renderFactCheckTab(report.factcheck);
        renderSafetyTab(report.safety);
    } else {
        // No pipeline report available
        document.getElementById('ingestionContent').innerHTML = 
            '<p style="color: #666;">Pipeline report not available for this episode.</p>';
    }
    
    modal.style.display = 'flex';
}

function hidePipelineReport() {
    document.getElementById('pipelineReportModal').style.display = 'none';
}

function switchReportTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.report-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.report-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`tab-${tabName}`).classList.add('active');
}
```

### Step 4: Add Tab Rendering Functions

```javascript
function renderIngestionTab(ingestion) {
    if (!ingestion) return;
    
    const html = `
        <div class="report-section">
            <h3>📊 Summary</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div class="stat-card">
                    <div class="stat-value">${ingestion.total_items_before_filter || 0}</div>
                    <div class="stat-label">Items Found</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(ingestion.topics_breakdown && Object.values(ingestion.topics_breakdown).reduce((a,b) => a+b, 0)) || 0}</div>
                    <div class="stat-label">Stories Accepted</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(ingestion.filtered_out || []).length}</div>
                    <div class="stat-label">Stories Filtered</div>
                </div>
            </div>
        </div>
        
        <div class="report-section">
            <h3>📰 Sources Scanned</h3>
            ${(ingestion.sources_scanned || []).map(source => `
                <div class="source-item ${source.status.includes('Failed') ? 'failed' : ''}">
                    <strong>${source.name}</strong><br>
                    <small style="color: #666;">${source.url}</small><br>
                    <small>Found: ${source.items_found} items - ${source.status}</small>
                </div>
            `).join('')}
        </div>
        
        <div class="report-section">
            <h3>📊 Topic Breakdown</h3>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                ${Object.entries(ingestion.topics_breakdown || {}).map(([topic, count]) => `
                    <div style="padding: 15px; background: white; border-radius: 8px; border: 2px solid #e0e0e0;">
                        <div style="font-size: 24px; font-weight: bold; color: #007bff;">${count}</div>
                        <div style="color: #666;">${topic}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="report-section">
            <h3>❌ Filtered Out (Top 20)</h3>
            ${(ingestion.filtered_out || []).slice(0, 20).map(item => `
                <div style="padding: 10px; margin: 5px 0; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
                    <strong>${item.title}</strong><br>
                    <small style="color: #856404;">Reason: ${item.reason}</small>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('ingestionContent').innerHTML = html;
}

function renderRankingTab(ranking) {
    if (!ranking) return;
    
    const html = `
        <div class="report-section">
            <h3>✅ Selected Stories</h3>
            ${(ranking.top_picks || []).map((pick, idx) => `
                <div class="story-item" style="border-left: 4px solid #28a745;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <span style="color: #28a745; font-weight: bold; margin-right: 10px;">#${idx + 1}</span>
                            <span class="topic-badge topic-${pick.topic}">${pick.topic}</span>
                            <span class="score-badge">Score: ${pick.score}</span>
                        </div>
                    </div>
                    <div class="title">${pick.title}</div>
                    <div class="meta">
                        <strong>Why selected:</strong> ${pick.why_selected}
                    </div>
                </div>
            `).join('')}
        </div>
        
        <div class="report-section">
            <h3>❌ Rejected Stories (Top 20)</h3>
            ${(ranking.rejected_stories || []).slice(0, 20).map(story => `
                <div class="story-item" style="border-left: 4px solid #dc3545; opacity: 0.7;">
                    <div class="title">${story.title}</div>
                    <div class="meta">
                        <span class="score-badge">Score: ${story.score}</span>
                        <span style="margin-left: 10px; color: #dc3545;">${story.reason}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('rankingContent').innerHTML = html;
}

function renderScriptTab(scriptwriting) {
    if (!scriptwriting) return;
    
    const html = `
        <div class="report-section">
            <h3>📊 Stats</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                <div class="stat-card">
                    <div class="stat-value">${scriptwriting.sections_generated || 0}</div>
                    <div class="stat-label">Sections</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${scriptwriting.total_word_count || 0}</div>
                    <div class="stat-label">Words</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${(scriptwriting.citations_used || []).length}</div>
                    <div class="stat-label">Citations</div>
                </div>
            </div>
        </div>
        
        <div class="report-section">
            <h3>📝 Full Script</h3>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; white-space: pre-wrap; font-family: 'Georgia', serif; line-height: 1.8;">
${scriptwriting.full_script_text || 'Script not available'}
            </div>
        </div>
    `;
    
    document.getElementById('scriptContent').innerHTML = html;
}

// Add similar functions for outline, factcheck, safety tabs
```

---

## Estimated Implementation Time
- **Full Implementation**: 30-45 minutes
- **Testing**: 15 minutes
- **Total**: ~1 hour

## Benefits
✅ See exactly what stories were found  
✅ Understand why stories were filtered  
✅ See topic distribution at every stage  
✅ Review selected vs rejected stories  
✅ Read full script and see changes  
✅ Debug why certain topics are missing  

## Next Steps

**Option A: Implement Now (Recommended)**
- I'll add all the code to dashboard.html
- Deploy and test immediately
- You can see details in next episode

**Option B: Implement Later**
- Use Vercel logs for now (still very detailed)
- Implement UI when you have time to test

**Which would you prefer?**


