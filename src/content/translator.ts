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
  | { success: true; translations: string[]; provider: string }
  | { success: false; error: string };

type DispatchMode = 'block' | 'single';

type TranslationPlanMessageResponse =
  | { success: true; provider: string; model: string | null; dispatch: DispatchMode }
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

      // Resolve the dispatch mode up front. In 'single' mode the provider sends
      // one request per text, so we build one-group-per-batch (maxItems = 1, no
      // char cap) to keep the progress counter advancing per group instead of
      // freezing for the whole chunk. In 'block' mode we use the configured
      // batch sizes. If the plan cannot be resolved we fall back to block.
      const plan = await this.getTranslationPlan(provider);
      const isSingleDispatch = plan?.success === true && plan.dispatch === 'single';

      const maxChars = isSingleDispatch
        ? Number.MAX_SAFE_INTEGER
        : Number(settings.common.batchMaxChars) || DEFAULT_BATCH_MAX_CHARS;
      const maxItems = isSingleDispatch
        ? 1
        : Number(settings.common.batchMaxItems) || DEFAULT_BATCH_MAX_ITEMS;

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

          const result = await this.translateBatch(batchTexts, target, source, provider);

          if (!result?.success) {
            throw new Error(result?.error || getMessage('errorTranslationFailed'));
          }

          const translations = result.translations;

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

      const result = await this.translateBatch([text], target, source, provider);

      if (!result.success) {
        throw new Error(result.error);
      }

      const translated = result.translations[0];

      // 翻訳結果が存在する場合は返す（条件判定でのみtrim()を使用し、実際の値は
      // 空白や改行を維持するためtrim()しない）
      if (translated != null && translated.trim() !== '') {
        return translated;
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
   * Ask the background worker which provider/model/dispatch will be used, so we
   * can size batches before translating. Returns null on any failure; callers
   * then fall back to block-mode batching.
   */
  private async getTranslationPlan(
    providerName: string | null
  ): Promise<TranslationPlanMessageResponse | null> {
    try {
      return (await browser.runtime.sendMessage({
        action: 'getTranslationPlan',
        data: { providerName }
      })) as TranslationPlanMessageResponse;
    } catch (error) {
      console.warn('[Translator] Failed to resolve translation plan, assuming block mode', error);
      return null;
    }
  }

  /**
   * Translate a batch of texts via the background script.
   * The background worker delegates to the provider/prompt-profile layer and
   * returns one translation per input text, in order.
   */
  private async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage: string,
    providerName: string | null
  ): Promise<TranslateMessageResponse> {
    return browser.runtime.sendMessage({
      action: 'translate',
      data: {
        texts,
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
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
