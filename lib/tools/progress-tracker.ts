/**
 * Progress Tracker - Simple in-memory progress tracking for runs
 */

export interface ProgressUpdate {
  phase: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
  details?: any;
  timestamp: string;
  agentData?: {
    stories?: Array<{ title: string; topic: string; source: string }>;
    picks?: Array<{ title: string; topic: string; score: number }>;
    outline?: Array<{ type: string; title: string; story_count: number }>;
    script?: { word_count: number; sections: number };
    audio?: { segments: number; total_duration: number };
  };
}

export interface RunProgress {
  runId: string;
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
  currentPhase: string;
  progress: number; // 0-100
  updates: ProgressUpdate[];
}

class ProgressTracker {
  private runs: Map<string, RunProgress> = new Map();
  
  startRun(runId: string) {
    this.runs.set(runId, {
      runId,
      startedAt: new Date().toISOString(),
      status: 'running',
      currentPhase: 'Starting',
      progress: 0,
      updates: [],
    });
  }
  
  addUpdate(runId: string, update: Omit<ProgressUpdate, 'timestamp'>) {
    const run = this.runs.get(runId);
    if (!run) return;
    
    run.updates.push({
      ...update,
      timestamp: new Date().toISOString(),
    });
    
    run.currentPhase = update.phase;
    
    // Update progress based on phase
    const phaseProgress: Record<string, number> = {
      'Starting': 5,
      'Ingestion': 15,
      'Ranking': 25,
      'Outline': 35,
      'Scriptwriting': 50,
      'Fact Checking': 60,
      'Safety Review': 65,
      'TTS Planning': 70,
      'Audio Generation': 85,
      'Publishing': 95,
      'Complete': 100,
    };
    
    run.progress = phaseProgress[update.phase] || run.progress;
    
    if (update.status === 'completed') {
      run.status = 'completed';
      run.progress = 100;
    } else if (update.status === 'failed') {
      run.status = 'failed';
    }
  }
  
  getProgress(runId: string): RunProgress | null {
    // Support 'latest' to get the most recent run
    if (runId === 'latest') {
      // Get all runs sorted by start time (most recent first)
      const allRuns = Array.from(this.runs.values())
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      
      return allRuns[0] || null; // Return most recent
    }
    
    // Support date-only format (e.g., "2025-11-14") - find most recent run for that date
    // This handles old dashboard code that uses date instead of full runId
    if (runId.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Get all runs for this date sorted by start time (most recent first)
      const dateRuns = Array.from(this.runs.values())
        .filter(run => run.runId.startsWith(runId))
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      
      return dateRuns[0] || null; // Return most recent for this date
    }
    
    return this.runs.get(runId) || null;
  }
  
  clearOldRuns() {
    // Clear runs older than 1 hour
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const [runId, run] of this.runs.entries()) {
      if (new Date(run.startedAt).getTime() < oneHourAgo) {
        this.runs.delete(runId);
      }
    }
  }
}

export const progressTracker = new ProgressTracker();

