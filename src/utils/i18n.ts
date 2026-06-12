/**
 * Internationalization utility
 * Manages translations and locale switching
 */
import browser from 'webextension-polyfill';

type LanguageEntry = {
  code: string;
  name: string;
};

/**
 * Initialize i18n with messages from browser.i18n
 */
export function initI18n(): void {
  // Initialization is handled by browser.i18n API
  // This function is kept for compatibility
}

/**
 * Get translated message
 * @param {string} key - Message key
 * @param {string[]} substitutions - Optional substitutions
 * @returns {string} Translated message
 */
export function getMessage(key: string, substitutions: string[] = []): string {
  try {
    return browser.i18n.getMessage(key, substitutions) || key;
  } catch (error) {
    console.warn('Failed to get localized message', key, error);
    return key;
  }
}

/**
 * Translate all elements with data-i18n attribute
 */
export function translatePage(): void {
  const elements = document.querySelectorAll<HTMLElement>('[data-i18n]');

  elements.forEach((element) => {
    const key = element.getAttribute('data-i18n');
    if (!key) {
      return;
    }
    const text = getMessage(key);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      const attr = element.getAttribute('data-i18n-attr') || 'placeholder';
      element.setAttribute(attr, text);
    } else {
      element.textContent = text;
    }
  });
}

/**
 * Get supported languages
 * @returns {object[]} Array of {code, name} objects
 */
export function getSupportedLanguages(): LanguageEntry[] {
  return [
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'zh', name: '中文' },
    { code: 'ko', name: '한국어' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'pt', name: 'Português' },
    { code: 'ru', name: 'Русский' },
    { code: 'ar', name: 'العربية' },
    { code: 'hi', name: 'हिन्दी' }
  ];
}

// Initialize on load
if (typeof window !== 'undefined') {
  initI18n();
}
