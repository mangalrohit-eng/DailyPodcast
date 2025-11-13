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

