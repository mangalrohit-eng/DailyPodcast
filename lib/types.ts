/**
 * Core type definitions for the podcast generation system
 */

export interface Story {
  id: string;
  url: string;
  title: string;
  source: string;
  published_at: Date;
  summary?: string;
  raw?: string;
  canonical?: string;
  domain: string;
  topic?: string;
}

export interface Pick {
  story_id: string;
  story: Story;
  topic: string;
  score: number;
  cluster_id?: number;
  rationale: string;
}

export interface OutlineSection {
  type: 'cold-open' | 'headlines' | 'deep-dive' | 'quick-hits' | 'what-to-watch' | 'sign-off';
  title: string;
  target_words: number;
  refs: string[]; // story IDs
}

export interface Outline {
  sections: OutlineSection[];
  runtime_target_sec: number;
}

export interface ScriptSection {
  type: string;
  text: string;
  refs: number[]; // citation IDs
}

export interface Source {
  id: number;
  title: string;
  url: string;
}

export interface Script {
  sections: ScriptSection[];
  sources: Source[];
  word_count: number;
  token_count?: number;
}

export interface SynthesisPlan {
  segment_id: string;
  role: 'host' | 'analyst' | 'stinger';
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  text_with_cues: string;
  expected_sec: number;
  speed?: number; // Dynamic speed for emotional delivery (0.25 - 4.0, default: 0.95)
}

export interface Chapter {
  start_sec: number;
  title: string;
}

export interface EpisodeManifest {
  date: string;
  run_id: string;
  picks: Pick[];
  outline_hash: string;
  script_hash: string;
  audio_hash: string;
  mp3_url: string;
  duration_sec: number;
  word_count: number;
  chapters?: Chapter[];
  created_at: string;
  metrics?: {
    ingestion_time_ms: number;
    ranking_time_ms: number;
    scripting_time_ms: number;
    tts_time_ms: number;
    total_time_ms: number;
    openai_tokens: number;
  };
  pipeline_report?: PipelineReport;
}

export interface PipelineReport {
  ingestion: {
    sources_scanned: Array<{ name: string; url: string; items_found: number }>;
    total_stories_found: number;
    stories_after_filtering: number;
    filtered_out: Array<{ title: string; reason: string }>;
    topics_breakdown: Record<string, number>;
    all_stories_detailed?: Array<{ 
      title: string; 
      topic: string; 
      url: string;
      published_at: string;
      status: 'accepted' | 'rejected'; 
      reason?: string;
    }>;
  };
  ranking: {
    stories_ranked: number;
    top_picks: Array<{ title: string; topic: string; score: number; why_selected: string }>;
    rejected_stories: Array<{ title: string; score: number; reason: string }>;
  };
  scraper: {
    total_articles: number;
    successful_scrapes: number;
    failed_scrapes: Array<{ url: string; reason: string }>;
    avg_content_length: number;
  };
  outline: {
    sections: Array<{ type: string; title: string; target_words: number; story_count: number }>;
    total_duration_target: number;
  };
  scriptwriting: {
    sections_generated: number;
    total_word_count: number;
    full_script_text: string;
    citations_used: number[];
  };
  factcheck: {
    changes_made: string[];
    flags_raised: string[];
  };
  safety: {
    edits_made: string[];
    risk_level: string;
  };
}

export interface AgentMessage<I = any, O = any> {
  agent: string;
  run_id: string;
  timestamp: string;
  input: I;
  output?: O;
  errors: string[];
  artifacts: Array<{
    name: string;
    storage_path: string;
  }>;
  duration_ms?: number;
}

export interface RunConfig {
  date: string;
  topics: string[];
  window_hours: number;
  weights: Record<string, number>;
  force_overwrite: boolean;
  rumor_filter: boolean;
  target_duration_sec: number;
}

export interface TopicConfig {
  name: string;
  weight: number;
  sources: string[];
  keywords: string[];
}

export interface PodcastConfig {
  title: string;
  description: string;
  author: string;
  email: string;
  language: string;
  category: string;
  image_url?: string;
  base_url: string;
}

