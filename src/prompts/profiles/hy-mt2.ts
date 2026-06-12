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
    // Hy-MT2 returns only the translation; trim surrounding whitespace.
    return (output ?? '').trim();
  }
};
