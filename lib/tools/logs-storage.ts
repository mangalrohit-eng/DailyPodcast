/**
 * Logs Storage - Structured JSONL logging for runs
 */

import { StorageTool } from './storage';
import { Logger as BaseLogger } from '../utils';

export interface LogEntry {
  ts: string; // ISO timestamp
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  agent?: string;
  msg: string;
  data?: any;
  run_id: string;
}

export class LogsStorage {
  private storage: StorageTool;
  private activeRunLogs: Map<string, LogEntry[]> = new Map();
  
  constructor() {
    this.storage = new StorageTool();
  }
  
  /**
   * Append log entry to run logs
   */
  async append(runId: string, entry: LogEntry): Promise<void> {
    // Add to in-memory buffer
    if (!this.activeRunLogs.has(runId)) {
      this.activeRunLogs.set(runId, []);
    }
    this.activeRunLogs.get(runId)!.push(entry);
    
    // Flush if buffer is large
    const buffer = this.activeRunLogs.get(runId)!;
    if (buffer.length >= 50) {
      await this.flush(runId);
    }
  }
  
  /**
   * Flush buffered logs to storage
   */
  async flush(runId: string): Promise<void> {
    const buffer = this.activeRunLogs.get(runId);
    if (!buffer || buffer.length === 0) {
      return;
    }
    
    try {
      const logsPath = `runs/${runId}/logs.jsonl`;
      
      // Get existing logs
      let existingLogs = '';
      try {
        const existing = await this.storage.get(logsPath);
        existingLogs = existing.toString('utf-8');
      } catch {
        // File doesn't exist yet
      }
      
      // Append new logs
      const newLines = buffer.map(entry => JSON.stringify(entry)).join('\n');
      const updatedLogs = existingLogs ? `${existingLogs}\n${newLines}` : newLines;
      
      // Save
      await this.storage.put(logsPath, updatedLogs, 'application/x-ndjson');
      
      // Clear buffer
      this.activeRunLogs.set(runId, []);
      
      BaseLogger.debug('Logs flushed', { runId, entries: buffer.length });
    } catch (error) {
      BaseLogger.error('Failed to flush logs', {
        runId,
        error: (error as Error).message,
      });
    }
  }
  
  /**
   * Get logs for a specific run
   */
  async getLogs(runId: string, cursor?: number): Promise<{ logs: LogEntry[]; nextCursor?: number }> {
    try {
      const logsPath = `runs/${runId}/logs.jsonl`;
      
      // Get from storage
      const data = await this.storage.get(logsPath);
      const lines = data.toString('utf-8').split('\n').filter(line => line.trim());
      
      // Parse JSONL
      const logs: LogEntry[] = [];
      for (let i = cursor || 0; i < lines.length; i++) {
        try {
          logs.push(JSON.parse(lines[i]));
        } catch {
          // Skip invalid lines
        }
      }
      
      // Add any buffered logs
      const buffered = this.activeRunLogs.get(runId) || [];
      logs.push(...buffered);
      
      return {
        logs,
        nextCursor: lines.length + buffered.length,
      };
    } catch (error) {
      // Check for buffered logs only
      const buffered = this.activeRunLogs.get(runId) || [];
      if (buffered.length > 0) {
        return {
          logs: buffered,
          nextCursor: buffered.length,
        };
      }
      
      throw new Error(`Logs not found for run: ${runId}`);
    }
  }
  
  /**
   * Get latest run logs
   */
  async getLatestLogs(cursor?: number): Promise<{ logs: LogEntry[]; nextCursor?: number; runId?: string }> {
    try {
      // Find latest run
      const runId = await this.getLatestRunId();
      
      if (!runId) {
        return { logs: [] };
      }
      
      const result = await this.getLogs(runId, cursor);
      return {
        ...result,
        runId,
      };
    } catch (error) {
      return { logs: [] };
    }
  }
  
  /**
   * Stream logs (for SSE)
   */
  async *streamLogs(runId: string, startCursor: number = 0): AsyncGenerator<LogEntry, void, unknown> {
    let cursor = startCursor;
    let noNewLogsCount = 0;
    const maxRetries = 60; // 60 seconds timeout
    
    while (noNewLogsCount < maxRetries) {
      try {
        const result = await this.getLogs(runId, cursor);
        
        if (result.logs.length > 0) {
          for (const log of result.logs) {
            yield log;
          }
          cursor = result.nextCursor || cursor;
          noNewLogsCount = 0;
        } else {
          noNewLogsCount++;
        }
        
        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Run might not exist yet, keep trying
        noNewLogsCount++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  /**
   * Get latest run ID
   */
  private async getLatestRunId(): Promise<string | null> {
    try {
      const indexPath = 'runs/index.json';
      const data = await this.storage.get(indexPath);
      const index = JSON.parse(data.toString('utf-8'));
      
      if (index.runs && index.runs.length > 0) {
        // Runs are stored newest first
        return index.runs[0].run_id;
      }
      
      return null;
    } catch {
      return null;
    }
  }
  
  /**
   * Clear old logs (cleanup)
   */
  async cleanup(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const indexPath = 'runs/index.json';
      const data = await this.storage.get(indexPath);
      const index = JSON.parse(data.toString('utf-8'));
      
      for (const run of index.runs || []) {
        const runDate = new Date(run.date);
        if (runDate < cutoffDate) {
          // Delete logs
          try {
            await this.storage.delete(`runs/${run.run_id}/logs.jsonl`);
            BaseLogger.info('Cleaned up old logs', { runId: run.run_id });
          } catch {
            // Ignore errors
          }
        }
      }
    } catch (error) {
      BaseLogger.warn('Failed to cleanup logs', {
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Structured logger that writes to LogsStorage
 */
export class StructuredLogger {
  private logsStorage: LogsStorage;
  private runId: string;
  
  constructor(runId: string) {
    this.logsStorage = new LogsStorage();
    this.runId = runId;
  }
  
  async log(level: LogEntry['level'], msg: string, data?: any, agent?: string): Promise<void> {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      data,
      agent,
      run_id: this.runId,
    };
    
    // Also log to console via base logger
    const logFn = level === 'ERROR' ? BaseLogger.error :
                  level === 'WARN' ? BaseLogger.warn :
                  level === 'DEBUG' ? BaseLogger.debug :
                  BaseLogger.info;
    
    logFn(msg, { ...data, agent, runId: this.runId });
    
    // Append to storage
    await this.logsStorage.append(this.runId, entry);
  }
  
  async info(msg: string, data?: any, agent?: string): Promise<void> {
    await this.log('INFO', msg, data, agent);
  }
  
  async warn(msg: string, data?: any, agent?: string): Promise<void> {
    await this.log('WARN', msg, data, agent);
  }
  
  async error(msg: string, data?: any, agent?: string): Promise<void> {
    await this.log('ERROR', msg, data, agent);
  }
  
  async debug(msg: string, data?: any, agent?: string): Promise<void> {
    await this.log('DEBUG', msg, data, agent);
  }
  
  async flush(): Promise<void> {
    await this.logsStorage.flush(this.runId);
  }
}

