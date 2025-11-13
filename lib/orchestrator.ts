/**
 * Orchestrator - Coordinates the entire agent pipeline
 */

import { Config } from './config';
import { Logger, Clock, Crypto } from './utils';
import { EpisodeManifest, RunConfig } from './types';
import { StorageTool } from './tools/storage';
// import { StructuredLogger } from './tools/logs-storage'; // REMOVED: Causing undefined errors
import { RunsStorage } from './tools/runs-storage';
import { progressTracker } from './tools/progress-tracker';
import { BaseAgent } from './agents/base';

// Import all agents
import { IngestionAgent } from './agents/ingestion';
import { RankingAgent } from './agents/ranking';
import { OutlineAgent } from './agents/outline';
import { ScriptwriterAgent } from './agents/scriptwriter';
import { FactCheckAgent } from './agents/factcheck';
import { SafetyAgent } from './agents/safety';
import { TtsDirectorAgent } from './agents/tts-director';
import { AudioEngineerAgent } from './agents/audio-engineer';
import { PublisherAgent } from './agents/publisher';
import { MemoryAgent } from './agents/memory';

export interface OrchestratorInput {
  date?: string;
  topics?: string[];
  window_hours?: number;
  weights?: Record<string, number>;
  force_overwrite?: boolean;
  rumor_filter?: boolean;
}

export interface OrchestratorOutput {
  success: boolean;
  manifest?: EpisodeManifest;
  error?: string;
  metrics: {
    total_time_ms: number;
    agent_times: Record<string, number>;
  };
}

export class Orchestrator {
  private storage: StorageTool;
  
  // Agents
  private ingestionAgent: IngestionAgent;
  private rankingAgent: RankingAgent;
  private outlineAgent: OutlineAgent;
  private scriptwriterAgent: ScriptwriterAgent;
  private factCheckAgent: FactCheckAgent;
  private safetyAgent: SafetyAgent;
  private ttsDirectorAgent: TtsDirectorAgent;
  private audioEngineerAgent: AudioEngineerAgent;
  private publisherAgent: PublisherAgent;
  private memoryAgent: MemoryAgent;
  
  constructor() {
    this.storage = new StorageTool();
    
    // Initialize agents
    this.ingestionAgent = new IngestionAgent();
    this.rankingAgent = new RankingAgent();
    this.outlineAgent = new OutlineAgent();
    this.scriptwriterAgent = new ScriptwriterAgent();
    this.factCheckAgent = new FactCheckAgent();
    this.safetyAgent = new SafetyAgent();
    this.ttsDirectorAgent = new TtsDirectorAgent();
    this.audioEngineerAgent = new AudioEngineerAgent();
    this.publisherAgent = new PublisherAgent();
    this.memoryAgent = new MemoryAgent();
  }
  
  async run(input: OrchestratorInput = {}): Promise<OrchestratorOutput> {
    const startTime = Date.now();
    const agentTimes: Record<string, number> = {};
    
    // Build run configuration first to get runId
    const runConfig = await this.buildRunConfig(input);
    // Add timestamp to runId to make it unique per run
    const timestamp = Date.now();
    const runId = `${runConfig.date}_${timestamp}`;
    
    // Initialize storage (StructuredLogger removed due to undefined errors)
    let runsStorage: RunsStorage | null = null;
    
    try {
      runsStorage = new RunsStorage();
      
      // Check concurrency - only one run at a time
      if (!runConfig.force_overwrite && RunsStorage.isRunActive()) {
        const activeRun = RunsStorage.getActiveRunId();
        Logger.warn('Run already in progress', { activeRun });
        return {
          success: false,
          error: `Another run is already in progress: ${activeRun}`,
          metrics: {
            total_time_ms: Date.now() - startTime,
            agent_times: {},
          },
        };
      }
      
      // Start the run
      const started = runsStorage ? await runsStorage.startRun(runId) : false;
      if (!started && !runConfig.force_overwrite) {
        Logger.warn('Failed to start run (concurrency)', { runId });
        return {
          success: false,
          error: 'Failed to start run - another run may be in progress',
          metrics: {
            total_time_ms: Date.now() - startTime,
            agent_times: {},
          },
        };
      }
      
      Logger.info('Orchestrator starting', { runId });
      
      // Start progress tracking
      progressTracker.startRun(runId);
      progressTracker.addUpdate(runId, {
        phase: 'Starting',
        status: 'running',
        message: 'Initializing podcast generation pipeline',
      });
      
      // Generate unique episode filename with timestamp
      // This allows multiple runs per day and avoids "already exists" issues
      const episodePath = `episodes/${runId}_daily_rohit_news.mp3`;
      Logger.info('Generating new episode', { 
        runId,
        date: runConfig.date,
        path: episodePath,
      });
      
      // 1. INGESTION
      Logger.info('Phase 1: Ingestion');
      progressTracker.addUpdate(runId, {
        phase: 'Ingestion',
        status: 'running',
        message: 'Fetching news from RSS feeds',
        details: { topics: Config.getTopicConfigs().map(t => t.name) },
      });
      const ingestionStart = Date.now();
      const ingestionResult = await this.ingestionAgent.execute(runId, {
        topics: Config.getTopicConfigs(),
        window_hours: runConfig.window_hours,
        cutoff_date: Clock.addHours(new Date(), -runConfig.window_hours),
      });
      agentTimes['ingestion'] = Date.now() - ingestionStart;
      
      if (!ingestionResult.output || ingestionResult.output.stories.length === 0) {
        throw new Error('No stories found during ingestion');
      }
      
      Logger.info('Ingestion complete', {
        stories: ingestionResult.output.stories.length,
      });
      progressTracker.addUpdate(runId, {
        phase: 'Ingestion',
        status: 'completed',
        message: `Found ${ingestionResult.output.stories.length} stories`,
        details: { story_count: ingestionResult.output.stories.length },
        agentData: {
          stories: ingestionResult.output.stories.slice(0, 20).map(s => ({
            title: s.title,
            topic: s.topic || 'General',
            source: s.source,
          })),
        },
      });
      
      // 2. RANKING
      Logger.info('Phase 2: Ranking');
      progressTracker.addUpdate(runId, {
        phase: 'Ranking',
        status: 'running',
        message: 'Analyzing and ranking stories by relevance',
      });
      const rankingStart = Date.now();
      const rankingResult = await this.rankingAgent.execute(runId, {
        stories: ingestionResult.output.stories,
        topic_weights: runConfig.weights,
        target_count: 5,
      });
      agentTimes['ranking'] = Date.now() - rankingStart;
      
      if (!rankingResult.output || rankingResult.output.picks.length === 0) {
        throw new Error('No stories ranked');
      }
      
      Logger.info('Ranking complete', {
        picks: rankingResult.output.picks.length,
      });
      progressTracker.addUpdate(runId, {
        phase: 'Ranking',
        status: 'completed',
        message: `Selected top ${rankingResult.output.picks.length} stories`,
        details: { 
          picks: rankingResult.output.picks.length,
          topics: rankingResult.output.picks.map(p => p.topic),
        },
        agentData: {
          picks: rankingResult.output.picks.map(p => ({
            title: p.story.title,
            topic: p.topic,
            score: Math.round(p.score * 1000) / 1000,
          })),
        },
      });
      
      // 3. OUTLINE
      Logger.info('Phase 3: Outline');
      progressTracker.addUpdate(runId, {
        phase: 'Outline',
        status: 'running',
        message: 'Creating episode outline and structure',
      });
      const outlineStart = Date.now();
      const outlineResult = await this.outlineAgent.execute(runId, {
        picks: rankingResult.output.picks,
        date: runConfig.date,
        target_duration_sec: runConfig.target_duration_sec,
      });
      agentTimes['outline'] = Date.now() - outlineStart;
      
      progressTracker.addUpdate(runId, {
        phase: 'Outline',
        status: 'completed',
        message: `Created outline with ${outlineResult.output!.outline.sections.length} sections`,
        agentData: {
          outline: outlineResult.output!.outline.sections.map(s => ({
            type: s.type,
            title: s.title,
            story_count: s.refs.length,
          })),
        },
      });
      
      // 4. SCRIPTWRITING
      Logger.info('Phase 4: Scriptwriting');
      progressTracker.addUpdate(runId, {
        phase: 'Scriptwriting',
        status: 'running',
        message: 'Writing conversational script with AI',
      });
      const scriptStart = Date.now();
      const scriptResult = await this.scriptwriterAgent.execute(runId, {
        outline: outlineResult.output!.outline,
        picks: rankingResult.output.picks,
        date: runConfig.date,
        listener_name: 'Rohit',
      });
      agentTimes['scriptwriter'] = Date.now() - scriptStart;
      
      progressTracker.addUpdate(runId, {
        phase: 'Scriptwriting',
        status: 'completed',
        message: `Generated script with ${scriptResult.output!.script.word_count} words`,
        agentData: {
          script: {
            word_count: scriptResult.output!.script.word_count,
            sections: scriptResult.output!.script.sections.length,
          },
        },
      });
      
      // 5. FACT-CHECK
      Logger.info('Phase 5: Fact-Check');
      progressTracker.addUpdate(runId, {
        phase: 'Fact Checking',
        status: 'running',
        message: 'Verifying facts against sources',
      });
      const factCheckStart = Date.now();
      const factCheckResult = await this.factCheckAgent.execute(runId, {
        script: scriptResult.output!.script,
      });
      agentTimes['factcheck'] = Date.now() - factCheckStart;
      
      Logger.info('Fact-check complete', {
        changes: factCheckResult.output!.changes_made.length,
        flags: factCheckResult.output!.flags_raised.length,
      });
      
      // 6. SAFETY
      Logger.info('Phase 6: Safety Check');
      progressTracker.addUpdate(runId, {
        phase: 'Safety Review',
        status: 'running',
        message: 'Screening content for safety and compliance',
      });
      const safetyStart = Date.now();
      const safetyResult = await this.safetyAgent.execute(runId, {
        script: factCheckResult.output!.script,
      });
      agentTimes['safety'] = Date.now() - safetyStart;
      
      Logger.info('Safety check complete', {
        edits: safetyResult.output!.edits_made.length,
        risk_level: safetyResult.output!.risk_level,
      });
      
      if (safetyResult.output!.risk_level === 'high') {
        Logger.warn('High risk content detected - review before publishing');
      }
      
      // 7. TTS DIRECTOR
      Logger.info('Phase 7: TTS Planning');
      progressTracker.addUpdate(runId, {
        phase: 'TTS Planning',
        status: 'running',
        message: 'Planning voice synthesis for natural delivery',
      });
      const ttsDirectorStart = Date.now();
      const ttsDirectorResult = await this.ttsDirectorAgent.execute(runId, {
        script: safetyResult.output!.script,
      });
      agentTimes['tts_director'] = Date.now() - ttsDirectorStart;
      
      // 8. AUDIO ENGINEER
      Logger.info('Phase 8: Audio Synthesis');
      progressTracker.addUpdate(runId, {
        phase: 'Audio Generation',
        status: 'running',
        message: 'Generating audio with OpenAI TTS (this takes longest)',
      });
      const audioStart = Date.now();
      const audioResult = await this.audioEngineerAgent.execute(runId, {
        synthesis_plan: ttsDirectorResult.output!.synthesis_plan,
      });
      agentTimes['audio_engineer'] = Date.now() - audioStart;
      
      // Create manifest
      const manifest: EpisodeManifest = {
        date: runConfig.date,
        run_id: runId,
        picks: rankingResult.output.picks,
        outline_hash: Crypto.contentId(outlineResult.output!.outline),
        script_hash: Crypto.contentId(safetyResult.output!.script),
        audio_hash: Crypto.sha256(audioResult.output!.audio_buffer),
        mp3_url: '', // Will be set by publisher
        duration_sec: audioResult.output!.actual_duration_sec,
        word_count: safetyResult.output!.script.word_count,
        created_at: new Date().toISOString(),
        metrics: {
          ingestion_time_ms: agentTimes['ingestion'],
          ranking_time_ms: agentTimes['ranking'],
          scripting_time_ms: agentTimes['scriptwriter'],
          tts_time_ms: agentTimes['audio_engineer'],
          total_time_ms: Date.now() - startTime,
          openai_tokens: 0, // Would need to track from actual API calls
        },
      };
      
      // 9. PUBLISHER
      Logger.info('Phase 9: Publishing');
      progressTracker.addUpdate(runId, {
        phase: 'Publishing',
        status: 'running',
        message: 'Uploading episode to S3 and updating feed',
      });
      const publishStart = Date.now();
      const publishResult = await this.publisherAgent.execute(runId, {
        audio_buffer: audioResult.output!.audio_buffer,
        manifest,
        podcast_config: Config.getPodcastConfig(),
      });
      agentTimes['publisher'] = Date.now() - publishStart;
      
      Logger.info('Publishing complete', {
        episode_url: publishResult.output!.episode_url,
      });
      
      // Update manifest with published episode URL
      manifest.mp3_url = publishResult.output!.episode_url;
      
      // 10. MEMORY UPDATE
      Logger.info('Phase 10: Memory Update');
      const memoryStart = Date.now();
      await this.memoryAgent.execute(runId, {
        manifest,
      });
      agentTimes['memory'] = Date.now() - memoryStart;
      
      const totalTime = Date.now() - startTime;
      
      // Get API call statistics
      const apiCalls = BaseAgent.getApiCalls(runId);
      const totalApiCalls = BaseAgent.getTotalApiCalls(runId);
      
      Logger.info('Orchestrator complete', {
        runId,
        total_time_ms: totalTime,
        duration_sec: manifest.duration_sec,
        total_api_calls: totalApiCalls,
        api_calls_by_agent: apiCalls,
      });
      
      // Add API calls to manifest metrics
      if (!manifest.metrics) {
        manifest.metrics = {
          ingestion_time_ms: 0,
          ranking_time_ms: 0,
          outline_time_ms: 0,
          scriptwriting_time_ms: 0,
          factcheck_time_ms: 0,
          safety_time_ms: 0,
          tts_director_time_ms: 0,
          audio_engineer_time_ms: 0,
          publisher_time_ms: 0,
          memory_time_ms: 0,
          total_time_ms: totalTime,
          openai_tokens: 0,
        };
      }
      (manifest.metrics as any).openai_api_calls = totalApiCalls;
      (manifest.metrics as any).api_calls_by_agent = apiCalls;
      
      progressTracker.addUpdate(runId, {
        phase: 'Complete',
        status: 'completed',
        message: `Episode generated (${Math.floor(totalTime / 1000)}s, ${totalApiCalls} API calls)`,
        details: {
          duration_sec: manifest.duration_sec,
          word_count: manifest.word_count,
          episode_url: manifest.mp3_url,
          total_api_calls: totalApiCalls,
          api_calls_by_agent: apiCalls,
        },
      });
      
      // Complete the run and update index
      try {
        await runsStorage.completeRun(runId, manifest);
        Logger.info('Run index updated successfully', { runId });
      } catch (indexError) {
        Logger.error('Failed to update runs index', {
          runId,
          error: (indexError as Error).message,
          stack: (indexError as Error).stack,
        });
        // Don't fail the entire run if index update fails
      }
      
      // Clean up API call tracking
      BaseAgent.clearApiCalls(runId);
      
      return {
        success: true,
        manifest,
        metrics: {
          total_time_ms: totalTime,
          agent_times: agentTimes,
        },
      };
    } catch (error) {
      const totalTime = Date.now() - startTime;
      
      Logger.error('Orchestrator failed', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        total_time_ms: totalTime,
      });
      
      progressTracker.addUpdate(runId, {
        phase: 'Failed',
        status: 'failed',
        message: (error as Error).message,
        details: { error: (error as Error).message },
      });
      
      // Fail the run
      if (runsStorage) {
        await runsStorage.failRun(runId, (error as Error).message);
      }
      
      return {
        success: false,
        error: (error as Error).message,
        metrics: {
          total_time_ms: totalTime,
          agent_times: agentTimes,
        },
      };
    }
  }
  
  private async buildRunConfig(input: OrchestratorInput): Promise<RunConfig> {
    const date = input.date || Clock.toDateString(Clock.nowUtc());
    
    // Get weights from memory profile if not provided
    let weights = input.weights || Config.parseTopicWeights();
    
    if (!input.weights) {
      try {
        const profile = await this.memoryAgent.getProfile();
        weights = profile.topic_weights;
      } catch {
        // Use defaults
      }
    }
    
    return {
      date,
      topics: input.topics || ['AI', 'Verizon', 'Accenture'],
      window_hours: input.window_hours || Config.WINDOW_HOURS,
      weights,
      force_overwrite: input.force_overwrite || Config.FORCE_OVERWRITE,
      rumor_filter: input.rumor_filter !== undefined ? input.rumor_filter : Config.RUMOR_FILTER,
      target_duration_sec: Config.TARGET_DURATION_SECONDS,
    };
  }
}

