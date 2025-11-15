/**
 * Orchestrator - Coordinates the entire agent pipeline
 */

import { Config } from './config';
import { Logger, Clock, Crypto } from './utils';
import { EpisodeManifest, RunConfig } from './types';
import { StorageTool } from './tools/storage';
// import { StructuredLogger } from './tools/logs-storage'; // REMOVED: Causing undefined errors
import { RunsStorage } from './tools/runs-storage';
import { ConfigStorage } from './tools/config-storage';
import { progressTracker } from './tools/progress-tracker';
import { BaseAgent } from './agents/base';

// Import all agents
import { IngestionAgent } from './agents/ingestion';
import { RankingAgent } from './agents/ranking';
import { ScraperAgent } from './agents/scraper';
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
  private scraperAgent: ScraperAgent;
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
    this.scraperAgent = new ScraperAgent();
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
    // Extract dashboardConfig from runConfig for use in ingestion
    const dashboardConfig = (runConfig as any).dashboardConfig;
    
    // Add timestamp to runId to make it unique per run
    const timestamp = Date.now();
    const runId = `${runConfig.date}_${timestamp}`;
    
    Logger.info('🚀 ORCHESTRATOR START', {
      runId,
      date: runConfig.date,
      timestamp,
      force_overwrite: runConfig.force_overwrite,
      input_received: input,
      has_dashboard_config: !!dashboardConfig,
    });
    
    // Initialize storage (StructuredLogger removed due to undefined errors)
    let runsStorage: RunsStorage | null = null;
    
    // Track agent results for partial manifest on failure
    const agentResults: any = {};
    
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
      Logger.info('📝 UNIQUE EPISODE PATH GENERATED', { 
        runId,
        date: runConfig.date,
        path: episodePath,
        timestamp,
        note: 'Every run gets a NEW unique file - no conflicts possible',
      });
      
      // 1. INGESTION
      Logger.info('Phase 1: Ingestion');
      
      // Build TopicConfig array from dashboard settings
      // Dashboard topics have: { label, weight, sources, keywords }
      // We need TopicConfig: { name, weight, sources, keywords }
      const enabledTopicConfigs = (dashboardConfig?.topics || [])
        .filter((t: any) => runConfig.topics.includes(t.label))
        .map((t: any) => {
          // Always use Google News as base, then add custom sources from dashboard
          const customSources = this.parseCustomSources(t.custom_sources);
          const allSources = this.generateSourcesForTopic(t.label, customSources, runConfig.window_hours);
          const autoKeywords = this.generateKeywordsForTopic(t.label, t.keywords);
          
          Logger.info(`🔍 Topic config for "${t.label}"`, {
            label: t.label,
            weight: t.weight,
            sources_count: allSources.length,
            custom_sources_count: customSources.length,
            keywords_count: autoKeywords.length,
            sources_sample: allSources.slice(0, 2),
            keywords_sample: autoKeywords.slice(0, 5),
          });
          
          return {
            name: t.label,
            weight: t.weight,
            sources: allSources,
            keywords: autoKeywords,
          };
        });
      
      Logger.info('🎯 Ingestion will fetch from topics', { 
        enabled_topics: enabledTopicConfigs.map((t: any) => t.name),
        dashboard_topics_count: dashboardConfig?.topics?.length || 0,
        enabled_count: enabledTopicConfigs.length,
        full_config: enabledTopicConfigs.map((t: any) => ({
          name: t.name,
          weight: t.weight,
          sources_count: t.sources.length,
          keywords_count: t.keywords.length,
        })),
      });
      
      progressTracker.addUpdate(runId, {
        phase: 'Ingestion',
        status: 'running',
        message: 'Fetching news from RSS feeds',
        details: { topics: enabledTopicConfigs.map((t: any) => t.name) },
      });
      const ingestionStart = Date.now();
      const ingestionResult = await this.ingestionAgent.execute(runId, {
        topics: enabledTopicConfigs,  // ✅ Use filtered topics!
        window_hours: runConfig.window_hours,
        cutoff_date: Clock.addHours(new Date(), -runConfig.window_hours),
      });
      agentTimes['ingestion'] = Date.now() - ingestionStart;
      agentResults.ingestion = ingestionResult; // Save for partial manifest
      
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
      
      // ===================================================================
      // 🛑 ALL DOWNSTREAM AGENTS DISABLED TO FOCUS ON INGESTION TESTING
      // Only ingestion runs, then we save the manifest with the report
      // To re-enable: uncomment phases 2-6 below
      // ===================================================================
      
      Logger.info('⏸️  DOWNSTREAM AGENTS DISABLED - Stopping at ingestion to test URL extraction');
      
      progressTracker.addUpdate(runId, {
        phase: 'Ingestion Complete',
        status: 'completed',
        message: '✅ Ingestion complete! Check the details tab for Google News extraction results.',
      });
      
      // 2. RANKING
      Logger.info('Phase 2: Ranking');
      progressTracker.addUpdate(runId, {
        phase: 'Ranking',
        status: 'running',
        message: 'Analyzing and ranking stories by relevance',
      });
      const rankingStart = Date.now();
      Logger.info('🎯 Passing weights to ranking agent', { 
        weights: runConfig.weights,
        story_count_by_topic: ingestionResult.output.stories.reduce((acc: any, s: any) => {
          acc[s.topic] = (acc[s.topic] || 0) + 1;
          return acc;
        }, {}),
      });
      
      const rankingResult = await this.rankingAgent.execute(runId, {
        stories: ingestionResult.output.stories,
        topic_weights: runConfig.weights,
        target_count: 5,
      });
      agentTimes['ranking'] = Date.now() - rankingStart;
      agentResults.ranking = rankingResult; // Save for partial manifest
      
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
      
      // 3. SCRAPER (NEW!)
      Logger.info('Phase 3: Scraper - Fetching full article content');
      progressTracker.addUpdate(runId, {
        phase: 'Scraper',
        status: 'running',
        message: 'Enriching stories with full article content',
      });
      const scraperStart = Date.now();
      const scraperResult = await this.scraperAgent.execute(runId, {
        picks: rankingResult.output.picks,
      });
      agentTimes['scraper'] = Date.now() - scraperStart;
      agentResults.scraper = scraperResult; // Save for partial manifest
      
      Logger.info('Scraping complete', {
        successful: scraperResult.output.scraping_report.successful_scrapes,
        failed: scraperResult.output.scraping_report.failed_scrapes.length,
        avg_length: scraperResult.output.scraping_report.avg_content_length,
      });
      progressTracker.addUpdate(runId, {
        phase: 'Scraper',
        status: 'completed',
        message: `Enriched ${scraperResult.output.scraping_report.successful_scrapes}/${scraperResult.output.scraping_report.total_articles} articles`,
        details: {
          successful: scraperResult.output.scraping_report.successful_scrapes,
          failed: scraperResult.output.scraping_report.failed_scrapes.length,
          avg_content_length: scraperResult.output.scraping_report.avg_content_length,
        },
        agentData: {
          scraping_report: scraperResult.output.scraping_report,
        },
      });
      
      // 4. OUTLINE
      Logger.info('Phase 4: Outline');
      progressTracker.addUpdate(runId, {
        phase: 'Outline',
        status: 'running',
        message: 'Creating episode outline and structure',
      });
      const outlineStart = Date.now();
      const outlineResult = await this.outlineAgent.execute(runId, {
        picks: scraperResult.output.enriched_picks, // Use enriched picks with full content!
        date: runConfig.date,
        target_duration_sec: runConfig.target_duration_sec,
        topic_weights: runConfig.weights, // Pass weights to order stories by priority
        podcast_production: (runConfig as any).podcast_production,
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
      
      // 5. SCRIPTWRITING
      Logger.info('Phase 5: Scriptwriting');
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
        target_duration_sec: runConfig.target_duration_sec,
        podcast_production: (runConfig as any).podcast_production,
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
      
      // ===================================================================
      // BUILD MINIMAL MANIFEST WITH INGESTION REPORT ONLY
      // ===================================================================
      
      const ingestionReport = ingestionResult.output!.detailed_report || {
        sources_scanned: [],
        total_items_before_filter: 0,
        filtered_out: [],
        topics_breakdown: {},
        google_news_domain_extraction: {
          attempted: 0,
          successful: 0,
          failed: 0,
          success_rate: '0%'
        },
        all_stories_detailed: []
      };
      
      const pipeline_report = {
        ingestion: {
          sources_scanned: ingestionReport.sources_scanned,
          total_stories_found: ingestionReport.total_items_before_filter,
          stories_after_filtering: ingestionResult.output.stories.length,
          filtered_out: ingestionReport.filtered_out,
          topics_breakdown: ingestionReport.topics_breakdown,
          google_news_domain_extraction: ingestionReport.google_news_domain_extraction,
          all_stories_detailed: ingestionReport.all_stories_detailed,
        },
        ranking: { status: 'disabled' } as any,
        scraper: { status: 'disabled' } as any,
        outline: { status: 'disabled' } as any,
        scriptwriting: { status: 'disabled' } as any,
        factcheck: { status: 'disabled' } as any,
        safety: { status: 'disabled' } as any,
      };
      
      const manifest: EpisodeManifest = {
        run_id: runId,
        date: runConfig.date,
        title: `Daily News Briefing - ${runConfig.date} (Ingestion Test)`,
        description: 'Ingestion-only test run to verify Google News URL extraction',
        mp3_url: '',
        duration_sec: 0,
        word_count: 0,
        sections: [],
        sources: ingestionResult.output.stories.map(s => ({
          title: s.title,
          url: s.url,
        })),
        metrics: {
          ingestion_time_ms: agentTimes['ingestion'] || 0,
          ranking_time_ms: 0,
          scripting_time_ms: 0,
          tts_time_ms: 0,
          total_time_ms: Date.now() - startTime,
          openai_tokens: 0,
        },
        pipeline_report,
      };
      
      // Save manifest
      Logger.info('Saving ingestion-only manifest');
      await this.storage.put(
        `episodes/${runId}_manifest.json`,
        JSON.stringify(manifest, null, 2),
        'application/json'
      );
      
      const totalTime = Date.now() - startTime;
      
      Logger.info('Ingestion test complete', {
        runId,
        total_time_ms: totalTime,
        stories_found: ingestionResult.output.stories.length,
        google_news_extraction: ingestionReport.google_news_domain_extraction,
      });
      
      progressTracker.addUpdate(runId, {
        phase: 'Complete',
        status: 'completed',
        message: `Ingestion test complete (${Math.floor(totalTime / 1000)}s) - Check Details tab for URL extraction results`,
        details: {
          stories_found: ingestionResult.output.stories.length,
          google_news_extraction: ingestionReport.google_news_domain_extraction,
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
      
      /*
      // 7. TTS DIRECTOR (DISABLED)
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
      
      // 8. AUDIO ENGINEER (DISABLED)
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
      */
      
      // OLD FULL PIPELINE CODE - ALL DISABLED
      /*
      // Create manifest
      // Build pipeline report from all agent outputs
      const ingestionReport = ingestionResult.output!.detailed_report || {
        sources_scanned: [],
        total_items_before_filter: 0,
        filtered_out: [],
        topics_breakdown: {},
      };
      
      // Calculate stories_after_filtering from topics_breakdown
      const storiesAfterFiltering = Object.values(ingestionReport.topics_breakdown).reduce((sum: number, count: number) => sum + count, 0);
      
      const pipeline_report_OLD = {
        ingestion: {
          sources_scanned: ingestionReport.sources_scanned,
          total_stories_found: ingestionReport.total_items_before_filter,
          stories_after_filtering: storiesAfterFiltering,
          filtered_out: ingestionReport.filtered_out,
          topics_breakdown: ingestionReport.topics_breakdown,
          google_news_domain_extraction: ingestionReport.google_news_domain_extraction,
          all_stories_detailed: ingestionReport.all_stories_detailed,
        },
        ranking: rankingResult.output!.detailed_report || {
          stories_ranked: 0,
          top_picks: [],
          rejected_stories: [],
        },
        scraper: scraperResult.output!.scraping_report,
        outline: {
          sections: outlineResult.output!.outline.sections.map((s: any) => ({
            type: s.type,
            title: s.title,
            target_words: s.target_words || 0,
            story_count: (s.refs || []).length,
          })),
          total_duration_target: runConfig.target_duration_sec,
        },
        scriptwriting: scriptResult.output!.detailed_report || {
          sections_generated: 0,
          total_word_count: 0,
          full_script_text: '',
          citations_used: [],
        },
        factcheck: factCheckResult.output!.detailed_report || {
          changes_made: [],
          flags_raised: [],
        },
        safety: safetyResult.output!.detailed_report || {
          edits_made: [],
          risk_level: 'none',
        },
      };
      
      Logger.info('Pipeline report compiled', {
        ingestion_stories: pipeline_report.ingestion.topics_breakdown,
        ranking_picks: pipeline_report.ranking.top_picks.length,
        outline_sections: pipeline_report.outline.sections.length,
      });
      
      const manifest: EpisodeManifest = {
        date: runConfig.date,
        run_id: runId,
        picks: rankingResult.output.picks,
        outline_hash: Crypto.contentId(outlineResult.output!.outline),
        script_hash: Crypto.contentId(safetyResult.output!.script),
        audio_hash: 'NO_AUDIO_GENERATED', // Audio generation disabled
        mp3_url: '', // No audio file
        duration_sec: 0, // No audio duration
        word_count: safetyResult.output!.script.word_count,
        created_at: new Date().toISOString(),
        pipeline_report, // Add the compiled report
        metrics: {
          ingestion_time_ms: agentTimes['ingestion'],
          ranking_time_ms: agentTimes['ranking'],
          scripting_time_ms: agentTimes['scriptwriter'],
          tts_time_ms: 0, // No TTS
          total_time_ms: Date.now() - startTime,
          openai_tokens: 0, // Would need to track from actual API calls
        },
      };
      */
      
      /*
      // 10. PUBLISHER (DISABLED - no audio to publish)
      Logger.info('Phase 10: Publishing');
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
      
      // 11. MEMORY UPDATE (DISABLED)
      Logger.info('Phase 11: Memory Update');
      const memoryStart = Date.now();
      await this.memoryAgent.execute(runId, {
        manifest,
      });
      agentTimes['memory'] = Date.now() - memoryStart;
      */
      
      // Save manifest directly (since publisher is disabled)
      Logger.info('Saving manifest without audio');
      await this.storage.put(
        `episodes/${runId}_manifest.json`,
        JSON.stringify(manifest, null, 2),
        'application/json'
      );
      
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
          ingestion_time_ms: agentTimes['ingestion'] || 0,
          ranking_time_ms: agentTimes['ranking'] || 0,
          scripting_time_ms: agentTimes['scriptwriter'] || 0,
          tts_time_ms: agentTimes['audio_engineer'] || 0,
          total_time_ms: totalTime,
          openai_tokens: 0,
        };
      }
      (manifest.metrics as any).openai_api_calls = totalApiCalls;
      (manifest.metrics as any).api_calls_by_agent = apiCalls;
      
      progressTracker.addUpdate(runId, {
        phase: 'Complete',
        status: 'completed',
        message: manifest.mp3_url 
          ? `Episode generated (${Math.floor(totalTime / 1000)}s, ${totalApiCalls} API calls)`
          : `Script generated (${Math.floor(totalTime / 1000)}s, ${totalApiCalls} API calls) - Audio disabled`,
        details: {
          duration_sec: manifest.duration_sec,
          word_count: manifest.word_count,
          episode_url: manifest.mp3_url || 'No audio (disabled)',
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
        details: { 
          error: (error as Error).message,
          stack: (error as Error).stack,
          completed_agents: Object.keys(agentResults),
        },
      });
      
      // Build PARTIAL manifest from completed agents
      try {
        const partialManifest = this.buildPartialManifest(runId, runConfig, agentResults, agentTimes, (error as Error).message);
        
        // Save partial manifest for debugging (use same path format as RunsStorage expects)
        await this.storage.put(
          `episodes/${runId}_manifest.json`,
          JSON.stringify(partialManifest, null, 2),
          'application/json'
        );
        
        Logger.info('Saved partial manifest for failed run', {
          runId,
          completed_agents: Object.keys(agentResults),
          manifest_path: `episodes/${runId}_manifest.json`,
        });
      } catch (manifestError) {
        Logger.error('Failed to save partial manifest', {
          error: (manifestError as Error).message,
          stack: (manifestError as Error).stack,
        });
      }
      
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
  
  private async buildRunConfig(input: OrchestratorInput): Promise<RunConfig & { podcast_production?: any; dashboardConfig?: any }> {
    const date = input.date || Clock.toDateString(Clock.nowUtc());
    
    // Load configuration from ConfigStorage (dashboard settings)
    const configStorage = new ConfigStorage();
    let dashboardConfig;
    try {
      Logger.info('🔍 ATTEMPTING TO LOAD DASHBOARD CONFIG...');
      dashboardConfig = await configStorage.load();
      Logger.info('✅ DASHBOARD CONFIG LOADED SUCCESSFULLY', {
        topics_count: dashboardConfig.topics.length,
        topics: dashboardConfig.topics.map((t: any) => ({ label: t.label, weight: t.weight })),
        has_production_settings: !!dashboardConfig.podcast_production,
      });
    } catch (error) {
      Logger.error('❌ FAILED TO LOAD DASHBOARD CONFIG', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      dashboardConfig = null;
    }
    
    // Get weights and topics from dashboard config or memory profile
    let weights = input.weights || Config.parseTopicWeights();
    let topics = input.topics || [];
    
    Logger.info('🎯 BEFORE DASHBOARD CONFIG CHECK', {
      input_weights: input.weights,
      input_topics: input.topics,
      has_dashboard_config: !!dashboardConfig,
      initial_weights: weights,
      initial_topics: topics,
    });
    
    if (!input.weights && dashboardConfig) {
      // Use topic weights from dashboard config
      const topicWeights: Record<string, number> = {};
      const enabledTopics: string[] = [];
      
      Logger.info('🔧 PROCESSING DASHBOARD TOPICS', {
        raw_topics: dashboardConfig.topics,
      });
      
      dashboardConfig.topics.forEach((t: any) => {
        topicWeights[t.label.toLowerCase()] = t.weight;
        // Only include topics with non-zero weight
        if (t.weight > 0) {
          enabledTopics.push(t.label);
          Logger.info(`  ✅ Topic ENABLED: ${t.label} (weight: ${t.weight})`);
        } else {
          Logger.info(`  ❌ Topic DISABLED: ${t.label} (weight: ${t.weight})`);
        }
      });
      
      weights = topicWeights;
      topics = enabledTopics.length > 0 ? enabledTopics : [];
      
    Logger.info('✅ FINAL DASHBOARD CONFIGURATION', { 
      enabled_topics: topics,
      topic_weights: topicWeights,
      fallback_used: enabledTopics.length === 0,
    });
    
    // Validate that we have at least one topic configured
    if (!topics || topics.length === 0) {
      throw new Error(
        '❌ NO TOPICS CONFIGURED! Please go to Dashboard Settings and configure at least one topic with weight > 0.'
      );
    }
    } else if (!input.weights) {
      Logger.info('⚠️ NO DASHBOARD CONFIG - using memory or defaults');
      try {
        const profile = await this.memoryAgent.getProfile();
        weights = profile.topic_weights;
        Logger.info('Using memory profile weights', { weights });
      } catch {
        Logger.info('Using default weights from Config');
      }
    } else {
      Logger.info('⚠️ Using input.weights (not dashboard)', { weights: input.weights });
    }
    
    return {
      date,
      topics,
      window_hours: input.window_hours || dashboardConfig?.window_hours || Config.WINDOW_HOURS,
      weights,
      force_overwrite: input.force_overwrite || Config.FORCE_OVERWRITE,
      rumor_filter: input.rumor_filter !== undefined ? input.rumor_filter : (dashboardConfig?.rumor_filter ?? Config.RUMOR_FILTER),
      target_duration_sec: dashboardConfig?.target_duration_sec || Config.TARGET_DURATION_SECONDS,
      dashboardConfig, // Pass dashboard config to run() so it can build TopicConfig array
      podcast_production: dashboardConfig?.podcast_production || {
        intro_text: 'This is your daily podcast to recap recent news. Today we\'ll cover:',
        outro_text: 'That\'s your executive brief. Stay informed, stay ahead.',
        enable_intro_music: true,
        enable_outro_music: true,
        intro_music_duration_ms: 3000,
        outro_music_duration_ms: 2000,
        pause_after_intro_ms: 800,
        pause_between_stories_ms: 1200,
        pause_before_outro_ms: 500,
        num_stories_min: 3,
        num_stories_max: 5,
        style: 'executive',
      },
    };
  }
  
  /**
   * Build partial manifest from completed agents (for failed runs)
   */
  private buildPartialManifest(
    runId: string,
    runConfig: any,
    agentResults: any,
    agentTimes: Record<string, number>,
    errorMessage: string
  ): any {
    const partial: any = {
      run_id: runId,
      date: runConfig.date,
      status: 'failed',
      error: errorMessage,
      created_at: new Date().toISOString(),
      metrics: {
        ingestion_time_ms: agentTimes['ingestion'] || 0,
        ranking_time_ms: agentTimes['ranking'] || 0,
        scraping_time_ms: agentTimes['scraper'] || 0,
        total_time_ms: Object.values(agentTimes).reduce((sum, t) => sum + t, 0),
      },
      pipeline_report: {} as any,
    };

    // Add ingestion data if available
    if (agentResults.ingestion?.output?.detailed_report) {
      const ingestionReport = agentResults.ingestion.output.detailed_report;
      const storiesAfterFiltering = Object.values(ingestionReport.topics_breakdown || {})
        .reduce((sum: number, count: number) => sum + count, 0);
      
      partial.pipeline_report.ingestion = {
        sources_scanned: ingestionReport.sources_scanned || [],
        total_stories_found: ingestionReport.total_items_before_filter || 0,
        stories_after_filtering: storiesAfterFiltering,
        filtered_out: ingestionReport.filtered_out || [],
        topics_breakdown: ingestionReport.topics_breakdown || {},
        google_news_domain_extraction: ingestionReport.google_news_domain_extraction,
        all_stories_detailed: ingestionReport.all_stories_detailed || [],
      };
    }

    // Add ranking data if available
    if (agentResults.ranking?.output?.detailed_report) {
      partial.pipeline_report.ranking = agentResults.ranking.output.detailed_report;
      partial.picks = agentResults.ranking.output.picks || [];
    }

    // Add scraper data if available
    if (agentResults.scraper?.output?.scraping_report) {
      partial.pipeline_report.scraper = agentResults.scraper.output.scraping_report;
    }

    return partial;
  }

  /**
   * Generate RSS sources for a topic
   * Always includes Google News as the base, then adds custom sources
   */
    private generateSourcesForTopic(topicLabel: string, customSources?: string[], windowHours?: number): string[] {
        // Add date filtering to Google News search query
        // Google News RSS caches results, so we add "after:" to force recent results
        // IMPORTANT: Use the SAME cutoff as ingestion quality filter (window_hours)
        const cutoffHours = windowHours || 72; // Default to 72 if not provided
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - cutoffHours);
        const dateStr = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Include date filter in search query: "Verizon after:2025-11-08"
        const searchWithDate = `${topicLabel} after:${dateStr}`;
        const searchQuery = encodeURIComponent(searchWithDate);
        
        // ALWAYS start with Google News as the base source
        const sources: string[] = [
            `https://news.google.com/rss/search?q=${searchQuery}&hl=en-US&gl=US&ceid=US:en`,
        ];
        
        // Add custom sources from dashboard if provided
        if (customSources && customSources.length > 0) {
            sources.push(...customSources);
        }
        
        Logger.info(`Generated sources for "${topicLabel}"`, { 
            search_query: searchWithDate,
            cutoff_hours: cutoffHours,
            cutoff_date: cutoffDate.toISOString(),
            google_news: sources[0],
            custom_sources_count: customSources?.length || 0,
            total_sources: sources.length
        });
        
        return sources;
    }
    
  /**
   * Parse comma-separated custom sources string into array
   */
    private parseCustomSources(customSourcesStr?: string): string[] {
        if (!customSourcesStr || customSourcesStr.trim() === '') {
            return [];
        }
        
        return customSourcesStr
            .split(',')
            .map(src => src.trim())
            .filter(src => src.length > 0 && src.startsWith('http')); // Only valid HTTP(S) URLs
    }
  
  /**
   * Auto-generate keywords for a topic if not provided
   */
  private generateKeywordsForTopic(topicLabel: string, existingKeywords?: string[]): string[] {
    // If dashboard already configured keywords, use them
    if (existingKeywords && existingKeywords.length > 0) {
      return existingKeywords;
    }
    
    // Simple: use the exact topic label and split it into words
    const keywords: string[] = [topicLabel]; // Full label
    
    // Add individual words from the label
    const words = topicLabel.split(/\s+/).map(w => w.trim()).filter(w => w.length > 0);
    keywords.push(...words.map(w => w.toLowerCase()));
    
    Logger.debug(`Auto-generated keywords for "${topicLabel}"`, { keywords });
    
    return keywords;
  }
}

