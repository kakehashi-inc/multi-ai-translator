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
   * Translate texts using Ollama
   */
  async translate(
    texts: string[],
    targetLanguage: string,
    sourceLanguage = 'auto',
    signal?: AbortSignal
  ): Promise<string[]> {
    if (!this.validateConfig()) {
      throw new Error('Invalid Ollama configuration');
    }

    await this.ensureInitialized();

    return await this.withErrorHandling(async () => {
      if (!this.client) {
        throw new Error('Ollama client not initialized');
      }

      if (!this.config.model) {
        throw new Error('Model is required');
      }

      const model = this.config.model;
      const client = this.client;

      // The ollama SDK does not accept a per-request AbortSignal, but it exposes
      // `client.abort()` which aborts every request in flight on this client.
      // Each batch builds a fresh provider (and thus a fresh client), so a single
      // in-flight request per client makes this effectively per-batch. Wire the
      // signal to it so a cancel tears down the open socket immediately instead
      // of waiting for the local model to finish generating.
      const onAbort = () => {
        try {
          client.abort();
        } catch (error) {
          console.warn('[ollama] Failed to abort in-flight request', error);
        }
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      try {
        return await this.runTranslation(
          texts,
          targetLanguage,
          sourceLanguage,
          async (prompt) => {
            // Use the chat endpoint (not generate) so Ollama applies the model's
            // chat template. Chat models such as Hy-MT2 rely on their template to
            // wrap the message in role markers; with the raw `generate` endpoint the
            // template boundaries break down and the model leaks its special tokens
            // (e.g. "hy_User", "hy-Assistant", "hy_End__of__sentence") into the
            // output or degenerates into repetition.
            const response = await client.chat({
              model,
              messages: [{ role: 'user', content: prompt }],
              stream: false,
              options: {
                temperature: this.config.temperature ?? ConstVariables.DEFAULT_OLLAMA_TEMPERATURE
              }
            });

            return response.message.content.trim();
          },
          signal
        );
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
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
