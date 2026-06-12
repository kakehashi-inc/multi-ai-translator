import { Ollama } from 'ollama/browser';
import { BaseProvider } from './base-provider';
import { ConstVariables } from '../utils/const-variables';
import type { ProviderSettings } from '../types/settings';

interface OllamaProviderConfig extends ProviderSettings {
  host?: string;
  model?: string;
  temperature?: number;
}

/**
 * Ollama Provider
 * Supports local Ollama models
 */
export class OllamaProvider extends BaseProvider<OllamaProviderConfig, Ollama> {
  constructor(config: OllamaProviderConfig) {
    super(config);
    this.name = 'ollama';
    this.client = null;
  }

  /**
   * Initialize Ollama client
   */
  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    try {
      this.client = new Ollama({
        host: this.config.host || ConstVariables.DEFAULT_OLLAMA_HOST
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): boolean {
    return !!this.config.model;
  }

  /**
   * Translate text using Ollama
   */
  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto'): Promise<string> {
    if (!this.validateConfig()) {
      throw new Error('Invalid Ollama configuration');
    }

    await this.ensureInitialized();

    return await this.withErrorHandling(async () => {
      const prompt = this.createPrompt(text, targetLanguage, sourceLanguage);

      if (!this.client) {
        throw new Error('Ollama client not initialized');
      }

      if (!this.config.model) {
        throw new Error('Model is required');
      }

      const response = await this.client.generate({
        model: this.config.model,
        prompt,
        stream: false,
        options: {
          temperature: this.config.temperature ?? ConstVariables.DEFAULT_OLLAMA_TEMPERATURE
        }
      });

      return response.response.trim();
    });
  }

  /**
   * Get available models from local Ollama instance
   */
  async getModels(): Promise<string[]> {
    try {
      await this.ensureInitialized();
      if (!this.client) {
        return [];
      }

      const response = await this.client.list();
      return response.models.map((model) => model.name);
    } catch (error) {
      console.warn('Failed to fetch Ollama models. Is Ollama running?', error);
      return [];
    }
  }

  /**
   * Check if Ollama is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getModels();
      return true;
    } catch (error) {
      console.warn('Ollama provider availability check failed', error);
      return false;
    }
  }
}
