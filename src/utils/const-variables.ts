import type { ProviderName } from '../types/settings';

export class ConstVariables {
  // Language & UI defaults
  static DEFAULT_LANGUAGE: string = 'en';
  static DEFAULT_FONT_SIZE = 14;

  // Provider-specific defaults (shared values but named for clarity)
  static DEFAULT_OPENAI_TEMPERATURE = 0.3;
  static DEFAULT_OPENAI_MAX_TOKENS = 2000;
  static DEFAULT_ANTHROPIC_TEMPERATURE = 0.3;
  static DEFAULT_ANTHROPIC_MAX_TOKENS = 2000;
  static DEFAULT_GEMINI_TEMPERATURE = 0.3;
  static DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 2000;
  static DEFAULT_OLLAMA_TEMPERATURE = 0.3;
  static DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';

  // Batch translation
  static DEFAULT_BATCH_MAX_ITEMS = 20;
  static DEFAULT_BATCH_MAX_CHARS = 2000;
  static DEFAULT_CHUNK_MAX_LENGTH = 1000;

  // Timing constants
  static STATUS_CLEAR_DELAY_MS = 4000;
  static BATCH_THROTTLE_DELAY_MS = 100;
  static HIGHLIGHT_DURATION_MS = 2000;

  // Provider order and labels
  static PROVIDER_ORDER = Object.freeze<ProviderName[]>([
    'gemini',
    'anthropic',
    'anthropic-compatible',
    'openai',
    'openai-compatible',
    'ollama'
  ]);

  static PROVIDER_LABELS = Object.freeze<Record<ProviderName, string>>({
    gemini: 'Gemini',
    anthropic: 'Anthropic (Claude)',
    'anthropic-compatible': 'Anthropic Compatible',
    openai: 'OpenAI',
    'openai-compatible': 'OpenAI Compatible',
    ollama: 'Ollama'
  });

  /**
   * Format provider name for display
   * @param {string} name - Provider name
   * @returns {string} Formatted provider name
   */
  static formatProviderName(name: string): string {
    return this.PROVIDER_LABELS[name as ProviderName] || name;
  }
}
