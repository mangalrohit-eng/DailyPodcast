# Immediate Run Display & Cancel Functionality

## Features

### 1. Immediate Run Display ✅
When you click "Run Now", the new episode appears **instantly** in the runs table - no waiting or refresh needed!

**Before:**
- Click "Run Now" → Wait → Manually refresh page → See the new run

**After:**
- Click "Run Now" → **Immediately see "Generating..." in the table** → Watch it update

### 2. Cancel Running Episodes 🛑
You can now cancel a running episode at any time with a single click.

**How it works:**
- A "Cancel" button appears next to running episodes
- Click it to stop generation immediately
- The run is marked as "FAILED" with reason "Cancelled by user"

## How It Works

### Immediate Display Implementation

#### 1. Frontend Generates RunID
```javascript
const timestamp = Date.now();
const today = new Date().toISOString().split('T')[0];
const runId = `${today}_${timestamp}`;
```

The dashboard generates the same runID format that the backend uses, allowing it to show the run immediately.

#### 2. Add to Table Instantly
```javascript
addRunToTableImmediately(runId, today);
```

Before the API call even starts, the run appears in the table with:
- Status: "RUNNING"
- Title: "Generating..."
- Buttons: "Details" + "Cancel"

#### 3. Smooth Animation
```css
@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

The new row fades in smoothly at the top of the table.

#### 4. Sync with Backend
Once the API responds, we:
- Update `currentRunId` if needed
- Refresh the table to get accurate status
- Open the details modal automatically

### Cancel Functionality Implementation

#### 1. Progress Tracker Updates
**File**: `lib/tools/progress-tracker.ts`

Added new methods:
```typescript
requestCancel(runId: string): boolean
isCancelRequested(runId: string): boolean
cancelRun(runId: string)
```

Plus new status:
```typescript
status: 'running' | 'completed' | 'failed' | 'cancelled'
```

#### 2. Cancellation Checks in Orchestrator
**File**: `lib/orchestrator.ts`

Added cancellation checks before each phase:
```typescript
const checkCancellation = () => {
  if (progressTracker.isCancelRequested(runId)) {
    throw new Error('Run cancelled by user');
  }
};

// Before each phase:
checkCancellation();
Logger.info('Phase 1: Ingestion');
// ... phase execution
```

This ensures the run stops quickly when cancelled.

#### 3. Cancel API Endpoint
**File**: `api/run/cancel.ts`

```typescript
POST /api/run/cancel
Body: { runId: "2024-11-15_123456" }

Response: {
  success: true,
  message: "Run cancelled successfully",
  runId: "2024-11-15_123456"
}
```

#### 4. Cancel Button in Dashboard
**File**: `public/dashboard.html`

```html
<button class="btn btn-danger" onclick="cancelRun('${runId}')">
  <i class="fas fa-stop"></i> Cancel
</button>
```

Only appears for "RUNNING" episodes.

## User Experience

### Starting a Run

**Step 1**: Click "Run Now"
```
┌─────────────────────────────────────┐
│ ⏳ Starting podcast generation...  │
└─────────────────────────────────────┘
```

**Step 2**: Immediately see in table (0ms delay!)
```
Episode                  Status      Stories  Duration  Actions
─────────────────────────────────────────────────────────────────
Generating...            RUNNING     -        -         [Details] [Cancel]
Nov 15, 2024 3:45 PM
```

**Step 3**: Details modal auto-opens
```
┌──────────────────────────────────────────────┐
│ Episode Generation Progress                  │
│                                              │
│ Phase: Ingestion                             │
│ ● Collecting news from configured sources    │
│ Progress: ████░░░░░░░░ 15%                  │
└──────────────────────────────────────────────┘
```

### Cancelling a Run

**Step 1**: Click "Cancel" button
```
┌─────────────────────────────────────────────┐
│ Are you sure you want to cancel this run?  │
│                                             │
│ This will stop the episode generation      │
│ immediately.                                │
│                                             │
│              [Cancel] [OK]                  │
└─────────────────────────────────────────────┘
```

**Step 2**: Confirmation
```
┌─────────────────────────────────────┐
│ 🛑 Cancelling run...                │
└─────────────────────────────────────┘
```

**Step 3**: Updated status
```
Episode                  Status      Stories  Duration  Actions
─────────────────────────────────────────────────────────────────
Cancelled                FAILED      3        -         [Details] [Delete]
Nov 15, 2024 3:45 PM
```

## Technical Details

### Cancellation Flow

```
User clicks Cancel
    ↓
Dashboard calls /api/run/cancel
    ↓
Progress Tracker sets cancelRequested = true
    ↓
Runs Storage marks run as failed
    ↓
Orchestrator checks cancellation before next phase
    ↓
Throws error: "Run cancelled by user"
    ↓
Catch block handles cleanup
    ↓
Run marked as FAILED in index
```

### Phases with Cancellation Checks

1. ✅ Ingestion
2. ✅ Ranking
3. ✅ Scraper
4. ✅ Outline
5. ✅ Scriptwriting
6. ✅ Fact-Check
7. ✅ Safety
8. ✅ TTS Director
9. ✅ Audio Engineer
10. ✅ Publisher
11. ✅ Memory Update

The cancellation is checked **before each phase starts**, ensuring quick response.

### What Happens to Partial Work?

When cancelled:
- **Completed phases**: Their outputs are saved in the partial manifest
- **Current phase**: Stops immediately
- **Future phases**: Never executed
- **Files**: No MP3 is uploaded (run marked as failed)
- **Storage**: Run remains in index with status "FAILED"

You can still view the details to see how far it got!

## Benefits

### 1. **Better User Experience**
- No more waiting and wondering if "Run Now" worked
- Instant feedback that something is happening
- Can open details immediately to watch progress

### 2. **Full Control**
- Cancel if you accidentally clicked "Run Now"
- Cancel if you realize you forgot to change settings
- Cancel if a run is taking too long

### 3. **No Wasted Resources**
- Stop expensive API calls early
- Don't wait for a full episode if you don't need it
- Clean up quickly if something goes wrong

### 4. **Transparent Status**
- Always know what's running
- See exactly where cancellation happened
- Access partial results in details

## Edge Cases Handled

### If Backend RunID Differs
The frontend generates a runID, but the backend might generate a different one. We handle this:

```javascript
// Update currentRunId if backend returned different ID
if (result.runId) {
    currentRunId = result.runId;
}
```

### If API Call Fails
The placeholder row is removed and table is refreshed:

```javascript
} else {
    showToast(`❌ Failed to start`, 'error');
    currentRunId = null;
    loadRuns(); // Refresh to remove the placeholder
}
```

### If Run Completes Before Cancel
The cancel button returns an error:

```json
{
  "error": "Run not found or not running"
}
```

### If Multiple Runs Attempted
Only one run can be active at a time (existing concurrency control).

## Future Enhancements

Potential improvements:
1. **Pause/Resume**: Allow pausing instead of cancelling
2. **Progress Bar**: Real-time progress percentage in table
3. **Estimated Time**: Show "~5 minutes remaining"
4. **Cancel Reason**: Allow user to specify why they cancelled
5. **Auto-Retry**: Option to retry from last successful phase

## Testing

To test these features:

### Test Immediate Display
1. Open dashboard
2. Click "Run Now"
3. **Verify**: New row appears instantly at top with "RUNNING" status
4. **Verify**: Title shows "Generating..."
5. **Verify**: Details and Cancel buttons are present

### Test Cancel
1. Start a run (Click "Run Now")
2. Wait for it to reach "Ingestion" or "Ranking" phase
3. Click "Cancel" button
4. Confirm the cancellation
5. **Verify**: Status changes to "FAILED"
6. **Verify**: Details show "Cancelled by user"
7. **Verify**: No MP3 file was created

### Test Error Recovery
1. Start a run
2. Immediately stop your internet connection
3. **Verify**: Error is shown
4. **Verify**: Placeholder row is removed
5. **Verify**: "Run Now" button is re-enabled

## Files Changed

- `lib/tools/progress-tracker.ts` - Added cancel methods
- `lib/orchestrator.ts` - Added cancellation checks
- `api/run/cancel.ts` - NEW cancel endpoint
- `public/dashboard.html` - Immediate display + cancel button
- `IMMEDIATE_DISPLAY_AND_CANCEL.md` - This documentation

