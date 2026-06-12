/**
 * One-off helper: insert the `statusCancelling` and `statusCancellingPrevious`
 * message keys into every locale's messages.json, right after `statusCancelled`.
 *
 * Idempotent: skips a locale that already has the keys. Preserves 2-space
 * indentation and key order.
 *
 * Usage: node scripts/add-cancelling-messages.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'locales');

// Translations per locale. `statusCancelling` is shown while a cancel is in
// progress; `statusCancellingPrevious` while a re-translate cancels the prior
// run before starting a new one.
const TRANSLATIONS = {
  en: {
    cancelling: 'Cancelling translation...',
    cancellingPrevious: 'Cancelling the previous translation...'
  },
  ja: {
    cancelling: '翻訳をキャンセルしています...',
    cancellingPrevious: '前の翻訳をキャンセルしています...'
  },
  de: {
    cancelling: 'Übersetzung wird abgebrochen...',
    cancellingPrevious: 'Vorherige Übersetzung wird abgebrochen...'
  },
  es: {
    cancelling: 'Cancelando la traducción...',
    cancellingPrevious: 'Cancelando la traducción anterior...'
  },
  fr: {
    cancelling: 'Annulation de la traduction...',
    cancellingPrevious: 'Annulation de la traduction précédente...'
  },
  it: {
    cancelling: 'Annullamento della traduzione...',
    cancellingPrevious: 'Annullamento della traduzione precedente...'
  },
  pt: {
    cancelling: 'Cancelando a tradução...',
    cancellingPrevious: 'Cancelando a tradução anterior...'
  },
  ru: {
    cancelling: 'Отмена перевода...',
    cancellingPrevious: 'Отмена предыдущего перевода...'
  },
  ko: {
    cancelling: '번역을 취소하는 중...',
    cancellingPrevious: '이전 번역을 취소하는 중...'
  },
  zh: {
    cancelling: '正在取消翻译...',
    cancellingPrevious: '正在取消上一个翻译...'
  },
  ar: {
    cancelling: 'جارٍ إلغاء الترجمة...',
    cancellingPrevious: 'جارٍ إلغاء الترجمة السابقة...'
  },
  hi: {
    cancelling: 'अनुवाद रद्द किया जा रहा है...',
    cancellingPrevious: 'पिछला अनुवाद रद्द किया जा रहा है...'
  }
};

const DESC_CANCELLING = 'Status message while a translation is being cancelled';
const DESC_CANCELLING_PREVIOUS =
  'Status message while the previous translation is cancelled before a new one starts';

let changed = 0;

for (const locale of Object.keys(TRANSLATIONS)) {
  const file = path.join(LOCALES_DIR, locale, 'messages.json');
  if (!fs.existsSync(file)) {
    console.warn(`[skip] no messages.json for locale "${locale}"`);
    continue;
  }

  const json = JSON.parse(fs.readFileSync(file, 'utf8'));

  if (json.statusCancelling && json.statusCancellingPrevious) {
    console.log(`[skip] ${locale}: keys already present`);
    continue;
  }
  if (!json.statusCancelled) {
    console.warn(`[skip] ${locale}: statusCancelled not found, cannot anchor insert`);
    continue;
  }

  const t = TRANSLATIONS[locale];

  // Rebuild the object preserving key order, inserting the two new keys right
  // after statusCancelled.
  const rebuilt = {};
  for (const [key, value] of Object.entries(json)) {
    rebuilt[key] = value;
    if (key === 'statusCancelled') {
      rebuilt.statusCancelling = { message: t.cancelling, description: DESC_CANCELLING };
      rebuilt.statusCancellingPrevious = {
        message: t.cancellingPrevious,
        description: DESC_CANCELLING_PREVIOUS
      };
    }
  }

  fs.writeFileSync(file, JSON.stringify(rebuilt, null, 2) + '\n', 'utf8');
  console.log(`[ok]   ${locale}: inserted statusCancelling / statusCancellingPrevious`);
  changed++;
}

console.log(`\nDone. ${changed} locale file(s) updated.`);
