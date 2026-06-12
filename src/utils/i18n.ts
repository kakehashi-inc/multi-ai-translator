/**
 * Internationalization utility
 * Manages translations and locale switching
 */
import browser from 'webextension-polyfill';

// Re-exported so existing imports (`getSupportedLanguages` from i18n) keep
// working; the language table itself lives in `languages.ts`.
export { getSupportedLanguages } from './languages';

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


// Initialize on load
if (typeof window !== 'undefined') {
  initI18n();
}
