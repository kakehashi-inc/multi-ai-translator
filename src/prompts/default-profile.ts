/**
 * Default prompt profile.
 *
 * Provides both dispatch shapes so it works regardless of the resolved mode:
 *
 *  - Block: the whole list of texts is sent in one prompt as an XML `<request>`
 *    and the model returns a matching `<response>`. The XML is an INTERNAL
 *    detail of this file and never leaves it.
 *  - Single: one text is sent with a plain instruction and the raw reply is the
 *    translation. Used when a model keeps this (default) prompt but is forced to
 *    single dispatch via `SINGLE_DISPATCH_MODEL_RULES`.
 *
 * This profile does not declare a `dispatch` preference, so dispatch is decided
 * by the model-name list (default 'block'). It is the fallback for every model
 * without a dedicated profile.
 */
import { toEnglishName } from '../utils/languages';
import type { PromptContext, PromptProfile } from './types';

function escapeXml(text: string = ''): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(text: string = ''): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeForMatch(text: string = ''): string {
  return text.replace(/\s+/g, ' ').trim();
}

function sourceLangText(context: PromptContext): string {
  return context.sourceLanguage === 'auto'
    ? 'the detected source language'
    : toEnglishName(context.sourceLanguage);
}

function targetLangText(context: PromptContext): string {
  return toEnglishName(context.targetLanguage);
}

/** Build the `<request>` payload from the source texts. */
function buildRequestPayload(texts: string[]): string {
  const items = texts.map((text) => `<item>${escapeXml(text)}</item>`).join('\n');
  return `<request>\n${items}\n</request>`;
}

export const defaultProfile: PromptProfile = {
  id: 'default',

  // The default profile is the fallback; it does not match by itself.
  matches(): boolean {
    return false;
  },

  // No dispatch preference: the model-name list decides (default 'block').

  buildBlockPrompt(texts: string[], context: PromptContext): string {
    const requestPayload = buildRequestPayload(texts);
    return `You are a precise translation engine.
Instructions:
- Task: Translate each <item> in the XML request from ${sourceLangText(context)} to ${targetLangText(context)}.
- Format: Respond ONLY with XML and nothing else (no explanations, no comments, no extra text).
- Mapping: For every <item> in <request>, return one <item> in <response> where <original> is the original text and <translated> is the translated text.
- Preservation: Keep all HTML tags, attributes, whitespace, and line breaks exactly as in the original.
- Code: Do not translate programming code, API calls, configuration samples, stack traces, or other technical snippets. Copy these parts exactly.

Response schema:

<response>
<item>
<original>...</original>
<translated>...</translated>
</item>
</response>

Request:
${requestPayload}`;
  },

  parseBlockResponse(output: string, originals: string[]): string[] {
    // Default every slot to its original so the result stays aligned even if the
    // model omits or mangles some items.
    const translations = originals.slice();

    if (!output?.includes('<item')) {
      return translations;
    }

    const normalizedMap = new Map<string, number[]>();
    originals.forEach((text, index) => {
      const key = normalizeForMatch(text);
      if (!normalizedMap.has(key)) {
        normalizedMap.set(key, []);
      }
      normalizedMap.get(key)?.push(index);
    });

    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(output)) !== null) {
      const block = match[1];
      const originalMatch = block.match(/<original>([\s\S]*?)<\/original>/i);
      const translatedMatch = block.match(/<translated>([\s\S]*?)<\/translated>/i);
      if (!originalMatch || !translatedMatch) continue;

      // 空白や改行を維持するため、実際の値にはtrim()を使用しない
      const originalText = unescapeXml(originalMatch[1] ?? '');
      const translatedText = unescapeXml(translatedMatch[1] ?? '');
      // 条件判定でのみtrim()を使用して意味のない戻り値を排除
      if (originalText == null || originalText.trim() === '') continue;

      const key = normalizeForMatch(originalText);
      const targets = normalizedMap.get(key);
      if (!targets || !targets.length) continue;

      const targetIndex = targets.shift();
      // 条件判定でのみtrim()を使用して意味のない戻り値を排除
      if (targetIndex !== undefined && translatedText != null && translatedText.trim() !== '') {
        // 実際の値はtrim()せずに保存（空白や改行を維持）
        translations[targetIndex] = translatedText;
      }
    }

    return translations;
  },

  buildSinglePrompt(text: string, context: PromptContext): string {
    return `You are a precise translation engine. Translate the following text from ${sourceLangText(context)} to ${targetLangText(context)}. Respond ONLY with the translation, with no explanations or extra text. Keep all HTML tags, whitespace, and line breaks exactly as in the original.

${text}`;
  },

  parseSingleResponse(output: string): string {
    // The whole reply is the translation; trim surrounding whitespace the model
    // may add. Inner whitespace/newlines are preserved.
    return (output ?? '').trim();
  }
};
