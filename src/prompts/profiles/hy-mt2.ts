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
 * Build the Hy-MT2 single-text prompt.
 *
 * Adapted from the model card's "Personalization" instruction shape: the source
 * goes in its own `[Source Text]` block and the instruction follows under a
 * `[Task]` block. The model card prompts are only samples, so this is tuned for
 * the small 7B GGUF build.
 *
 * Why this shape: Hy-MT2 (especially the Ollama GGUF builds) tends to mistake
 * short, ambiguous fragments ("init", "Code", "設定") for an instruction and run
 * away — echoing the prompt and leaking control tokens like `<｜hy_User｜>`.
 * Putting the source in a labeled block, separate from the instruction, stops
 * that. Across direct Ollama testing (short fragments, quote/symbol-containing
 * strings, multiple target languages) this single-line `[Task]` form was the
 * most robust of the variants tried — more reliable than the model card's
 * numbered task list, an XML-tag wrapper, or an explicit "no tags" instruction.
 * This is a prompt-only fix — no output post-processing.
 *
 * The target language is normalized to its full English name via
 * `toEnglishName`; with the English name ("Japanese") Hy-MT2 stays on task,
 * whereas the native name ("日本語") or bare code makes it wander.
 */
export function buildHyMt2Prompt(sourceText: string, targetLanguage: string): string {
  const targetName = toEnglishName(targetLanguage);
  return `[Source Text]
${sourceText}

[Task]
Translate the [Source Text] into ${targetName} and output only the translation.`;
}

/**
 * Fallback prompt: wrap the source in a `<sourceText>` tag. In testing this is
 * complementary to {@link buildHyMt2Prompt} — it rescues the cases that one
 * fails (HTML-ish text and brackets like `<div>`, `(optional)`, `{config}`),
 * while the primary handles cases this one fails (bare letters, formulas,
 * multiline). Together they cover the full test sweep.
 */
function buildHyMt2TagPrompt(sourceText: string, targetLanguage: string): string {
  const targetName = toEnglishName(targetLanguage);
  return `Translate the text inside <sourceText></sourceText> into ${targetName}. Output only the translation, without the tags and without any explanation.

<sourceText>${sourceText}</sourceText>`;
}

// Runaway always looks like leaked Hy-MT2 control tokens — shared across both
// prompt variants.
const HY_MT2_CONTROL = /<｜|<\|hy|hy[-_ ]?(Assistant|User|begin|end)/i;
// Variant 0 (buildHyMt2Prompt) failure: the model echoes its own block labels.
const TASK_BLOCK_LEAK = /\[Source Text\]|\[Task\]|\[Translation Tasks\]/i;
// Variant 1 (buildHyMt2TagPrompt) failure / artifact: the wrapper tag appears.
const SOURCE_TAG = /<\/?sourceText>/i;

export const hyMt2Profile: PromptProfile = {
  id: 'hy-mt2',

  matches(model: string | undefined): boolean {
    return !!model && model.toLowerCase().includes('hy-mt2');
  },

  // Hy-MT2 is a per-text model: always translate one text per request.
  dispatch: 'single',

  // Two complementary prompt variants tried in order (primary, then tag form).
  singleAttemptCount: 2,

  buildSinglePrompt(text: string, context: PromptContext, attempt = 0): string {
    return attempt === 0
      ? buildHyMt2Prompt(text, context.targetLanguage)
      : buildHyMt2TagPrompt(text, context.targetLanguage);
  },

  // Acceptance is variant-specific: both reject runaway control tokens and empty
  // output, but each also rejects the leak its own prompt is prone to.
  isSingleResponseAcceptable(output: string, _original: string, attempt: number): boolean {
    const trimmed = (output ?? '').trim();
    if (trimmed === '' || HY_MT2_CONTROL.test(trimmed)) {
      return false;
    }
    return attempt === 0 ? !TASK_BLOCK_LEAK.test(trimmed) : !SOURCE_TAG.test(trimmed);
  },

  // No variant-specific parsing: for the tag variant a correct answer comes back
  // as bare text (the prompt asks for no tags), and any `<sourceText>` that does
  // appear means the model broke down — which `isSingleResponseAcceptable`
  // already rejects — so there is nothing to strip, just trim.
  parseSingleResponse(output: string): string {
    return (output ?? '').trim();
  }
};
