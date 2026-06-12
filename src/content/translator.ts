/**
 * Translator Module
 * Core translation logic for content scripts
 */
import browser from 'webextension-polyfill';
import {
  getTranslatableNodes,
  replaceNodeContent,
  restoreOriginalContent,
  showLoadingIndicator,
  hideLoadingIndicator,
  clearAllLoadingIndicators,
  updateTranslationStatus,
  clearTranslationStatus
} from '../utils/dom-manager';
import { PromptBuilder } from '../utils/prompt-builder';
import { ConstVariables } from '../utils/const-variables';
import { getMessage } from '../utils/i18n';
import type { Settings } from '../types/settings';

const {
  DEFAULT_BATCH_MAX_CHARS,
  DEFAULT_BATCH_MAX_ITEMS,
  STATUS_CLEAR_DELAY_MS,
  BATCH_THROTTLE_DELAY_MS
} = ConstVariables;

type TranslationGroup = {
  parent: HTMLElement;
  nodes: Text[];
};

type BatchEntry = {
  group: TranslationGroup;
  index: number;
  textCount: number;
  completed: number;
};

type NodeReference = {
  entry: BatchEntry;
  node: Text;
  original: string;
};

type TranslateMessageResponse =
  | { success: true; translation: string; provider: string }
  | { success: false; error: string };

/**
 * Translator class
 */
export class Translator {
  private isTranslating = false;
  private settings: Settings | null = null;
  private cancelRequested = false;
  private selectionInProgress = false;

  /**
   * Initialize translator
   */
  async initialize(): Promise<void> {
    this.settings = await this.getSettings();
  }

  /**
   * Get settings from background
   */
  private async getSettings(): Promise<Settings> {
    return browser.runtime.sendMessage({ action: 'getSettings' }) as Promise<Settings>;
  }

  private async ensureSettings(): Promise<Settings> {
    if (!this.settings) {
      this.settings = await this.getSettings();
    }
    return this.settings;
  }

  /**
   * Translate page
   */
  async translatePage(
    targetLanguage: string | null = null,
    providerName: string | null = null,
    sourceLanguage: string | null = null
  ): Promise<void> {
    if (this.isTranslating) {
      console.warn('[Translator] Translation already in progress');
      return;
    }

    this.isTranslating = true;
    this.cancelRequested = false;

    updateTranslationStatus(getMessage('statusScanning'));
    try {
      const settings = await this.ensureSettings();

      const target = targetLanguage || settings.common.defaultTargetLanguage;
      // Pass through whatever the caller picked (or null). The background
      // worker resolves the actual enabled provider via lastUsedProvider /
      // first-enabled fallback — translator.ts must not pre-resolve here.
      const provider = providerName || null;
      const source = sourceLanguage || settings.common.defaultSourceLanguage || 'auto';

      // Get translatable nodes
      const nodes = getTranslatableNodes();

      if (nodes.length === 0) {
        throw new Error(getMessage('errorNoTranslatableText'));
      }

      // Group nodes by parent element to reduce API calls
      const textGroups = this.groupNodesByParent(nodes);
      const totalGroups = textGroups.length;
      updateTranslationStatus(getMessage('statusFoundBlocks', [totalGroups.toString()]));

      const maxChars = Number(settings.common.batchMaxChars) || DEFAULT_BATCH_MAX_CHARS;
      const maxItems = Number(settings.common.batchMaxItems) || DEFAULT_BATCH_MAX_ITEMS;

      // Estimate total batches based on groups and batch size
      // This is an approximation since batches are created dynamically
      // Calculate average characters per group to better estimate batches
      const avgCharsPerGroup =
        nodes.reduce((sum, node) => sum + (node.textContent?.length ?? 0), 0) / totalGroups;
      const itemsPerBatch = Math.min(
        maxItems,
        Math.floor(maxChars / Math.max(avgCharsPerGroup, 1))
      );
      const estimatedTotalBatches = Math.max(1, Math.ceil(totalGroups / itemsPerBatch));

      let translated = 0;
      const errors: string[] = [];
      let batchIndexCounter = 0;
      let batchNumber = 0;
      let maxBatchNumber = estimatedTotalBatches;

      // Process batches one at a time and free memory immediately after each batch
      const processBatch = async (
        batchTexts: string[],
        batchRefs: NodeReference[],
        batchEntries: BatchEntry[]
      ): Promise<number> => {
        if (this.cancelRequested) {
          // Ensure loading indicators for this batch are cleared
          batchEntries.forEach((entry) => {
            hideLoadingIndicator(entry.group.parent);
          });
          return 0;
        }
        batchNumber++;
        // Update max batch number if we exceed the estimate
        maxBatchNumber = Math.max(maxBatchNumber, batchNumber);
        try {
          // Update progress with current batch number and total (estimated or actual)
          updateTranslationStatus(
            getMessage('statusTranslating', [batchNumber.toString(), maxBatchNumber.toString()])
          );

          const requestPayload = PromptBuilder.buildRequestPayload(batchTexts);
          const result = await this.translateText(requestPayload, target, source, provider);

          if (!result?.success) {
            throw new Error(result?.error || getMessage('errorTranslationFailed'));
          }

          let translations = PromptBuilder.parseResponsePayload(result.translation, batchTexts);

          if (!translations.length) {
            console.warn('[Translator] Failed to parse structured response, using fallback');
            translations = this.splitTranslation(result.translation, batchTexts.length);
          }

          // If cancel was requested while waiting for the provider, skip applying results
          if (this.cancelRequested) {
            batchEntries.forEach((entry) => {
              hideLoadingIndicator(entry.group.parent);
            });
            return 0;
          }

          // Apply translations immediately as they are parsed
          let batchTranslated = 0;
          let emptyTranslations = 0;
          batchRefs.forEach((ref, idx) => {
            const translatedText = translations[idx];
            const hasTranslatedText = translatedText && translatedText.trim();

            if (hasTranslatedText && translatedText !== ref.original) {
              replaceNodeContent(ref.node, translatedText, provider);
              ref.entry.completed = (ref.entry.completed || 0) + 1;
            } else {
              if (!hasTranslatedText) {
                // Provider returned an empty or whitespace-only string.
                // This is not an error – we simply keep the original text.
                emptyTranslations++;
              }
              ref.entry.completed = (ref.entry.completed || 0) + 1;
            }

            if (ref.entry.completed === ref.entry.textCount) {
              batchTranslated++;
              translated++;
              hideLoadingIndicator(ref.entry.group.parent);
            }
          });

          // Log summary of empty translations once per batch (non-fatal).
          // Empty translations are not treated as errors – we just keep the original text –
          // but this information can be useful during debugging.
          if (emptyTranslations > 0 && process.env.NODE_ENV !== 'production') {
            console.info(
              `[Translator] ${emptyTranslations} items returned empty translation in batch ${batchNumber}, keeping original text`
            );
          }

          // Free memory: clear processed data references
          // Note: DOM nodes are kept as they are needed for display
          // Only clear the temporary batch data structures
          return batchTranslated;
        } catch (error) {
          // Collect errors for this batch. Actual logging is done after all batches complete
          // to avoid duplicated messages from multiple layers.
          const blockIndexes: number[] = [];
          batchEntries.forEach((entry) => {
            hideLoadingIndicator(entry.group.parent);
            blockIndexes.push(entry.index);
          });

          const label =
            blockIndexes.length === 1
              ? `Block ${blockIndexes[0]}`
              : `Blocks ${blockIndexes.join(', ')}`;
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${label}: ${message}`);
          return 0;
        }
      };

      // Build and process batches incrementally
      const createEmptyBatch = () => ({
        texts: [] as string[],
        refs: [] as NodeReference[],
        entries: [] as BatchEntry[],
        charCount: 0
      });

      let currentBatch = createEmptyBatch();

      for (const group of textGroups) {
        if (this.cancelRequested) {
          break;
        }
        batchIndexCounter++;
        showLoadingIndicator(group.parent);

        const entry: BatchEntry = {
          group,
          index: batchIndexCounter,
          textCount: group.nodes.length,
          completed: 0
        };

        // Collect nodes for this group
        const groupTexts: string[] = [];
        const groupRefs: NodeReference[] = [];
        group.nodes.forEach((node) => {
          const original = node.textContent ?? '';
          groupTexts.push(original);
          groupRefs.push({
            entry,
            node,
            original
          });
        });

        // Add to current batch
        currentBatch.texts.push(...groupTexts);
        currentBatch.refs.push(...groupRefs);
        currentBatch.entries.push(entry);
        currentBatch.charCount += groupTexts.reduce((sum, text) => sum + text.length, 0);

        // Process batch when limits are reached
        if (currentBatch.texts.length >= maxItems || currentBatch.charCount >= maxChars) {
          await processBatch(currentBatch.texts, currentBatch.refs, currentBatch.entries);
          currentBatch = createEmptyBatch();

          await this.delay(BATCH_THROTTLE_DELAY_MS);
        }
      }

      // Process remaining batch
      if (currentBatch.texts.length > 0) {
        await processBatch(currentBatch.texts, currentBatch.refs, currentBatch.entries);
        currentBatch = createEmptyBatch();
      }

      // Free memory: clear textGroups reference after processing
      // Note: DOM nodes remain in the document, only our references are cleared
      const finalTranslated = translated;
      const finalErrors = errors.length;
      const totalBatches = batchNumber;

      if (this.cancelRequested) {
        // Cancelled by user
        updateTranslationStatus(getMessage('statusCancelled'), 'info');
      } else if (finalErrors > 0) {
        updateTranslationStatus(
          getMessage('statusCompletedWithErrors', [
            totalBatches.toString(),
            finalErrors.toString()
          ]),
          finalTranslated > 0 ? 'info' : 'error'
        );
        errors.forEach((message) => console.error('[Translator] Block error:', message));
      } else {
        updateTranslationStatus(
          getMessage('statusCompleted', [totalBatches.toString()]),
          'success'
        );
      }

      // Clear errors array to free memory
      errors.length = 0;
    } finally {
      this.isTranslating = false;
      this.cancelRequested = false;
      clearAllLoadingIndicators();
      clearTranslationStatus(STATUS_CLEAR_DELAY_MS);
    }
  }

  /**
   * Translate arbitrary selection text without modifying the DOM
   */
  async translateSelectionText(
    text: string,
    targetLanguage: string | null = null,
    providerName: string | null = null,
    sourceLanguage: string | null = null
  ): Promise<string> {
    if (this.selectionInProgress) {
      throw new Error(getMessage('statusTranslatingSelection'));
    }

    try {
      this.selectionInProgress = true;
      const settings = await this.ensureSettings();
      const target = targetLanguage || settings.common.defaultTargetLanguage;
      // Pass through whatever the caller picked (or null). The background
      // worker resolves the actual enabled provider via lastUsedProvider /
      // first-enabled fallback — translator.ts must not pre-resolve here.
      const provider = providerName || null;
      const source = sourceLanguage || settings.common.defaultSourceLanguage || 'auto';

      const requestPayload = PromptBuilder.buildRequestPayload([text]);
      const result = await this.translateText(requestPayload, target, source, provider);

      if (!result.success) {
        throw new Error(result.error);
      }

      // XML形式のレスポンスをパース
      const translations = PromptBuilder.parseResponsePayload(result.translation, [text]);

      // パースが成功し、翻訳結果が存在する場合（条件判定でのみtrim()を使用）
      if (translations.length > 0 && translations[0] != null && translations[0].trim() !== '') {
        // 実際の値はtrim()せずに返す（空白や改行を維持）
        return translations[0];
      }

      // パースが失敗した場合、生の翻訳結果を使用（条件判定でのみtrim()を使用）
      if (result.translation != null && result.translation.trim() !== '') {
        // 実際の値はtrim()せずに返す（空白や改行を維持）
        return result.translation;
      }

      // 翻訳結果が空の場合は元のテキストを返す
      return text;
    } finally {
      this.selectionInProgress = false;
    }
  }

  /**
   * Restore original content
   */
  restoreOriginal(): void {
    this.cancelRequested = true;
    this.isTranslating = false;
    restoreOriginalContent();
  }

  /**
   * Translate text via background script
   */
  private async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage: string,
    providerName: string | null
  ): Promise<TranslateMessageResponse> {
    return browser.runtime.sendMessage({
      action: 'translate',
      data: {
        text,
        targetLanguage,
        sourceLanguage,
        providerName
      }
    }) as Promise<TranslateMessageResponse>;
  }

  /**
   * Group nodes by parent element
   */
  private groupNodesByParent(nodes: Text[]): TranslationGroup[] {
    const groups = new Map<HTMLElement, Text[]>();

    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent) {
        return;
      }
      if (!groups.has(parent)) {
        groups.set(parent, []);
      }
      groups.get(parent)?.push(node);
    });

    return Array.from(groups.entries()).map(([parent, groupedNodes]) => ({
      parent,
      nodes: groupedNodes
    }));
  }

  /**
   * Split translation back to match node count
   */
  private splitTranslation(translation: string, nodeCount: number): string[] {
    if (nodeCount === 1) {
      return [translation];
    }

    // Simple split by sentences
    const sentences = translation.match(/[^.!?]+[.!?]+/g) || [translation];

    if (sentences.length >= nodeCount) {
      return sentences.slice(0, nodeCount);
    }

    // If fewer sentences, pad with empty strings
    return [...sentences, ...Array(nodeCount - sentences.length).fill('')];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
