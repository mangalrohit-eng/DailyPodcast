/**
 * Runs Storage - Maintains index of all runs
 */

import { StorageTool } from './storage';
import { EpisodeManifest } from '../types';
import { Logger } from '../utils';

export interface RunSummary {
  run_id: string;
  date: string;
  status: 'running' | 'success' | 'failed';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  stories_count?: number;
  episode_url?: string;
  error?: string;
}

export interface RunsIndex {
  runs: RunSummary[];
  last_updated: string;
}

export class RunsStorage {
  private storage: StorageTool;
  private indexPath = 'runs/index.json';
  
  // In-memory concurrency guard
  private static activeRun: string | null = null;
  
  constructor() {
    this.storage = new StorageTool();
  }
  
  /**
   * Start a new run (concurrency guard)
   */
  async startRun(runId: string): Promise<boolean> {
    if (RunsStorage.activeRun) {
      Logger.warn('Run already in progress', {
        activeRun: RunsStorage.activeRun,
        attempted: runId,
      });
      return false;
    }
    
    RunsStorage.activeRun = runId;
    
    const summary: RunSummary = {
      run_id: runId,
      date: runId, // Run ID is typically the date
      status: 'running',
      started_at: new Date().toISOString(),
    };
    
    await this.addRun(summary);
    
    Logger.info('Run started', { runId });
    return true;
  }
  
  /**
   * Complete a run
   */
  async completeRun(runId: string, manifest: EpisodeManifest): Promise<void> {
    const summary: RunSummary = {
      run_id: runId,
      date: manifest.date,
      status: 'success',
      started_at: manifest.created_at,
      completed_at: new Date().toISOString(),
      duration_ms: manifest.metrics?.total_time_ms,
      stories_count: manifest.picks.length,
      episode_url: manifest.mp3_url,
    };
    
    await this.updateRun(summary);
    
    // Release concurrency guard
    if (RunsStorage.activeRun === runId) {
      RunsStorage.activeRun = null;
    }
    
    Logger.info('Run completed', { runId });
  }
  
  /**
   * Fail a run
   */
  async failRun(runId: string, error: string): Promise<void> {
    const summary: RunSummary = {
      run_id: runId,
      date: runId,
      status: 'failed',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      error,
    };
    
    await this.updateRun(summary);
    
    // Release concurrency guard
    if (RunsStorage.activeRun === runId) {
      RunsStorage.activeRun = null;
    }
    
    Logger.info('Run failed', { runId, error });
  }
  
  /**
   * Check if a run is active
   */
  static isRunActive(): boolean {
    return RunsStorage.activeRun !== null;
  }
  
  /**
   * Get active run ID
   */
  static getActiveRunId(): string | null {
    return RunsStorage.activeRun;
  }
  
  /**
   * Add a new run to the index
   */
  private async addRun(summary: RunSummary): Promise<void> {
    const index = await this.loadIndex();
    
    // Add to beginning (newest first)
    index.runs.unshift(summary);
    
    // Keep last 100 runs
    if (index.runs.length > 100) {
      index.runs = index.runs.slice(0, 100);
    }
    
    await this.saveIndex(index);
  }
  
  /**
   * Update an existing run in the index
   */
  private async updateRun(summary: RunSummary): Promise<void> {
    const index = await this.loadIndex();
    
    const existingIndex = index.runs.findIndex(r => r.run_id === summary.run_id);
    
    if (existingIndex >= 0) {
      index.runs[existingIndex] = summary;
    } else {
      // Add if not found
      index.runs.unshift(summary);
    }
    
    await this.saveIndex(index);
  }
  
  /**
   * Load runs index
   */
  private async loadIndex(): Promise<RunsIndex> {
    try {
      const exists = await this.storage.exists(this.indexPath);
      
      if (!exists) {
        return {
          runs: [],
          last_updated: new Date().toISOString(),
        };
      }
      
      const data = await this.storage.get(this.indexPath);
      return JSON.parse(data.toString('utf-8'));
    } catch (error) {
      Logger.warn('Failed to load runs index', {
        error: (error as Error).message,
      });
      return {
        runs: [],
        last_updated: new Date().toISOString(),
      };
    }
  }
  
  /**
   * Save runs index
   */
  private async saveIndex(index: RunsIndex): Promise<void> {
    try {
      index.last_updated = new Date().toISOString();
      
      Logger.info('Saving runs index', {
        path: this.indexPath,
        run_count: index.runs.length,
      });
      
      await this.storage.put(
        this.indexPath,
        JSON.stringify(index, null, 2),
        'application/json'
      );
      
      Logger.info('Runs index saved successfully', {
        path: this.indexPath,
      });
    } catch (error) {
      Logger.error('Failed to save runs index', {
        path: this.indexPath,
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw error;
    }
  }
  
  /**
   * List runs with pagination
   */
  async list(page: number = 1, pageSize: number = 20): Promise<{
    runs: RunSummary[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
  }> {
    const index = await this.loadIndex();
    
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const runs = index.runs.slice(start, end);
    
    return {
      runs,
      total: index.runs.length,
      page,
      pageSize,
      hasMore: end < index.runs.length,
    };
  }
  
  /**
   * Get a specific run
   */
  async get(runId: string): Promise<RunSummary | null> {
    const index = await this.loadIndex();
    return index.runs.find(r => r.run_id === runId) || null;
  }
  
  /**
   * Get run manifest
   */
  async getManifest(runId: string): Promise<EpisodeManifest | null> {
    try {
      const manifestPath = `episodes/${runId}_manifest.json`;
      const data = await this.storage.get(manifestPath);
      return JSON.parse(data.toString('utf-8'));
    } catch (error) {
      Logger.warn('Failed to load manifest', {
        runId,
        error: (error as Error).message,
      });
      return null;
    }
  }
}

