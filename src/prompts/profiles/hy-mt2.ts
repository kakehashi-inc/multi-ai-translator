/**
 * Hy-MT2 prompt profile (Tencent Hunyuan Hy-MT2, single-dispatch).
 *
 * Two complementary prompt variants are tried in order; the runner keeps the
 * first acceptable output and otherwise falls back to the original text.
 *
 * IMPORTANT: the source markers are `[HyText]` / `<hytext>`, NOT `[Source Text]`
 * / `<sourceText>`. The markers must not collide with the source: translation
 * docs (e.g. the Hy-MT2 README) literally contain `[Source Text]`/`<sourceText>`,
 * which would break the boundary. Do not "simplify" them back.
 */
import { toEnglishName } from '../../utils/languages';
import type { PromptContext, PromptProfile, SingleResult } from '../types';

// Shared instruction tail: keep proper nouns unchanged and emit only the
// translation. Naming the proper-noun categories explicitly (company / product /
// app / service) keeps such names intact more reliably; "output ONLY ..."
// suppresses chatty preambles on short inputs.
const ONLY_TRANSLATION =
  'Keep proper nouns — personal names, company names, product/brand names, and app/service names — unchanged. Output ONLY the translated text itself — no greeting, no explanation, no commentary, no quotes.';

/**
 * Fallback prompt (attempt 1): the source sits in a labeled `[HyText]` block,
 * separate from the instruction. This almost never runs away, so it rescues the
 * cases the primary tag form breaks on (at the cost of more "skips"). Target
 * language is normalized to its English name (Hy-MT2 wanders with native names /
 * bare codes).
 */
export function buildHyMt2Prompt(sourceText: string, targetLanguage: string): string {
  const targetName = toEnglishName(targetLanguage);
  return `[HyText]
${sourceText}

[Task]
Translate the [HyText] into ${targetName}. ${ONLY_TRANSLATION}`;
}

/**
 * Primary prompt (attempt 0): wrap the source in a `<hytext>` tag.
 *
 * Keep the fixed opener and just wrap the source — do not describe the marker in
 * the instruction — and keep the "do not output these instructions" clause; both
 * avoid the model echoing the instruction on short inputs.
 */
function buildHyMt2TagPrompt(sourceText: string, targetLanguage: string): string {
  const targetName = toEnglishName(targetLanguage);
  return `Translate the following text into ${targetName}. ${ONLY_TRANSLATION} Do not translate or output these instructions; translate only the wrapped text.

<hytext>${sourceText}</hytext>`;
}

const HY_MT2_CONTROL = /<｜|<\|hy|hy[-_ ]?(Assistant|User|begin|end)/i; // chat-template tokens
const BLOCK_MARKER = /\[HyText\]|\[Task\]/; // block variant labels
const TAG_MARKER = /<\/?hytext>/i; // tag variant wrapper

export const hyMt2Profile: PromptProfile = {
  id: 'hy-mt2',

  matches(model: string | undefined): boolean {
    return !!model && model.toLowerCase().includes('hy-mt2');
  },

  // Hy-MT2 is a per-text model: always translate one text per request.
  dispatch: 'single',

  // Two complementary prompt variants tried in order. The tag form (attempt 0)
  // has the higher translation rate; the labeled block (attempt 1) almost never
  // runs away, so it rescues the cases the tag form breaks on. Order and the
  // empty=skip policy were chosen from direct Ollama testing.
  singleAttemptCount: 2,

  buildSinglePrompt(text: string, context: PromptContext, attempt = 0): string {
    return attempt === 0
      ? buildHyMt2TagPrompt(text, context.targetLanguage)
      : buildHyMt2Prompt(text, context.targetLanguage);
  },

  // empty → skip; control token or this variant's own marker → error; else ok.
  parseSingleResponse(output: string, _original: string, attempt: number): SingleResult {
    const trimmed = (output ?? '').trim();
    if (trimmed === '') {
      return { status: 'skip' };
    }
    if (HY_MT2_CONTROL.test(trimmed)) {
      return { status: 'error', text: 'control token leak' };
    }
    const markerLeak = attempt === 0 ? TAG_MARKER.test(trimmed) : BLOCK_MARKER.test(trimmed);
    if (markerLeak) {
      return { status: 'error', text: 'marker leak' };
    }
    return { status: 'ok', text: trimmed };
  }
};
