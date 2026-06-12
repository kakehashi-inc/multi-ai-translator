import { ConstVariables } from '../utils/const-variables';
import { PromptBuilder } from '../utils/prompt-builder';
import type { ProviderName, ProviderSettings } from '../types/settings';

/**
 * Base Provider Class
 * All AI providers must extend this class
 */
export abstract class BaseProvider<
  Config extends ProviderSettings = ProviderSettings,
  Client = unknown
> {
  protected readonly config: Config;
  protected name: ProviderName | string;
  protected client: Client | null;

  constructor(config: Config) {
    this.config = config;
    this.name = 'base';
    this.client = null;
  }

  /**
   * Ensure client is initialized before use
   * Common pattern used by all providers
   * @protected
   */
  protected async ensureInitialized(): Promise<void> {
    if (!this.client) {
      await this.initialize();
    }
  }

  /**
   * Execute operation with error handling
   * Common pattern used by all providers
   * @protected
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<any>} Result of operation
   */
  protected async withErrorHandling<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Initialize the provider client
   * Must be implemented by subclass
   * @abstract
   */
  protected abstract initialize(): Promise<void>;

  /**
   * Validate provider configuration
   * Must be implemented by subclass
   * @abstract
   * @returns {boolean} Whether the configuration is valid
   */
  abstract validateConfig(): boolean;

  /**
   * Translate text using the AI provider
   * Must be implemented by subclass
   * @abstract
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language
   * @param {string} sourceLanguage - Source language (optional)
   * @returns {Promise<string>} Translated text
   */
  abstract translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<string>;

  /**
   * Get available models for this provider
   * Must be implemented by subclass
   * @abstract
   * @returns {Promise<string[]>} List of model names
   */
  abstract getModels(): Promise<string[]>;

  /**
   * Create translation prompt
   * Delegates to utility function for reusability
   * @param {string} text - Text to translate
   * @param {string} targetLanguage - Target language
   * @param {string} sourceLanguage - Source language
   * @returns {string} Formatted prompt
   */
  protected createPrompt(text: string, targetLanguage: string, sourceLanguage: string): string {
    return PromptBuilder.buildPrompt(text, targetLanguage, sourceLanguage);
  }

  /**
   * Handle API errors
   * @param {Error} error - The error object
   * @throws {Error} Formatted error with helpful message
   */
  protected handleError(error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);

    // In development we keep detailed provider-level diagnostics, but avoid
    // emitting multiple error-level logs for the same failure from different layers.
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[${this.name}] Error:`, error);
    }

    if (message.includes('API key')) {
      throw new Error(`Invalid API key for ${this.name}`);
    }
    if (message.includes('rate limit')) {
      throw new Error(`Rate limit exceeded for ${this.name}`);
    }
    if (message.includes('network') || message.includes('fetch')) {
      throw new Error(`Network error when connecting to ${this.name}`);
    }

    throw new Error(`Translation failed: ${message}`);
  }

  /**
   * Split long text into chunks
   * Delegates to utility function for reusability
   * @param {string} text - Text to split
   * @param {number} maxLength - Maximum length per chunk
   * @returns {string[]} Array of text chunks
   */
  protected splitIntoChunks(
    text: string,
    maxLength = ConstVariables.DEFAULT_CHUNK_MAX_LENGTH
  ): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          chunks.push(sentence.substring(0, maxLength));
          currentChunk = sentence.substring(maxLength);
        }
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
