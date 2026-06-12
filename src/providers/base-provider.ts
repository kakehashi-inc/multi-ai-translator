import { ConstVariables } from '../utils/const-variables';
import { resolveProfile, resolveDispatch } from '../prompts';
import type { PromptContext, SendPrompt } from '../prompts';
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
   * Translate a list of texts using the AI provider.
   * Must be implemented by subclass. Returns one translation per input text,
   * in the same order.
   * @abstract
   * @param {string[]} texts - Texts to translate
   * @param {string} targetLanguage - Target language
   * @param {string} sourceLanguage - Source language (optional)
   * @returns {Promise<string[]>} Translated texts, aligned 1:1 with input
   */
  abstract translate(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
    signal?: AbortSignal
  ): Promise<string[]>;

  /**
   * Get available models for this provider
   * Must be implemented by subclass
   * @abstract
   * @returns {Promise<string[]>} List of model names
   */
  abstract getModels(): Promise<string[]>;

  /**
   * Translate a list of texts.
   *
   * Two independent concerns are resolved from the configured model name:
   *   - Prompt: the prompt profile (default XML, Hy-MT2, ...) owns the prompt
   *     text and how to parse the model's reply.
   *   - Dispatch: whether to send the whole batch in one request ('block') or
   *     one request per text ('single'). See `src/prompts/dispatch.ts`.
   *
   * Providers only supply `send`, which performs one API call with a prompt
   * string and returns the raw output. All prompt/parse logic stays in the
   * profile; all batching logic stays here.
   *
   * @param texts          Source texts to translate, in order.
   * @param targetLanguage Target language code/label.
   * @param sourceLanguage Source language code/label ('auto' for detection).
   * @param send           Provider-specific single-prompt sender.
   * @param signal         Optional AbortSignal. Checked before every request and
   *                       forwarded to `send` so an in-flight call can be aborted.
   * @returns Translations aligned 1:1 with `texts`.
   */
  protected async runTranslation(
    texts: string[],
    targetLanguage: string,
    sourceLanguage: string,
    send: SendPrompt,
    signal?: AbortSignal
  ): Promise<string[]> {
    if (texts.length === 0) {
      return [];
    }

    // Abort fast if cancellation already happened before we sent anything.
    signal?.throwIfAborted();

    const model = 'model' in this.config ? (this.config as { model?: string }).model : undefined;
    const profile = resolveProfile(model);
    const context: PromptContext = { sourceLanguage, targetLanguage, model };

    let dispatch = resolveDispatch(profile, model);
    // A profile may only implement single dispatch; fall back to single if
    // block was selected but the profile has no block methods.
    if (dispatch === 'block' && !profile.buildBlockPrompt) {
      dispatch = 'single';
    }

    if (dispatch === 'block' && profile.buildBlockPrompt && profile.parseBlockResponse) {
      const prompt = profile.buildBlockPrompt(texts, context);
      const output = await send(prompt, signal);
      return profile.parseBlockResponse(output, texts);
    }

    // Single dispatch: one request per text. Empty / whitespace-only items are
    // passed through unchanged and never sent to the model.
    //
    // For each text the profile may offer several prompt variants
    // (singleAttemptCount). The profile interprets each output into a status:
    //   ok    → use the translation (done)
    //   skip  → keep the original text (done — do NOT fall back)
    //   error → broken; try the next variant if there is one
    // If every variant errors, we keep the original — a broken/runaway output is
    // never surfaced; an untranslated original is far better.
    const attemptCount = Math.max(1, profile.singleAttemptCount ?? 1);
    const result = texts.slice(); // defaults to the originals
    for (let i = 0; i < texts.length; i++) {
      // Abort between texts so a cancel stops the remaining items immediately
      // rather than after the whole batch finishes.
      signal?.throwIfAborted();
      const text = texts[i];
      if (!text || text.trim() === '') {
        continue;
      }
      for (let attempt = 0; attempt < attemptCount; attempt++) {
        const prompt = profile.buildSinglePrompt(text, context, attempt);
        const output = await send(prompt, signal);
        const parsed = profile.parseSingleResponse(output, text, attempt);

        if (parsed.status === 'ok') {
          result[i] = parsed.text;
          break;
        }
        if (parsed.status === 'skip') {
          // Untranslatable; keep the original (already in result[i]).
          break;
        }
        // status === 'error': log for diagnostics and try the next variant.
        if (process.env.NODE_ENV !== 'production') {
          console.debug(
            `[${this.name}] single attempt ${attempt} error: ${parsed.text} — input: ${JSON.stringify(
              text.slice(0, 80)
            )}`
          );
        }
        // If this was the last attempt, result[i] stays as the original.
      }
    }
    return result;
  }

  /**
   * Handle API errors
   * @param {Error} error - The error object
   * @throws {Error} Formatted error with helpful message
   */
  protected handleError(error: unknown): never {
    // A cancellation is not a translation failure — let it propagate unchanged
    // so the caller (background worker / translator) can treat it as a cancel.
    if (BaseProvider.isAbortError(error)) {
      throw error;
    }

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
   * Detect a cancellation error raised by an aborted AbortSignal. Covers the
   * DOMException thrown by `throwIfAborted()` / `fetch`, SDK-specific
   * `APIUserAbortError`-style classes (matched by name), and plain Errors whose
   * name/message indicate an abort.
   */
  static isAbortError(error: unknown): boolean {
    if (!error) {
      return false;
    }
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return error.name === 'AbortError';
    }
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && /abort/i.test(name)) {
      return true;
    }
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && /\baborted\b/i.test(message);
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
