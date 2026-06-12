/**
 * Hy-MT2 prompt profile.
 *
 * Tencent Hunyuan Hy-MT2 (https://github.com/Tencent-Hunyuan/Hy-MT2) is a
 * dedicated translation model. It does NOT follow the app's default XML batch
 * instructions; it expects a single, plain translation instruction per text:
 *
 *   Translate the following text into {target_lang}. Note that you should only
 *   output the translated result without any additional explanation:
 *
 *   {source_text}
 *
 * This file owns ONLY the prompt and parsing. It declares `dispatch: 'single'`
 * so the shared runner sends one request per text; it therefore implements only
 * the single-dispatch methods. (Prompt and dispatch are separate concerns —
 * see types.ts / dispatch.ts.)
 */
import { toEnglishName } from '../../utils/languages';
import type { PromptContext, PromptProfile } from '../types';

/**
 * Build the Hy-MT2 default single-text prompt.
 *
 * The target language is normalized to its full English name via
 * `toEnglishName`. This matters a lot: with the English name
 * ("Japanese") Hy-MT2 stays on task, but with the native name ("日本語") or the
 * bare code it tends to wander off and fabricate a conversation.
 */
export function buildHyMt2Prompt(sourceText: string, targetLanguage: string): string {
  const targetName = toEnglishName(targetLanguage);
  return `Translate the following text into ${targetName}. Note that you should only output the translated result without any additional explanation:

${sourceText}`;
}

/**
 * Hy-MT2 control-token markers that some builds (notably the Ollama GGUF
 * conversions) leak into the output as plain text instead of treating as real
 * end/role tokens. When this happens the model keeps generating past the answer
 * — emitting a fake next turn or degenerating into repetition — so everything
 * from the first marker onward is junk and must be cut.
 *
 * Matches an opening `<` optionally followed by a full-width `｜` / half-width
 * `|` separator and then `hy` (covering `<｜hy_End▁of▁sentence｜>`,
 * `<｜hy_User｜>`, `<｜hy Input｜>`, `< | hy-Assistant | >`, etc.).
 */
const HY_MT2_CONTROL_TOKEN = /<\s*[｜|]?\s*hy[\s\S]*$/i;

/** Matches `<br>`, `<br/>`, `<br />` (any case) that the model emits for newlines. */
const HY_MT2_BR_TAG = /<br\s*\/?>/gi;

/**
 * Clean a single Hy-MT2 translation. Exported for testing.
 *
 * The model operates on plain text (we extract via `textContent`), but this
 * build tends to:
 *   1. leak control tokens (e.g. `<｜hy_End▁of▁sentence｜>`) and then keep
 *      generating garbage — everything from the first marker on is cut;
 *   2. render line breaks as literal `<br>` tags — since the result is written
 *      back as text, those would show up verbatim, so they are turned back into
 *      newlines.
 */
export function cleanHyMt2Output(output: string = ''): string {
  return output
    .replace(HY_MT2_CONTROL_TOKEN, '')
    .replace(HY_MT2_BR_TAG, '\n')
    .trim();
}

export const hyMt2Profile: PromptProfile = {
  id: 'hy-mt2',

  matches(model: string | undefined): boolean {
    return !!model && model.toLowerCase().includes('hy-mt2');
  },

  // Hy-MT2 is a per-text model: always translate one text per request.
  dispatch: 'single',

  buildSinglePrompt(text: string, context: PromptContext): string {
    return buildHyMt2Prompt(text, context.targetLanguage);
  },

  parseSingleResponse(output: string): string {
    // Hy-MT2 returns only the translation, but some builds leak control tokens
    // (e.g. `<｜hy_End▁of▁sentence｜>`) and then keep generating garbage. Cut
    // everything from the first such marker and trim.
    return cleanHyMt2Output(output);
  }
};
