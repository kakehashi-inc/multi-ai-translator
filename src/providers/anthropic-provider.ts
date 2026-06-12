import Anthropic from '@anthropic-ai/sdk';
import { BaseProvider } from './base-provider';
import { ConstVariables } from '../utils/const-variables';
import type { ProviderSettings } from '../types/settings';

export interface AnthropicProviderConfig extends ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Anthropic Provider
 * Supports Claude 3 and 4 models via Anthropic API
 */
export class AnthropicProvider extends BaseProvider<AnthropicProviderConfig, Anthropic> {
  constructor(config: AnthropicProviderConfig) {
    super(config);
    this.name = 'anthropic';
    this.client = null;
  }

  /**
   * Initialize Anthropic client
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    try {
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl ?? this.config.baseURL,
        dangerouslyAllowBrowser: true
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
   * Translate text using Anthropic API
   */
  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto'): Promise<string> {
    if (!this.validateConfig()) {
      throw new Error('Invalid Anthropic configuration');
    }

    await this.ensureInitialized();

    return await this.withErrorHandling(async () => {
      const prompt = this.createPrompt(text, targetLanguage, sourceLanguage);

      if (!this.client) {
        throw new Error('Anthropic client not initialized');
      }

      if (!this.config.model) {
        throw new Error('Model is required');
      }

      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens ?? ConstVariables.DEFAULT_ANTHROPIC_MAX_TOKENS,
        temperature: this.config.temperature ?? ConstVariables.DEFAULT_ANTHROPIC_TEMPERATURE,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      const content = response.content[0];
      return 'text' in content ? content.text.trim() : '';
    });
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    try {
      await this.ensureInitialized();
      if (!this.client) {
        return [];
      }

      const response = await this.client.models.list();
      return response.data.map((model) => model.id);
    } catch (error) {
      console.warn('Failed to fetch models from Anthropic API', error);
      return [];
    }
  }
}
