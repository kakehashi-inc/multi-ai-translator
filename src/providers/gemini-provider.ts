import { GoogleGenAI } from '@google/genai';
import { BaseProvider } from './base-provider';
import { ConstVariables } from '../utils/const-variables';
import type { ProviderSettings } from '../types/settings';

interface GeminiProviderConfig extends ProviderSettings {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Gemini Provider (Google)
 * Supports Gemini Pro and other models
 */
export class GeminiProvider extends BaseProvider<GeminiProviderConfig, GoogleGenAI> {
  private modelName?: string;
  private generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };

  constructor(config: GeminiProviderConfig) {
    super(config);
    this.name = 'gemini';
    this.client = null;
    this.modelName = undefined;
    this.generationConfig = undefined;
  }

  async initialize(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.config.apiKey) {
      throw new Error('Gemini API key is required');
    }

    try {
      this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
      this.modelName = this.config.model;
      this.generationConfig = {
        temperature: this.config.temperature ?? ConstVariables.DEFAULT_GEMINI_TEMPERATURE,
        maxOutputTokens:
          this.config.maxOutputTokens ?? ConstVariables.DEFAULT_GEMINI_MAX_OUTPUT_TOKENS
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  validateConfig(): boolean {
    return !!(this.config.apiKey && this.config.model);
  }

  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto'): Promise<string> {
    if (!this.validateConfig()) {
      throw new Error('Invalid Gemini configuration');
    }

    await this.ensureInitialized();

    return await this.withErrorHandling(async () => {
      if (!this.client || !this.modelName) {
        throw new Error('Gemini client not initialized');
      }

      const prompt = this.createPrompt(text, targetLanguage, sourceLanguage);

      const requestParams: {
        model: string;
        contents: string;
        temperature?: number;
        maxOutputTokens?: number;
      } = {
        model: this.modelName,
        contents: prompt
      };

      if (this.generationConfig?.temperature !== undefined) {
        requestParams.temperature = this.generationConfig.temperature;
      }
      if (this.generationConfig?.maxOutputTokens !== undefined) {
        requestParams.maxOutputTokens = this.generationConfig.maxOutputTokens;
      }

      const response = await this.client.models.generateContent(requestParams);

      return response.text?.trim() ?? '';
    });
  }

  async getModels(): Promise<string[]> {
    try {
      await this.ensureInitialized();
      if (!this.client) {
        return [];
      }

      const pager = await this.client.models.list({
        config: {
          pageSize: 100
        }
      });

      const models: string[] = [];
      for await (const model of pager) {
        const name = model?.name?.replace('models/', '');
        if (name && name.includes('gemini')) {
          models.push(name);
        }
      }

      return models;
    } catch (error) {
      console.warn('Failed to fetch models from Google Gen AI API', error);
      return [];
    }
  }
}
