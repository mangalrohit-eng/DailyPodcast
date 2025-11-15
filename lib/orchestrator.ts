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
      
      // Helper function to check for cancellation
      const checkCancellation = () => {
        if (progressTracker.isCancelRequested(runId)) {
          throw new Error('Run cancelled by user');
        }
      };
      
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
      checkCancellation(); // Check for cancellation before each phase
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
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
      checkCancellation(); // Check for cancellation before each phase
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
      
      // Calculate adjusted target count based on historical scraping success rate
      const baseTargetCount = 5; // Desired final number of stories
      const historicalScrapeRate = await runsStorage.getAverageScrapeSuccessRate(5);
      
      let adjustedTargetCount = baseTargetCount;
      if (historicalScrapeRate !== null && historicalScrapeRate > 0.1) {
        // Adjustment factor: 1 / success_rate
        // Example: If success rate is 60%, request 5 / 0.6 = 8.33 ≈ 8 stories
        const adjustmentFactor = 1 / historicalScrapeRate;
        adjustedTargetCount = Math.ceil(baseTargetCount * adjustmentFactor);
        
        // Cap at reasonable bounds (don't request too many stories)
        adjustedTargetCount = Math.min(adjustedTargetCount, baseTargetCount * 3);
        adjustedTargetCount = Math.max(adjustedTargetCount, baseTargetCount);
        
        Logger.info('📊 Adjusting target count based on historical scraping success', {
          base_target: baseTargetCount,
          historical_success_rate: Math.round(historicalScrapeRate * 100) + '%',
          adjustment_factor: adjustmentFactor.toFixed(2),
          adjusted_target: adjustedTargetCount,
          rationale: `Requesting ${adjustedTargetCount} stories expecting ~${Math.round(adjustedTargetCount * historicalScrapeRate)} to succeed`,
        });
      } else {
        Logger.info('📊 No historical scraping data, using base target count', {
          base_target: baseTargetCount,
          note: 'Will start collecting data after first few episodes',
        });
      }
      
      const rankingResult = await this.rankingAgent.execute(runId, {
        stories: ingestionResult.output.stories,
        topic_weights: runConfig.weights,
        target_count: adjustedTargetCount,
      });
      agentTimes['ranking'] = Date.now() - rankingStart;
      agentResults.ranking = rankingResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
      checkCancellation(); // Check for cancellation before each phase
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
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
      
      // Filter out picks where scraping failed - only use successfully scraped stories
      const successfullyScrapedPicks = scraperResult.output.enriched_picks.filter(pick => {
        // A pick is successfully scraped if it has meaningful raw content (>500 chars)
        return pick.story.raw && pick.story.raw.length > 500;
      });
      
      const filteredCount = scraperResult.output.enriched_picks.length - successfullyScrapedPicks.length;
      
      if (filteredCount > 0) {
        Logger.info(`Filtered out ${filteredCount} stories with failed scrapes`, {
          original_count: scraperResult.output.enriched_picks.length,
          successfully_scraped: successfullyScrapedPicks.length,
          filtered_out: filteredCount,
        });
      }
      
      // Check if we have enough stories after filtering
      if (successfullyScrapedPicks.length === 0) {
        throw new Error('No stories successfully scraped - cannot create episode without content');
      }
      
      // 4. OUTLINE
      checkCancellation(); // Check for cancellation before each phase
      Logger.info('Phase 4: Outline');
      progressTracker.addUpdate(runId, {
        phase: 'Outline',
        status: 'running',
        message: 'Creating episode outline and structure',
      });
      const outlineStart = Date.now();
      const outlineResult = await this.outlineAgent.execute(runId, {
        picks: successfullyScrapedPicks, // Use ONLY successfully scraped picks with full content!
        date: runConfig.date,
        target_duration_sec: runConfig.target_duration_sec,
        topic_weights: runConfig.weights, // Pass weights to order stories by priority
        podcast_production: (runConfig as any).podcast_production,
      });
      agentTimes['outline'] = Date.now() - outlineStart;
      agentResults.outline = outlineResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
      checkCancellation(); // Check for cancellation before each phase
      Logger.info('Phase 5: Scriptwriting');
      progressTracker.addUpdate(runId, {
        phase: 'Scriptwriting',
        status: 'running',
        message: 'Writing conversational script with AI',
      });
      const scriptStart = Date.now();
      const scriptResult = await this.scriptwriterAgent.execute(runId, {
        outline: outlineResult.output!.outline,
        picks: scraperResult.output.enriched_picks, // Use enriched picks with scraped content!
        date: runConfig.date,
        listener_name: '', // Generic audience - no personalized name
        target_duration_sec: runConfig.target_duration_sec,
        podcast_production: (runConfig as any).podcast_production,
      });
      agentTimes['scriptwriter'] = Date.now() - scriptStart;
      agentResults.scriptwriter = scriptResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
      checkCancellation(); // Check for cancellation before each phase
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
      agentResults.factcheck = factCheckResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
      Logger.info('Fact-check complete', {
        changes: factCheckResult.output!.changes_made.length,
        flags: factCheckResult.output!.flags_raised.length,
      });
      
      // 6. SAFETY
      checkCancellation(); // Check for cancellation before each phase
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
      agentResults.safety = safetyResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
      Logger.info('Safety check complete', {
        edits: safetyResult.output!.edits_made.length,
        risk_level: safetyResult.output!.risk_level,
      });
      
      if (safetyResult.output!.risk_level === 'high') {
        Logger.warn('High risk content detected - review before publishing');
      }
      
      // ===================================================================
      // BUILD COMPLETE MANIFEST WITH ALL AGENT OUTPUTS
      // ===================================================================
      
      // 7. TTS DIRECTOR
      checkCancellation(); // Check for cancellation before each phase
      Logger.info('Phase 7: TTS Planning');
      
      // CRITICAL: Validate all sections have text before TTS
      const invalidSections = safetyResult.output!.script.sections.filter((s: any, idx: number) => {
        if (!s || !s.text || typeof s.text !== 'string') {
          Logger.error('Invalid section before TTS', { 
            index: idx, 
            type: s?.type, 
            has_text: !!s?.text,
            text_type: typeof s?.text,
            text_value: s?.text
          });
          return true;
        }
        return false;
      });
      
      if (invalidSections.length > 0) {
        throw new Error(`Cannot generate TTS: ${invalidSections.length} sections have invalid text. Check Safety and Fact-Check agents.`);
      }
      
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
      agentResults.tts_director = ttsDirectorResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
      // 8. AUDIO ENGINEER
      checkCancellation(); // Check for cancellation before each phase
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
      agentResults.audio_engineer = audioResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
      // Build pipeline report from all agent outputs
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
        ranking: {
          ...(rankingResult.output!.detailed_report || {
            stories_ranked: 0,
            top_picks: [],
            rejected_stories: [],
          }),
          // Add dynamic ranking stats
          dynamic_selection: {
            base_target: baseTargetCount,
            historical_scraping_rate: historicalScrapeRate,
            adjusted_target: adjustedTargetCount,
            actually_selected: rankingResult.output.picks.length,
          },
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
        tts_director: {
          segments_planned: ttsDirectorResult.output!.synthesis_plan?.length || 0,
          estimated_duration_sec: ttsDirectorResult.output!.estimated_duration_sec || 0,
          synthesis_plan: ttsDirectorResult.output!.synthesis_plan || [],
        },
        audio_engineer: {
          actual_duration_sec: audioResult.output!.actual_duration_sec || 0,
          audio_size_bytes: audioResult.output!.audio_buffer?.length || 0,
        },
        // Publisher and Memory data will be added after they run
      };
      
      Logger.info('Pipeline report compiled', {
        ingestion_stories: pipeline_report.ingestion.topics_breakdown,
        ranking_picks: pipeline_report.ranking.top_picks.length,
        outline_sections: pipeline_report.outline.sections.length,
      });
      
      // Generate dynamic episode title and description based on content
      const episodeTitle = this.generateEpisodeTitle(rankingResult.output.picks, runConfig.date);
      const episodeDescription = this.generateEpisodeDescription(rankingResult.output.picks, runConfig.date);
      
      // Save script versions for comparison
      const scriptVersions = {
        original: JSON.parse(JSON.stringify(scriptResult.output!.script)), // Deep clone
        after_factcheck: JSON.parse(JSON.stringify(factCheckResult.output!.script)),
        final: safetyResult.output!.script,
      };
      
      const manifest: EpisodeManifest = {
        date: runConfig.date,
        run_id: runId,
        title: episodeTitle,
        description: episodeDescription,
        picks: rankingResult.output.picks,
        outline_hash: Crypto.contentId(outlineResult.output!.outline),
        script_hash: Crypto.contentId(safetyResult.output!.script),
        script_versions: scriptVersions, // Include all versions
        audio_hash: Crypto.contentId(audioResult.output!.audio_buffer),
        mp3_url: '', // Will be set by publisher
        duration_sec: audioResult.output!.actual_duration_sec,
        word_count: safetyResult.output!.script.word_count,
        sections: safetyResult.output!.script.sections,
        sources: rankingResult.output.picks.map(p => ({
          title: p.story.title,
          url: p.story.url,
        })),
        created_at: new Date().toISOString(),
        pipeline_report,
        metrics: {
          ingestion_time_ms: agentTimes['ingestion'],
          ranking_time_ms: agentTimes['ranking'],
          scripting_time_ms: agentTimes['scriptwriter'],
          tts_time_ms: agentTimes['audio_engineer'],
          total_time_ms: Date.now() - startTime,
          openai_tokens: 0,
        },
      };
      
      // 9. PUBLISHER
      checkCancellation(); // Check for cancellation before each phase
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
        podcast_config: await Config.getPodcastConfig(),
      });
      agentTimes['publisher'] = Date.now() - publishStart;
      agentResults.publisher = publishResult; // Save for partial manifest
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
      Logger.info('Publishing complete', {
        episode_url: publishResult.output!.episode_url,
      });
      
      // Update manifest with published episode URL
      manifest.mp3_url = publishResult.output!.episode_url;
      
      // Add publisher data to pipeline report
      pipeline_report.publisher = {
        episode_url: publishResult.output!.episode_url || '',
        file_size: publishResult.output!.file_size || 0,
        published_at: new Date().toISOString(),
      };
      
      // Update manifest with new pipeline_report
      manifest.pipeline_report = pipeline_report;
      
      // 10. MEMORY UPDATE
      checkCancellation(); // Check for cancellation before each phase
      Logger.info('Phase 10: Memory Update');
      const memoryStart = Date.now();
      const memoryResult = await this.memoryAgent.execute(runId, {
        manifest,
      });
      agentTimes['memory'] = Date.now() - memoryStart;
      agentResults.memory = memoryResult; // Save for partial manifest
      
      // Add memory data to pipeline report
      pipeline_report.memory = {
        insights_learned: 0, // Memory agent doesn't return detailed metrics yet
        trends_identified: 0,
      };
      
      // Update manifest with final pipeline_report
      manifest.pipeline_report = pipeline_report;
      
      await this.savePartialManifest(runId, runConfig, agentResults, agentTimes); // Real-time streaming
      
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
        // Pass scraping stats for historical tracking
        const scrapingStats = scraperResult.output?.scraping_report ? {
          total_attempts: scraperResult.output.scraping_report.total_articles,
          successful: scraperResult.output.scraping_report.successful_scrapes,
          failed: scraperResult.output.scraping_report.failed_scrapes.length,
        } : undefined;
        
        await runsStorage.completeRun(runId, manifest, scrapingStats);
        Logger.info('Run index updated successfully', { runId, scraping_stats: scrapingStats });
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
      
      // Update existing partial manifest with failure status (don't overwrite good data!)
      try {
        const manifestPath = `episodes/${runId}_manifest.json`;
        
        // Try to load existing manifest first (from real-time saves)
        let existingManifest = null;
        try {
          const existingData = await this.storage.get(manifestPath);
          existingManifest = JSON.parse(existingData.toString('utf-8'));
          Logger.info('Found existing manifest to update with failure status', { runId });
        } catch (e) {
          Logger.info('No existing manifest found, building new partial manifest', { runId });
        }
        
        if (existingManifest) {
          // Update existing manifest with failure status and error message
          existingManifest.status = 'failed';
          existingManifest.error = (error as Error).message;
          existingManifest.completed_at = new Date().toISOString();
          
          await this.storage.put(
            manifestPath,
            JSON.stringify(existingManifest, null, 2),
            'application/json'
          );
          
          Logger.info('Updated existing manifest with failure status', {
            runId,
            preserved_data: Object.keys(existingManifest.pipeline_report || {}),
          });
        } else {
          // Build new partial manifest if no existing one found
          const partialManifest = this.buildPartialManifest(runId, runConfig, agentResults, agentTimes, (error as Error).message);
          
          await this.storage.put(
            manifestPath,
            JSON.stringify(partialManifest, null, 2),
            'application/json'
          );
          
          Logger.info('Saved new partial manifest for failed run', {
            runId,
            completed_agents: Object.keys(agentResults),
          });
        }
      } catch (manifestError) {
        Logger.error('Failed to save/update partial manifest', {
          error: (manifestError as Error).message,
          stack: (manifestError as Error).stack,
        });
      }
      
      // Fail the run
      if (runsStorage) {
        await runsStorage.failRun(runId, (error as Error).message);
      }
      
      // Build partial manifest for the error response
      let errorManifest = null;
      try {
        errorManifest = this.buildPartialManifest(runId, runConfig, agentResults, agentTimes, (error as Error).message);
      } catch (e) {
        Logger.warn('Could not build error manifest', { error: (e as Error).message });
      }
      
      return {
        success: false,
        error: (error as Error).message,
        manifest: errorManifest,
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
   * Save partial manifest to S3 (for real-time streaming)
   */
  private async savePartialManifest(
    runId: string,
    runConfig: any,
    agentResults: any,
    agentTimes: Record<string, number>
  ): Promise<void> {
    try {
      const partial = this.buildPartialManifest(runId, runConfig, agentResults, agentTimes, 'In progress...');
      partial.status = 'running'; // Override status to 'running' for in-progress saves
      
      await this.storage.put(
        `episodes/${runId}_manifest.json`,
        JSON.stringify(partial, null, 2),
        'application/json'
      );
      
      Logger.debug('Partial manifest saved', { 
        runId, 
        completed_agents: Object.keys(agentResults),
      });
    } catch (error) {
      // Don't fail the whole run if manifest save fails
      Logger.warn('Failed to save partial manifest', { 
        error: (error as Error).message,
      });
    }
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
      picks: [], // Default to empty array to prevent "not iterable" errors
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

    // Add outline data if available
    if (agentResults.outline?.output?.outline) {
      partial.pipeline_report.outline = {
        sections: agentResults.outline.output.outline.sections.map((s: any) => ({
          type: s.type,
          title: s.title,
          target_words: s.target_words,
          refs: s.refs,
        })),
        total_sections: agentResults.outline.output.outline.sections.length,
      };
    }

    // Add scriptwriting data if available
    if (agentResults.scriptwriter?.output) {
      // Use detailed_report which has the right structure for the dashboard
      partial.pipeline_report.scriptwriting = agentResults.scriptwriter.output.detailed_report || {
        sections_generated: 0,
        total_word_count: 0,
        full_script_text: '',
        citations_used: [],
      };
      
      // Also populate manifest fields from script
      if (agentResults.scriptwriter.output.script) {
        partial.word_count = agentResults.scriptwriter.output.script.word_count;
        partial.script_text = agentResults.scriptwriter.output.script.sections
          .filter((s: any) => s && s.text && typeof s.text === 'string')
          .map((s: any) => s.text)
          .join('\n\n');
      }
    }

    // Add fact-check data if available
    if (agentResults.factcheck?.output?.detailed_report) {
      partial.pipeline_report.factcheck = agentResults.factcheck.output.detailed_report;
    }

    // Add safety data if available
    if (agentResults.safety?.output?.detailed_report) {
      partial.pipeline_report.safety = agentResults.safety.output.detailed_report;
    }

    // Add TTS Director data if available
    if (agentResults.tts_director?.output) {
      partial.pipeline_report.tts_director = {
        segments_planned: agentResults.tts_director.output.synthesis_plan?.length || 0,
        estimated_duration_sec: agentResults.tts_director.output.estimated_duration_sec || 0,
        synthesis_plan: agentResults.tts_director.output.synthesis_plan || [],
      };
    }

    // Add Audio Engineer data if available
    if (agentResults.audio_engineer?.output) {
      partial.pipeline_report.audio_engineer = {
        actual_duration_sec: agentResults.audio_engineer.output.actual_duration_sec || 0,
        audio_size_bytes: agentResults.audio_engineer.output.audio_buffer?.length || 0,
      };
    }

    // Add Publisher data if available
    if (agentResults.publisher?.output) {
      partial.pipeline_report.publisher = {
        episode_url: agentResults.publisher.output.episode_url || '',
        file_size: agentResults.publisher.output.file_size || 0,
        published_at: agentResults.publisher.output.published_at || new Date().toISOString(),
      };
    }

    // Add Memory data if available
    if (agentResults.memory?.output) {
      partial.pipeline_report.memory = {
        insights_learned: agentResults.memory.output.insights_learned || 0,
        trends_identified: agentResults.memory.output.trends_identified || 0,
      };
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
  
  /**
   * Generate dynamic episode title based on actual story content
   */
  private generateEpisodeTitle(picks: any[], date: string): string {
    // Extract key themes from story titles (not just topic labels)
    const keyThemes = this.extractKeyThemes(picks);
    
    Logger.info('Generated episode title themes', {
      story_count: picks.length,
      story_titles: picks.map(p => p.story.title).slice(0, 3),
      extracted_themes: keyThemes,
    });
    
    // Format date (e.g., "Nov 15")
    const dateObj = new Date(date);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedDate = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;
    
    // Create title based on extracted themes
    let title: string;
    if (keyThemes.length === 0) {
      title = `Daily Brief - ${formattedDate}`;
    } else if (keyThemes.length === 1) {
      title = `${keyThemes[0]} - ${formattedDate}`;
    } else if (keyThemes.length === 2) {
      title = `${keyThemes[0]} & ${keyThemes[1]} - ${formattedDate}`;
    } else {
      // Take top 3 themes
      const topThree = keyThemes.slice(0, 3);
      title = `${topThree[0]}, ${topThree[1]} & ${topThree[2]} - ${formattedDate}`;
    }
    
    Logger.info('Final episode title', { title });
    return title;
  }
  
  /**
   * Extract key themes from story titles - focusing on WHAT HAPPENED, not just WHO
   */
  private extractKeyThemes(picks: any[]): string[] {
    // Action words that make titles more descriptive
    const actionWords = new Set([
      'layoffs', 'layoff', 'cuts', 'cutting', 'fired', 'fires',
      'acquisition', 'acquires', 'acquired', 'buys', 'bought', 'purchase',
      'raises', 'raised', 'funding', 'investment', 'invests',
      'valuation', 'valued', 'worth',
      'lawsuit', 'sues', 'sued', 'legal', 'court',
      'breach', 'hack', 'hacked', 'attack', 'attacked',
      'launches', 'launch', 'released', 'announces', 'unveiled',
      'earnings', 'revenue', 'profit', 'loss', 'quarterly',
      'merger', 'merges', 'partnership', 'partners',
      'ipo', 'public', 'listing',
      'bankruptcy', 'bankrupt', 'shutdown', 'closes',
      'expansion', 'expands', 'growing', 'growth'
    ]);
    
    // Extract key phrases from story titles (entity + action)
    const keyPhrases: Array<{ phrase: string; score: number }> = [];
    
    for (const pick of picks) {
      const title = pick.story.title || '';
      const titleLower = title.toLowerCase();
      
      // Look for action words in the title
      const foundActions: string[] = [];
      for (const action of actionWords) {
        if (titleLower.includes(action)) {
          foundActions.push(action);
        }
      }
      
      // If we found actions, try to extract meaningful phrases
      if (foundActions.length > 0) {
        // Try to get company/entity name from title (usually first capitalized word)
        const words = title.split(/\s+/);
        let entity = '';
        
        for (const word of words) {
          const cleaned = word.replace(/[^a-zA-Z0-9]/g, '');
          // Look for capitalized word longer than 3 chars
          if (cleaned.length > 3 && cleaned[0] === cleaned[0].toUpperCase()) {
            entity = cleaned;
            break;
          }
        }
        
        // For each action found, create a phrase
        for (const action of foundActions) {
          let phrase = '';
          
          // Check for number + action patterns (e.g., "15,000 layoffs")
          const numberMatch = title.match(/(\d+[,\d]*)\s+(\w+)/);
          if (numberMatch && actionWords.has(numberMatch[2].toLowerCase())) {
            phrase = `${numberMatch[1]} ${this.capitalizeWord(numberMatch[2])}`;
          }
          // Check for entity + action patterns
          else if (entity) {
            phrase = `${entity} ${this.capitalizeWord(action)}`;
          }
          // Just use the action word alone
          else {
            phrase = this.capitalizeWord(action);
          }
          
          if (phrase) {
            // Normalize for better deduplication (handle singular/plural, etc.)
            const normalizedPhrase = this.normalizePhrase(phrase);
            
            // Check if we already have this phrase (or a very similar one)
            const existing = keyPhrases.find(p => 
              this.normalizePhrase(p.phrase) === normalizedPhrase
            );
            if (existing) {
              existing.score += 2; // Boost if mentioned multiple times
            } else {
              keyPhrases.push({ phrase, score: 5 }); // High initial score for action phrases
            }
          }
        }
      }
    }
    
    // Also extract company names as fallback
    const companyNames: Set<string> = new Set();
    for (const pick of picks) {
      const title = pick.story.title || '';
      const words = title.split(/\s+/);
      
      for (const word of words) {
        const cleaned = word.replace(/[^a-zA-Z0-9&]/g, '');
        if (cleaned.length > 3 && cleaned[0] === cleaned[0].toUpperCase()) {
          // Skip generic words
          if (!['News', 'Tech', 'Report', 'Today', 'Breaking'].includes(cleaned)) {
            companyNames.add(cleaned);
          }
        }
      }
    }
    
    // Add company names with lower priority than action phrases
    for (const company of companyNames) {
      const existing = keyPhrases.find(p => p.phrase === company);
      if (!existing) {
        keyPhrases.push({ phrase: company, score: 2 }); // Lower score for just company names
      }
    }
    
    // Sort by score
    keyPhrases.sort((a, b) => b.score - a.score);
    
    // Return top 3 phrases
    return keyPhrases.slice(0, 3).map(p => p.phrase);
  }
  
  /**
   * Capitalize first letter of a word
   */
  private capitalizeWord(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }
  
  /**
   * Normalize phrase for better deduplication (singular/plural, case, etc.)
   */
  private normalizePhrase(phrase: string): string {
    return phrase
      .toLowerCase()
      .replace(/s$/, '')         // Remove trailing 's' (plural)
      .replace(/es$/, '')        // Remove trailing 'es' (plural)
      .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
      .trim();
  }
  
  /**
   * Check if a word is a significant tech/business term
   */
  private isSignificantTerm(word: string): boolean {
    const significantTerms = [
      'ai', 'artificial', 'intelligence', 'openai', 'chatgpt', 'gpt',
      'tech', 'technology', 'cloud', 'data', 'software', 'hardware',
      'market', 'stock', 'billion', 'million', 'revenue', 'profit',
      'layoffs', 'hiring', 'acquisition', 'merger', 'ipo', 'funding',
      'security', 'privacy', 'breach', 'hack', 'cyber',
      'regulation', 'lawsuit', 'court', 'fda', 'fcc', 'sec',
      'crypto', 'bitcoin', 'blockchain', 'web3', 'metaverse',
      'electric', 'autonomous', 'quantum', 'semiconductor',
      'healthcare', 'medicine', 'pharmaceutical', 'vaccine'
    ];
    return significantTerms.includes(word.toLowerCase());
  }
  
  /**
   * Generate dynamic episode description based on actual content
   */
  private generateEpisodeDescription(picks: any[], date: string): string {
    const storyCount = picks.length;
    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    // Extract key themes from story content
    const keyThemes = this.extractKeyThemes(picks);
    
    // Build story previews (first 2-3 stories)
    const storyPreviews = picks
      .slice(0, 3)
      .map(p => p.story.title)
      .join('; ');
    
    // Create rich description
    if (keyThemes.length > 0) {
      return `Your daily news brief for ${formattedDate}. Today's ${storyCount} stories focus on ${keyThemes.join(', ')}. Topics include: ${storyPreviews}`;
    } else {
      return `Your daily news brief for ${formattedDate}. ${storyCount} stories covering today's key developments.`;
    }
  }
}

