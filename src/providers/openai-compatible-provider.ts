import { OpenAI } from 'openai';
import { OpenAIProvider, type OpenAIProviderConfig } from './openai-provider';

/**
 * OpenAI-Compatible Provider
 * Supports any OpenAI API-compatible service (LM Studio, LocalAI, etc.)
 * Extends OpenAIProvider with custom baseURL support
 */
export interface OpenAICompatibleConfig extends OpenAIProviderConfig {
  baseUrl: string;
}

export class OpenAICompatibleProvider extends OpenAIProvider {
  constructor(config: OpenAICompatibleConfig) {
    super(config);
    this.name = 'openai-compatible';
  }

  /**
   * Initialize OpenAI client with custom baseURL
   * Overrides parent to support custom baseURL and optional API key
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.baseUrl) {
      throw new Error('Base URL is required for OpenAI-compatible providers');
    }

    try {
      this.client = new OpenAI({
        apiKey: this.config.apiKey || 'dummy-key', // Some compatible services don't require API key
        baseURL: this.config.baseUrl, // Custom baseURL is required
        dangerouslyAllowBrowser: true
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Validate configuration
   * Requires baseUrl instead of apiKey
   */
  validateConfig(): boolean {
    return !!(this.config.baseUrl && this.config.model);
  }

  /**
   * Get available models without filtering
   * Compatible services may have non-GPT models
   */
  async getModels(): Promise<string[]> {
    if (!this.client) {
      await this.initialize();
    }

    try {
      if (!this.client) {
        return [];
      }
      const response = await this.client.models.list();
      return response.data.map((model) => model.id);
    } catch (error) {
      console.warn('Failed to fetch models from OpenAI-compatible endpoint', error);
      return [];
    }
  }

  /**
   * Test connection to the API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (error) {
      console.warn('OpenAI-compatible provider test connection failed', error);
      return false;
    }
  }
}
