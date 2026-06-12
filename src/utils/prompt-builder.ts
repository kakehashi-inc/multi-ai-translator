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

export class PromptBuilder {
  static buildPrompt(
    requestPayload: string,
    targetLanguage: string,
    sourceLanguage: string
  ): string {
    const sourceLangText =
      sourceLanguage === 'auto' ? 'the detected source language' : sourceLanguage;

    return `You are a precise translation engine.
Instructions:
- Task: Translate each <item> in the XML request from ${sourceLangText} to ${targetLanguage}.
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
  }

  static buildRequestPayload(texts: string[] = []): string {
    const items = texts.map((text) => `<item>${escapeXml(text)}</item>`).join('\n');
    return `<request>\n${items}\n</request>`;
  }

  static parseResponsePayload(response: string, originals: string[] = []): string[] {
    try {
      if (!response?.includes('<item')) {
        return [];
      }

      const normalizedMap = new Map<string, number[]>();
      originals.forEach((text, index) => {
        const key = normalizeForMatch(text);
        if (!normalizedMap.has(key)) {
          normalizedMap.set(key, []);
        }
        normalizedMap.get(key)?.push(index);
      });

      const translations = new Array<string>(originals.length).fill('');
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(response)) !== null) {
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
    } catch {
      // If parsing fails, fall back to caller-defined behavior (e.g. simple split).
      return [];
    }
  }
}
