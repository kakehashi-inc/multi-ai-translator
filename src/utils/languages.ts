/**
 * Single source of truth for the languages the extension supports.
 *
 * Each language carries four forms:
 *   - `id`      — stable identifier stored in settings and used everywhere to
 *                 reference a language. Lets us distinguish regional variants
 *                 that share a base language (e.g. "en", "en_US", "en_GB").
 *   - `english` — full English name, used in model prompts (e.g. "Japanese",
 *                 "English (US)"). Translation models behave best with this form.
 *   - `code`    — BCP-47 code (ISO 639-1 language + optional ISO 3166-1 region,
 *                 e.g. "ja", "en-US"). Kept for future use (HTTP headers, locale
 *                 APIs); not the identifier.
 *   - `display` — label shown in the UI language pickers (e.g. "日本語").
 *
 * Everything else (UI pickers, settings, providers) references a language by
 * `id`. UI code uses {@link getSupportedLanguages}; prompt builders use
 * {@link toEnglishName}; resolving a browser/locale string to an id uses
 * {@link resolveLanguageId}.
 */

export interface LanguageDef {
  id: string;
  english: string;
  code: string;
  display: string;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { id: 'en', english: 'English', code: 'en', display: 'English' },
  { id: 'en_US', english: 'English (US)', code: 'en-US', display: 'English (US)' },
  { id: 'en_GB', english: 'English (UK)', code: 'en-GB', display: 'English (UK)' },
  { id: 'ja', english: 'Japanese', code: 'ja', display: '日本語' },
  { id: 'zh', english: 'Chinese', code: 'zh', display: '中文' },
  { id: 'zh_CN', english: 'Simplified Chinese', code: 'zh-CN', display: '简体中文' },
  { id: 'zh_TW', english: 'Traditional Chinese', code: 'zh-TW', display: '繁體中文' },
  { id: 'ko', english: 'Korean', code: 'ko', display: '한국어' },
  { id: 'es', english: 'Spanish', code: 'es', display: 'Español' },
  { id: 'fr', english: 'French', code: 'fr', display: 'Français' },
  { id: 'de', english: 'German', code: 'de', display: 'Deutsch' },
  { id: 'it', english: 'Italian', code: 'it', display: 'Italiano' },
  { id: 'pt', english: 'Portuguese', code: 'pt', display: 'Português' },
  { id: 'pt_BR', english: 'Brazilian Portuguese', code: 'pt-BR', display: 'Português (Brasil)' },
  { id: 'pt_PT', english: 'European Portuguese', code: 'pt-PT', display: 'Português (Portugal)' },
  { id: 'ru', english: 'Russian', code: 'ru', display: 'Русский' },
  { id: 'ar', english: 'Arabic', code: 'ar', display: 'العربية' },
  { id: 'hi', english: 'Hindi', code: 'hi', display: 'हिन्दी' }
];

/** Default language id, used when nothing else can be resolved. */
export const DEFAULT_LANGUAGE_ID = 'en';

const BY_ID = new Map<string, LanguageDef>();
// Lookup from any form (id / english / code / display), case-insensitively.
const BY_ANY = new Map<string, LanguageDef>();
// Lookup from a base code (the part before "-"/"_") to the base-language def,
// so "ja-JP" resolves to "ja" and "en-XX" falls back to "en".
const BY_BASE_CODE = new Map<string, LanguageDef>();

for (const lang of LANGUAGES) {
  BY_ID.set(lang.id.toLowerCase(), lang);
  for (const key of [lang.id, lang.english, lang.code, lang.display]) {
    BY_ANY.set(key.toLowerCase(), lang);
  }
  const baseCode = lang.code.split(/[-_]/)[0].toLowerCase();
  // First definition for a base code wins (base languages are listed first).
  if (!BY_BASE_CODE.has(baseCode)) {
    BY_BASE_CODE.set(baseCode, lang);
  }
}

/** Get a language definition by its id, or undefined. */
export function getLanguageById(id: string | undefined): LanguageDef | undefined {
  return id ? BY_ID.get(id.toLowerCase()) : undefined;
}

/** Languages for UI pickers as `{ code: id, name: display }` (UI uses id as value). */
export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return LANGUAGES.map((lang) => ({ code: lang.id, name: lang.display }));
}

/**
 * Normalize a language value (id, English name, code, or display name) to the
 * full English name used in prompts. Unknown values are returned trimmed as-is.
 */
export function toEnglishName(language: string | undefined): string {
  const normalized = (language || '').trim();
  if (!normalized) {
    return normalized;
  }
  return BY_ANY.get(normalized.toLowerCase())?.english ?? normalized;
}

/**
 * Resolve an arbitrary language string (e.g. a browser/locale tag like "en-US",
 * "ja-JP", or an id/display name) to the best matching language id.
 *
 * Order: exact match on any form → exact regional code → base code → default.
 */
export function resolveLanguageId(value: string | undefined): string {
  const normalized = (value || '').trim();
  if (!normalized) {
    return DEFAULT_LANGUAGE_ID;
  }

  const exact = BY_ANY.get(normalized.toLowerCase());
  if (exact) {
    return exact.id;
  }

  const baseCode = normalized.split(/[-_]/)[0].toLowerCase();
  return BY_BASE_CODE.get(baseCode)?.id ?? DEFAULT_LANGUAGE_ID;
}
