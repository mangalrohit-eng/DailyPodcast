# Pipeline Logging Implementation Roadmap

## User Request
Add comprehensive logging for each run showing:
- What sources were scanned
- What stories were fetched
- What were ignored and why
- Final script given to podcast generator

## Current State
✅ **Already Implemented (Partial):**
- `IngestionAgent` now tracks `detailed_report` with:
  - `sources_scanned` (name, url, items_found, status)
  - `total_items_before_filter`
  - `filtered_out` (title, reason)
  - `topics_breakdown`
- `PipelineReport` interface added to `EpisodeManifest`
- Progress tracker shows top 20 stories in agentData

##

 Remaining Work

### 1. Update RankingAgent (lib/agents/ranking.ts)
**Status:** ⏳ TODO

**Changes Needed:**
```typescript
export interface RankingOutput {
  picks: Pick[];
  detailed_report: {
    stories_ranked: number;
    top_picks: Array<{ 
      title: string; 
      topic: string; 
      score: number; 
      why_selected: string  // e.g., "Highest AI score (0.875)", "Diversity pick for Verizon"
    }>;
    rejected_stories: Array<{ 
      title: string; 
      score: number; 
      reason: string  // e.g., "Score too low (0.234)", "Too similar to selected story", "Below topic threshold"
    }>;
  };
}
```

**In `process()` method:**
- Track all scored stories
- For each pick, add `why_selected` reasoning
- For rejected stories (score < threshold or filtered out), log reason
- Return in `detailed_report`

---

### 2. Update OutlineAgent (lib/agents/outline.ts)
**Status:** ⏳ TODO

**Changes Needed:**
```typescript
export interface OutlineOutput {
  outline: Outline;
  detailed_report: {
    sections: Array<{ 
      type: string; 
      title: string; 
      target_words: number; 
      story_count: number;
      story_titles: string[];
    }>;
    total_duration_target: number;
  };
}
```

**In `process()` method:**
- Include story titles for each section
- Return duration target

---

### 3. Update ScriptwriterAgent (lib/agents/scriptwriter.ts)
**Status:** ⏳ TODO

**Changes Needed:**
```typescript
export interface ScriptwriterOutput {
  script: Script;
  detailed_report: {
    sections_generated: number;
    total_word_count: number;
    full_script_text: string;  // Complete generated script
    citations_used: number[];
    sections_detail: Array<{
      type: string;
      word_count: number;
      text_preview: string;  // First 100 chars
    }>;
  };
}
```

**In `process()` method:**
- Capture full script text
- Extract all citations used
- Generate section summaries
- Return in `detailed_report`

---

### 4. Update FactCheckAgent (lib/agents/factcheck.ts)
**Status:** ⏳ TODO

**Changes Needed:**
```typescript
export interface FactCheckOutput {
  script: Script;
  changes_made: string[];
  flags_raised: string[];
  detailed_report: {
    sections_checked: number;
    changes_by_section: Array<{
      section_type: string;
      changes: string[];
    }>;
    flags_by_section: Array<{
      section_type: string;
      flags: string[];
    }>;
  };
}
```

---

### 5. Update SafetyAgent (lib/agents/safety.ts)
**Status:** ⏳ TODO

**Changes Needed:**
```typescript
export interface SafetyOutput {
  script: Script;
  edits_made: string[];
  risk_level: 'low' | 'medium' | 'high';
  detailed_report: {
    sections_screened: number;
    risk_by_section: Array<{
      section_type: string;
      risk_level: string;
      edits: string[];
    }>;
  };
}
```

---

### 6. Update Orchestrator (lib/orchestrator.ts)
**Status:** ⏳ TODO

**Changes Needed in `run()` method:**

```typescript
// After all agents complete, compile pipeline_report
const pipelineReport: PipelineReport = {
  ingestion: ingestionResult.output.detailed_report,
  ranking: {
    stories_ranked: rankingResult.output.detailed_report.stories_ranked,
    top_picks: rankingResult.output.detailed_report.top_picks,
    rejected_stories: rankingResult.output.detailed_report.rejected_stories,
  },
  outline: {
    sections: outlineResult.output.detailed_report.sections,
    total_duration_target: outlineResult.output.detailed_report.total_duration_target,
  },
  scriptwriting: {
    sections_generated: scriptResult.output.detailed_report.sections_generated,
    total_word_count: scriptResult.output.detailed_report.total_word_count,
    full_script_text: scriptResult.output.detailed_report.full_script_text,
    citations_used: scriptResult.output.detailed_report.citations_used,
  },
  factcheck: {
    changes_made: factCheckResult.output.changes_made,
    flags_raised: factCheckResult.output.flags_raised,
  },
  safety: {
    edits_made: safetyResult.output.edits_made,
    risk_level: safetyResult.output.risk_level,
  },
};

// Add to manifest
manifest.pipeline_report = pipelineReport;

// Save detailed report to separate file for easy viewing
await this.storage.put(
  `runs/${runId}/pipeline_report.json`,
  JSON.stringify(pipelineReport, null, 2),
  'application/json'
);
```

---

### 7. Add API Endpoint for Reports
**Status:** ⏳ TODO

**New file: `api/reports.ts`**

```typescript
import { VercelRequest, VercelResponse } from '@vercel/node';
import { StorageTool } from '../lib/tools/storage';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { runId } = req.query;
  
  if (!runId || typeof runId !== 'string') {
    return res.status(400).json({ error: 'runId required' });
  }
  
  try {
    const storage = new StorageTool();
    const reportData = await storage.get(`runs/${runId}/pipeline_report.json`);
    const report = JSON.parse(reportData.toString('utf-8'));
    
    res.status(200).json(report);
  } catch (error) {
    res.status(404).json({ error: 'Report not found' });
  }
}
```

---

### 8. Update Dashboard UI
**Status:** ⏳ TODO

**In `public/dashboard.html`, add to Run Details modal:**

```html
<div class="tab" data-tab="pipeline-report">
  <h3>Pipeline Report</h3>
  
  <div class="report-section">
    <h4>📥 Ingestion</h4>
    <p>Scanned <strong>${report.ingestion.sources_scanned.length}</strong> sources</p>
    <p>Found <strong>${report.ingestion.total_items_before_filter}</strong> items</p>
    <p>Kept <strong>${report.ingestion.total_stories_found}</strong> stories after filtering</p>
    
    <details>
      <summary>Sources Scanned (${report.ingestion.sources_scanned.length})</summary>
      <table>
        <tr><th>Topic</th><th>URL</th><th>Items</th><th>Status</th></tr>
        ${report.ingestion.sources_scanned.map(s => `
          <tr>
            <td>${s.name}</td>
            <td>${s.url}</td>
            <td>${s.items_found}</td>
            <td class="status-${s.status === 'success' ? 'success' : 'error'}">${s.status}</td>
          </tr>
        `).join('')}
      </table>
    </details>
    
    <details>
      <summary>Filtered Out (${report.ingestion.filtered_out.length})</summary>
      <ul>
        ${report.ingestion.filtered_out.slice(0, 50).map(f => `
          <li><strong>${f.title}</strong> - ${f.reason}</li>
        `).join('')}
      </ul>
    </details>
  </div>
  
  <div class="report-section">
    <h4>🎯 Ranking</h4>
    <p>Ranked <strong>${report.ranking.stories_ranked}</strong> stories</p>
    <p>Selected <strong>${report.ranking.top_picks.length}</strong> picks</p>
    
    <details>
      <summary>Top Picks</summary>
      <ul>
        ${report.ranking.top_picks.map(p => `
          <li>
            <strong>${p.title}</strong><br>
            Topic: ${p.topic} | Score: ${p.score.toFixed(3)}<br>
            <em>${p.why_selected}</em>
          </li>
        `).join('')}
      </ul>
    </details>
    
    <details>
      <summary>Rejected Stories (${report.ranking.rejected_stories.length})</summary>
      <ul>
        ${report.ranking.rejected_stories.slice(0, 20).map(r => `
          <li>
            <strong>${r.title}</strong> (${r.score.toFixed(3)}) - ${r.reason}
          </li>
        `).join('')}
      </ul>
    </details>
  </div>
  
  <div class="report-section">
    <h4>📝 Scriptwriting</h4>
    <p>Generated <strong>${report.scriptwriting.total_word_count}</strong> words in <strong>${report.scriptwriting.sections_generated}</strong> sections</p>
    <p>Citations used: ${report.scriptwriting.citations_used.join(', ')}</p>
    
    <details>
      <summary>Full Script</summary>
      <pre>${report.scriptwriting.full_script_text}</pre>
    </details>
  </div>
  
  <div class="report-section">
    <h4>✅ Fact Check</h4>
    <p>Changes: <strong>${report.factcheck.changes_made.length}</strong></p>
    <p>Flags: <strong>${report.factcheck.flags_raised.length}</strong></p>
    
    ${report.factcheck.changes_made.length > 0 ? `
      <details>
        <summary>Changes Made</summary>
        <ul>
          ${report.factcheck.changes_made.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </details>
    ` : ''}
    
    ${report.factcheck.flags_raised.length > 0 ? `
      <details>
        <summary>Flags Raised</summary>
        <ul>
          ${report.factcheck.flags_raised.map(f => `<li>${f}</li>`).join('')}
        </ul>
      </details>
    ` : ''}
  </div>
  
  <div class="report-section">
    <h4>🛡️ Safety</h4>
    <p>Risk Level: <span class="risk-${report.safety.risk_level}">${report.safety.risk_level.toUpperCase()}</span></p>
    <p>Edits: <strong>${report.safety.edits_made.length}</strong></p>
    
    ${report.safety.edits_made.length > 0 ? `
      <details>
        <summary>Edits Made</summary>
        <ul>
          ${report.safety.edits_made.map(e => `<li>${e}</li>`).join('')}
        </ul>
      </details>
    ` : ''}
  </div>
</div>
```

**In JavaScript:**
```javascript
async function showRunDetails(runId) {
  // Existing code...
  
  // Fetch pipeline report
  const reportResp = await fetch(`/api/reports?runId=${runId}`);
  if (reportResp.ok) {
    const report = await reportResp.json();
    // Render report tab (see HTML above)
  }
}
```

---

## Example Output

### Pipeline Report JSON Structure
```json
{
  "ingestion": {
    "sources_scanned": [
      {
        "name": "AI",
        "url": "https://openai.com/blog/rss.xml",
        "items_found": 25,
        "status": "success"
      },
      {
        "name": "Verizon",
        "url": "https://www.verizon.com/about/rss/news",
        "items_found": 0,
        "status": "Failed: timeout"
      }
    ],
    "total_items_before_filter": 127,
    "filtered_out": [
      {
        "title": "Old article from 2024",
        "reason": "Too old (2024-10-15)"
      },
      {
        "title": "Generic tech news",
        "reason": "No keyword match for AI"
      }
    ],
    "topics_breakdown": {
      "AI": 15,
      "Verizon": 3,
      "Accenture": 2
    }
  },
  "ranking": {
    "stories_ranked": 20,
    "top_picks": [
      {
        "title": "OpenAI launches GPT-5",
        "topic": "AI",
        "score": 0.892,
        "why_selected": "Highest AI score - major product launch"
      },
      {
        "title": "Verizon 5G expansion",
        "topic": "Verizon",
        "score": 0.734,
        "why_selected": "Top Verizon story - strategic significance"
      }
    ],
    "rejected_stories": [
      {
        "title": "Minor AI update",
        "score": 0.234,
        "reason": "Score below threshold (0.5)"
      },
      {
        "title": "Similar AI story",
        "score": 0.765,
        "reason": "Too similar to selected story (0.87 similarity)"
      }
    ]
  },
  "scriptwriting": {
    "sections_generated": 5,
    "total_word_count": 687,
    "full_script_text": "OpenAI reports Q4 revenue exceeded $3.2B...",
    "citations_used": [1, 2, 3, 4, 5]
  },
  "factcheck": {
    "changes_made": [
      "Added citation [2] to revenue claim",
      "Corrected percentage from 45% to 47%"
    ],
    "flags_raised": [
      "Unverified claim about product launch date"
    ]
  },
  "safety": {
    "edits_made": [],
    "risk_level": "low"
  }
}
```

---

## Implementation Priority

1. ✅ **Phase 1 (DONE):** IngestionAgent detailed tracking
2. ⏳ **Phase 2 (TODO):** RankingAgent detailed tracking
3. ⏳ **Phase 3 (TODO):** ScriptwriterAgent detailed tracking
4. ⏳ **Phase 4 (TODO):** FactCheck & Safety detailed tracking
5. ⏳ **Phase 5 (TODO):** Orchestrator compilation & storage
6. ⏳ **Phase 6 (TODO):** Dashboard UI integration

---

## Benefits

✅ **Transparency:** See exactly what happened at each stage  
✅ **Debugging:** Quickly identify where stories were dropped  
✅ **Quality Control:** Review rejected stories - were they good?  
✅ **Auditing:** Full record of AI-generated content & edits  
✅ **Optimization:** Identify bottlenecks in source selection  

---

## Storage Considerations

- `pipeline_report.json` will be ~50-200KB per run
- Store for last 30 runs (~6MB max)
- Old reports can be archived or deleted

---

## Next Steps

Would you like me to:
1. **Continue implementation** - Complete phases 2-6 above
2. **Implement Phase 2 only** - Just RankingAgent for now
3. **Create simpler version** - Just log to console, no storage
4. **Different approach** - Suggest alternative logging strategy

Let me know which approach you prefer!


