export type ProviderName =
  | 'gemini'
  | 'anthropic'
  | 'anthropic-compatible'
  | 'openai'
  | 'openai-compatible'
  | 'ollama';

export interface ProviderSettings {
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  host?: string;
}

export type ProviderSettingsMap = Record<string, ProviderSettings>;

export interface CommonSettings {
  defaultSourceLanguage: string;
  defaultTargetLanguage: string;
  uiLanguage: string;
  batchMaxChars: number;
  batchMaxItems: number;
}

export interface UISettings {
  theme: 'auto' | 'light' | 'dark';
  fontSize: number;
}

export interface Settings {
  common: CommonSettings;
  providers: ProviderSettingsMap;
  ui: UISettings;
}

export interface TranslationHistoryItem {
  original: string;
  translated: string;
  provider: string;
  targetLanguage?: string | null;
  sourceLanguage?: string | null;
  timestamp: number;
}
