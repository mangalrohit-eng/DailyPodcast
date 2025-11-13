/**
 * Orchestrator - Coordinates the entire agent pipeline
 */

import { Config } from './config';
import { Logger, Clock, Crypto } from './utils';
import { EpisodeManifest, RunConfig } from './types';
import { StorageTool } from './tools/storage';

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
    
    try {
      // Build run configuration
      const runConfig = await this.buildRunConfig(input);
      const runId = runConfig.date;
      
      Logger.info('Orchestrator starting', { runId });
      
      // Check if episode already exists
      const episodePath = `episodes/${runConfig.date}_daily_rohit_news.mp3`;
      if (!runConfig.force_overwrite && await this.storage.exists(episodePath)) {
        Logger.info('Episode already exists', { date: runConfig.date });
        
        // Load existing manifest
        const manifestPath = `episodes/${runConfig.date}_manifest.json`;
        const manifestData = await this.storage.get(manifestPath);
        const manifest = JSON.parse(manifestData.toString('utf-8'));
        
        return {
          success: true,
          manifest,
          metrics: {
            total_time_ms: Date.now() - startTime,
            agent_times: {},
          },
        };
      }
      
      // 1. INGESTION
      Logger.info('Phase 1: Ingestion');
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
      
      // 2. RANKING
      Logger.info('Phase 2: Ranking');
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
      
      // 3. OUTLINE
      Logger.info('Phase 3: Outline');
      const outlineStart = Date.now();
      const outlineResult = await this.outlineAgent.execute(runId, {
        picks: rankingResult.output.picks,
        date: runConfig.date,
        target_duration_sec: runConfig.target_duration_sec,
      });
      agentTimes['outline'] = Date.now() - outlineStart;
      
      // 4. SCRIPTWRITING
      Logger.info('Phase 4: Scriptwriting');
      const scriptStart = Date.now();
      const scriptResult = await this.scriptwriterAgent.execute(runId, {
        outline: outlineResult.output!.outline,
        picks: rankingResult.output.picks,
        date: runConfig.date,
        listener_name: 'Rohit',
      });
      agentTimes['scriptwriter'] = Date.now() - scriptStart;
      
      // 5. FACT-CHECK
      Logger.info('Phase 5: Fact-Check');
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
      const ttsDirectorStart = Date.now();
      const ttsDirectorResult = await this.ttsDirectorAgent.execute(runId, {
        script: safetyResult.output!.script,
      });
      agentTimes['tts_director'] = Date.now() - ttsDirectorStart;
      
      // 8. AUDIO ENGINEER
      Logger.info('Phase 8: Audio Synthesis');
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
      
      // 10. MEMORY UPDATE
      Logger.info('Phase 10: Memory Update');
      const memoryStart = Date.now();
      await this.memoryAgent.execute(runId, {
        manifest,
      });
      agentTimes['memory'] = Date.now() - memoryStart;
      
      const totalTime = Date.now() - startTime;
      
      Logger.info('Orchestrator complete', {
        runId,
        total_time_ms: totalTime,
        duration_sec: manifest.duration_sec,
      });
      
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

