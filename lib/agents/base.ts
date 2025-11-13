/**
 * Base Agent class - Foundation for all agents in the system
 */

import OpenAI from 'openai';
import { Config } from '../config';
import { Logger, retry, Crypto } from '../utils';
import { AgentMessage } from '../types';
import { StorageTool } from '../tools/storage';

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retries?: number;
}

export abstract class BaseAgent<TInput = any, TOutput = any> {
  protected config: AgentConfig;
  protected client: OpenAI;
  protected storage: StorageTool;
  
  constructor(config: AgentConfig) {
    this.config = {
      temperature: 0.7,
      maxTokens: 4000,
      timeout: 60000,
      retries: 3,
      ...config,
    };
    
    this.client = new OpenAI({
      apiKey: Config.OPENAI_API_KEY,
    });
    
    this.storage = new StorageTool();
  }
  
  /**
   * Main execution method - implements retry logic and error handling
   */
  async execute(runId: string, input: TInput): Promise<AgentMessage<TInput, TOutput>> {
    const startTime = Date.now();
    
    const message: AgentMessage<TInput, TOutput> = {
      agent: this.config.name,
      run_id: runId,
      timestamp: new Date().toISOString(),
      input,
      errors: [],
      artifacts: [],
    };
    
    try {
      Logger.info(`${this.config.name} starting`, { runId });
      
      const output = await retry(
        () => this.process(input),
        {
          maxRetries: this.config.retries!,
          delayMs: 1000,
          backoff: true,
          onError: (error, attempt) => {
            Logger.warn(`${this.config.name} retry ${attempt}`, {
              error: error.message,
            });
          },
        }
      );
      
      message.output = output;
      message.duration_ms = Date.now() - startTime;
      
      Logger.info(`${this.config.name} completed`, {
        runId,
        duration_ms: message.duration_ms,
      });
      
      // Store agent message for observability
      await this.storeMessage(message);
      
      return message;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      message.errors.push(errorMessage);
      message.duration_ms = Date.now() - startTime;
      
      Logger.error(`${this.config.name} failed`, {
        runId,
        error: errorMessage,
        duration_ms: message.duration_ms,
      });
      
      await this.storeMessage(message);
      throw error;
    }
  }
  
  /**
   * Abstract method - must be implemented by each agent
   */
  protected abstract process(input: TInput): Promise<TOutput>;
  
  /**
   * Helper: Call OpenAI chat completion with automatic rate limiting and retry logic
   */
  protected async callOpenAI(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'text' | 'json_object';
    } = {}
  ): Promise<string> {
    const {
      temperature = this.config.temperature,
      maxTokens = this.config.maxTokens,
      responseFormat = 'text',
    } = options;
    
    // Import retry helper
    const { createChatCompletion } = await import('../utils/openai-helper');
    
    // Use retry logic with exponential backoff for rate limiting
    const response = await createChatCompletion(
      this.client,
      {
        model: 'gpt-4-turbo-preview',
        messages,
        temperature,
        max_tokens: maxTokens,
        response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      },
      {
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      }
    );
    
    return response.choices[0]?.message?.content || '';
  }
  
  /**
   * Helper: Store agent message to storage for observability
   */
  private async storeMessage(message: AgentMessage<TInput, TOutput>): Promise<void> {
    try {
      const path = `runs/${message.run_id}/agents/${message.agent}.json`;
      const content = JSON.stringify(message, null, 2);
      await this.storage.put(path, content, 'application/json');
    } catch (error) {
      Logger.warn('Failed to store agent message', {
        agent: this.config.name,
        error: (error as Error).message,
      });
    }
  }
  
  /**
   * Helper: Store artifact
   */
  protected async storeArtifact(
    runId: string,
    name: string,
    data: Buffer | string,
    contentType: string
  ): Promise<string> {
    const path = `runs/${runId}/artifacts/${this.config.name}/${name}`;
    return await this.storage.put(path, data, contentType);
  }
}

