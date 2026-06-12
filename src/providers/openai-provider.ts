import { OpenAI } from 'openai';
import { BaseProvider } from './base-provider';
import { ConstVariables } from '../utils/const-variables';
import type { ProviderSettings } from '../types/settings';

export interface OpenAIProviderConfig extends ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * OpenAI Provider
 * Supports GPT-4, GPT-3.5-turbo, etc.
 */
export class OpenAIProvider extends BaseProvider<OpenAIProviderConfig, OpenAI> {
  constructor(config: OpenAIProviderConfig) {
    super(config);
    this.name = 'openai';
    this.client = null;
  }

  /**
   * Initialize OpenAI client
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    try {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl ?? this.config.baseURL,
        dangerouslyAllowBrowser: true // Required for browser extension
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    return !!(this.config.apiKey && this.config.model);
  }

  /**
   * Translate text using OpenAI
   */
  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto'): Promise<string> {
    if (!this.validateConfig()) {
      throw new Error('Invalid OpenAI configuration');
    }

    await this.ensureInitialized();

    return await this.withErrorHandling(async () => {
      const prompt = this.createPrompt(text, targetLanguage, sourceLanguage);

      if (!this.client) {
        throw new Error('OpenAI client not initialized');
      }

      if (!this.config.model) {
        throw new Error('Model is required');
      }

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a professional translator. Provide only the translation without any explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature ?? ConstVariables.DEFAULT_OPENAI_TEMPERATURE,
        max_tokens: this.config.maxTokens ?? ConstVariables.DEFAULT_OPENAI_MAX_TOKENS
      });

      return response.choices[0]?.message?.content?.trim() ?? '';
    });
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      if (!this.client) {
        return [];
      }
      const response = await this.client.models.list();
      return response.data
        .filter((model) => model.id.includes('gpt'))
        .map((model) => model.id)
        .sort();
    } catch (error) {
      console.warn('Failed to fetch models from OpenAI API', error);
      return [];
    }
  }
}
