import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider, type AnthropicProviderConfig } from './anthropic-provider';

/**
 * Anthropic-Compatible Provider
 * Supports any Anthropic API-compatible service
 * Extends AnthropicProvider with custom baseURL support
 */
export interface AnthropicCompatibleConfig extends AnthropicProviderConfig {
  baseUrl: string;
}

export class AnthropicCompatibleProvider extends AnthropicProvider {
  constructor(config: AnthropicCompatibleConfig) {
    super(config);
    this.name = 'anthropic-compatible';
  }

  /**
   * Initialize Anthropic client with custom baseURL
   * Overrides parent to support custom baseURL and optional API key
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.baseUrl) {
      throw new Error('Base URL is required for Anthropic-compatible providers');
    }

    try {
      this.client = new Anthropic({
        apiKey: this.config.apiKey || 'dummy-key', // Some compatible services may not require API key
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
   * Test connection to the API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (error) {
      console.warn('Anthropic-compatible provider test connection failed', error);
      return false;
    }
  }
}
