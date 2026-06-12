/**
 * Storage utility
 * Manages extension settings with Browser Storage API
 */
import browser from 'webextension-polyfill';
import { ConstVariables } from './const-variables';
import { getMessage } from './i18n';
import type {
  ProviderName,
  ProviderSettings,
  ProviderSettingsMap,
  Settings,
  TranslationHistoryItem
} from '../types/settings';

const {
  PROVIDER_ORDER,
  DEFAULT_BATCH_MAX_CHARS,
  DEFAULT_BATCH_MAX_ITEMS,
  DEFAULT_LANGUAGE,
  DEFAULT_FONT_SIZE,
  DEFAULT_OPENAI_TEMPERATURE,
  DEFAULT_OPENAI_MAX_TOKENS,
  DEFAULT_ANTHROPIC_TEMPERATURE,
  DEFAULT_ANTHROPIC_MAX_TOKENS,
  DEFAULT_GEMINI_TEMPERATURE,
  DEFAULT_GEMINI_MAX_OUTPUT_TOKENS,
  DEFAULT_OLLAMA_TEMPERATURE,
  DEFAULT_OLLAMA_HOST
} = ConstVariables;

type SettingsStorageShape = {
  settings?: Settings;
};

type HistoryStorageShape = {
  translationHistory?: TranslationHistoryItem[];
};

function normalizeLanguageCode(language?: string | null): string {
  if (!language || typeof language !== 'string') {
    return DEFAULT_LANGUAGE;
  }

  const [code] = language.split(/[-_]/);
  return code?.toLowerCase() || DEFAULT_LANGUAGE;
}

export function getBrowserLanguage(): string {
  try {
    if (browser?.i18n?.getUILanguage) {
      return normalizeLanguageCode(browser.i18n.getUILanguage());
    }
  } catch (error) {
    console.warn('Failed to read browser UI language', error);
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    return normalizeLanguageCode(navigator.language);
  }

  return DEFAULT_LANGUAGE;
}

function createProviderDefaults(): Record<ProviderName, ProviderSettings> {
  return {
    gemini: {
      enabled: false,
      apiKey: '',
      model: '',
      temperature: DEFAULT_GEMINI_TEMPERATURE,
      maxOutputTokens: DEFAULT_GEMINI_MAX_OUTPUT_TOKENS
    },
    anthropic: {
      enabled: false,
      apiKey: '',
      model: '',
      maxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
      temperature: DEFAULT_ANTHROPIC_TEMPERATURE
    },
    'anthropic-compatible': {
      enabled: false,
      baseUrl: '',
      apiKey: '',
      model: '',
      maxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
      temperature: DEFAULT_ANTHROPIC_TEMPERATURE
    },
    openai: {
      enabled: false,
      apiKey: '',
      model: '',
      temperature: DEFAULT_OPENAI_TEMPERATURE,
      maxTokens: DEFAULT_OPENAI_MAX_TOKENS
    },
    'openai-compatible': {
      enabled: false,
      baseUrl: '',
      apiKey: '',
      model: '',
      temperature: DEFAULT_OPENAI_TEMPERATURE
    },
    ollama: {
      enabled: false,
      host: DEFAULT_OLLAMA_HOST,
      model: '',
      temperature: DEFAULT_OLLAMA_TEMPERATURE
    }
  };
}

function deepCloneSettings(settings: Settings): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings;
}

function createDefaultSettings(): Settings {
  const browserLanguage = getBrowserLanguage();
  const providerDefaults = createProviderDefaults();
  const providers: ProviderSettingsMap = {};

  PROVIDER_ORDER.forEach((name) => {
    providers[name] = { ...providerDefaults[name] };
  });

  return {
    common: {
      defaultSourceLanguage: 'auto',
      defaultTargetLanguage: browserLanguage,
      uiLanguage: browserLanguage,
      batchMaxChars: DEFAULT_BATCH_MAX_CHARS,
      batchMaxItems: DEFAULT_BATCH_MAX_ITEMS
    },
    providers,
    ui: {
      theme: 'auto',
      fontSize: DEFAULT_FONT_SIZE
    }
  };
}

export function getDefaultSettings(): Settings {
  return deepCloneSettings(createDefaultSettings());
}

function normalizeSettings(storedSettings?: Settings): Settings {
  const normalized = getDefaultSettings();

  if (!storedSettings) {
    return normalized;
  }

  if (storedSettings.common) {
    normalized.common = {
      ...normalized.common,
      ...storedSettings.common
    };
  }

  const providerNames = new Set([
    ...Object.keys(normalized.providers),
    ...(storedSettings.providers ? Object.keys(storedSettings.providers) : [])
  ]);

  providerNames.forEach((name) => {
    normalized.providers[name] = {
      ...(normalized.providers[name] || { enabled: false }),
      ...(storedSettings.providers?.[name] || {})
    };
  });

  normalized.ui = {
    ...normalized.ui,
    ...(storedSettings.ui || {})
  };

  if (!normalized.common.defaultSourceLanguage) {
    normalized.common.defaultSourceLanguage = 'auto';
  }

  if (!normalized.common.defaultTargetLanguage) {
    normalized.common.defaultTargetLanguage = getBrowserLanguage();
  }

  return normalized;
}

export async function getSettings(): Promise<Settings> {
  try {
    const result = await browser.storage.local.get('settings');
    const stored = (result as SettingsStorageShape).settings;
    return normalizeSettings(stored);
  } catch (error) {
    console.error('Failed to load settings, falling back to defaults', error);
    return getDefaultSettings();
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    await browser.storage.local.set({ settings });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export async function getEnabledProviders(): Promise<string[]> {
  const settings = await getSettings();
  const ordered: string[] = [];

  PROVIDER_ORDER.forEach((name) => {
    if (settings.providers[name]?.enabled) {
      ordered.push(name);
    }
  });

  Object.keys(settings.providers).forEach((name) => {
    if (!PROVIDER_ORDER.includes(name as ProviderName) && settings.providers[name]?.enabled) {
      ordered.push(name);
    }
  });

  return ordered;
}

export async function resetSettings(): Promise<void> {
  await saveSettings(getDefaultSettings());
}

export async function exportSettings(): Promise<string> {
  const settings = await getSettings();
  return JSON.stringify(settings, null, 2);
}

export async function importSettings(jsonString: string): Promise<void> {
  try {
    const parsed = JSON.parse(jsonString) as Settings;
    await saveSettings(normalizeSettings(parsed));
  } catch (error) {
    console.error('Invalid settings JSON provided', error);
    throw new Error(getMessage('errorInvalidSettingsJson'), { cause: error });
  }
}

async function getTranslationHistory(limit = 50): Promise<TranslationHistoryItem[]> {
  try {
    const result = await browser.storage.local.get('translationHistory');
    const history = (result as HistoryStorageShape).translationHistory || [];
    return history.slice(0, limit);
  } catch (error) {
    console.warn('Failed to read translation history', error);
    return [];
  }
}

export async function addToHistory(item: Omit<TranslationHistoryItem, 'timestamp'>): Promise<void> {
  try {
    const history = await getTranslationHistory(100);
    history.unshift({
      ...item,
      timestamp: Date.now()
    });

    const trimmedHistory = history.slice(0, 100);
    await browser.storage.local.set({ translationHistory: trimmedHistory });
  } catch (error) {
    console.error('Failed to add to history:', error);
  }
}
