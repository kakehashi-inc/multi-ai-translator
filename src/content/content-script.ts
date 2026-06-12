/**
 * Content Script
 * Injected into web pages to handle translation
 */
import browser from 'webextension-polyfill';
import { Translator } from './translator';
import { getMessage } from '../utils/i18n';
import { ConstVariables } from '../utils/const-variables';
import {
  isPageTranslated,
  showSelectionOverlay,
  updateSelectionOverlayStatus,
  showSelectionOverlayResult,
  showSelectionOverlayError,
  hideSelectionOverlay
} from '../utils/dom-manager';

type ContentRequest =
  | {
      action: 'translate-page';
      language?: string;
      provider?: string;
      sourceLanguage?: string;
    }
  | {
      action: 'translate-selection-inline';
      text: string;
      language?: string;
      provider?: string;
      sourceLanguage?: string;
    }
  | { action: 'restore-original' }
  | { action: 'has-selection' }
  | { action: 'get-selection-text' }
  | { action: 'get-translation-state' };

// Initialize translator
const translator = new Translator();
translator.initialize().catch((error) => {
  console.error('[Content Script] Failed to initialize translator:', error);
});

/**
 * Listen for messages from background script
 */
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request as ContentRequest)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Content Script] Error:', error);
      sendResponse({ error: error.message });
    });

  return true; // Keep message channel open
});

/**
 * Handle messages
 */
async function handleMessage(request: ContentRequest) {
  const { action } = request;

  switch (action) {
    case 'translate-page':
      await translator.translatePage(request.language, request.provider, request.sourceLanguage);
      return { success: true };

    case 'translate-selection-inline':
      await handleInlineSelectionTranslation(request);
      return { success: true };

    case 'restore-original':
      translator.restoreOriginal();
      return { success: true };

    case 'has-selection': {
      const selection = window.getSelection();
      const hasSelection = !!selection && selection.toString().trim().length > 0;
      return { success: true, hasSelection };
    }

    case 'get-selection-text': {
      const text = getSelectionTextWithLogicalBreaks(window.getSelection());
      return { success: true, text };
    }

    case 'get-translation-state': {
      const translated = isPageTranslated();
      return {
        success: true,
        isTranslated: translated,
        canRestore: translated
      };
    }

    default:
      throw new Error(getMessage('errorUnknownAction', [action]));
  }
}

async function handleInlineSelectionTranslation(
  request: Extract<ContentRequest, { action: 'translate-selection-inline' }>
) {
  const translatorMeta = {
    original: request.text,
    provider: request.provider || '',
    targetLanguage: request.language || '',
    sourceLanguage: request.sourceLanguage || 'auto',
    title: getMessage('selectionPopupTitle'),
    labels: {
      source: getMessage('labelSelectionSource'),
      target: getMessage('labelSelectionTarget'),
      provider: getMessage('labelSelectionProvider'),
      original: getMessage('labelSelectionOriginal'),
      result: getMessage('labelSelectionResult')
    },
    statusPreparing: getMessage('statusSelectionPreparing')
  };

  showSelectionOverlay(translatorMeta, () => {
    hideSelectionOverlay();
  });

  try {
    const chunks = splitSelectionText(request.text);
    const translations: string[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const current = (i + 1).toString();
      const total = chunks.length.toString();
      updateSelectionOverlayStatus(getMessage('statusTranslating', [current, total]));
      const translation = await translator.translateSelectionText(
        chunks[i],
        request.language,
        request.provider,
        request.sourceLanguage
      );
      // 翻訳結果が存在することを確認（条件判定でのみtrim()を使用）
      if (translation != null && translation.trim() !== '') {
        // 実際の値はtrim()せずに追加（空白や改行を維持）
        translations.push(translation);
      } else {
        // 翻訳結果が空の場合は元のテキストを保持
        console.warn(`[Content Script] Empty translation for chunk ${i + 1}, keeping original`);
        translations.push(chunks[i]);
      }
    }
    // すべての翻訳結果を結合（空の要素を除外、条件判定でのみtrim()を使用）
    const finalTranslation = translations.filter((t) => t != null && t.trim() !== '').join('\n');
    showSelectionOverlayResult(finalTranslation);
  } catch (error) {
    console.error('[Content Script] Inline selection translation failed', error);
    const message = error instanceof Error ? error.message : getMessage('errorTranslationFailed');
    showSelectionOverlayError(message);
    throw error;
  }
}

function getSelectionTextWithLogicalBreaks(selection: Selection | null): string {
  if (!selection || selection.rangeCount === 0) {
    return '';
  }

  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return '';
  }

  // Clone the selected content
  const fragment = range.cloneContents();

  // Find a suitable parent element to temporarily insert the fragment
  // This ensures original styles are applied
  const commonAncestor = range.commonAncestorContainer;
  const parentElement =
    commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as HTMLElement)
      : (commonAncestor.parentElement as HTMLElement);

  if (!parentElement) {
    // Fallback to simple toString if no parent element
    return selection.toString().replace(/\r\n/g, '\n').trim();
  }

  // Create a temporary container and insert it into the DOM
  // This allows the browser to apply styles and compute innerText correctly
  const tempContainer = document.createElement('div');
  tempContainer.style.position = 'absolute';
  tempContainer.style.left = '-9999px';
  tempContainer.style.top = '-9999px';
  tempContainer.style.visibility = 'hidden';
  tempContainer.style.whiteSpace = 'pre-wrap';
  tempContainer.setAttribute('aria-hidden', 'true');

  tempContainer.appendChild(fragment);
  parentElement.appendChild(tempContainer);

  let result: string;
  try {
    // Force reflow to ensure styles are computed
    void tempContainer.offsetHeight;
    // Use innerText which automatically handles logical line breaks
    result = tempContainer.innerText || tempContainer.textContent || '';
  } finally {
    // Always clean up: remove the temporary container
    parentElement.removeChild(tempContainer);
  }

  // Normalize line breaks
  return result.replace(/\r\n/g, '\n').trim();
}

function splitSelectionText(
  text: string,
  maxLength = ConstVariables.DEFAULT_CHUNK_MAX_LENGTH
): string[] {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized) {
    return [''];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const lines = normalized.split('\n');
  const chunks: string[] = [];
  let current = '';

  for (const line of lines) {
    const addition = current ? `\n${line}` : line;

    if (current && current.length + addition.length > maxLength) {
      chunks.push(current);
      current = line;
      continue;
    }

    if (!current && addition.length > maxLength) {
      chunks.push(line);
      current = '';
      continue;
    }

    current = current ? `${current}\n${line}` : line;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [normalized];
}

/**
 * Listen for selection changes to show translate button
 */
let selectionTimeout: number | null = null;
document.addEventListener('mouseup', () => {
  if (selectionTimeout) {
    clearTimeout(selectionTimeout);
  }
  selectionTimeout = window.setTimeout(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      // Could show a floating button here
    }
  }, 300);
});

console.info('[Multi AI Translator] Content script loaded');
