/**
 * DOM Manager
 * Manages DOM manipulation for translation display
 */

import { ConstVariables } from './const-variables';

type TranslationRecord = {
  text: string;
  provider: string;
  timestamp: number;
};

type StatusType = 'info' | 'success' | 'error';

class PageTranslationState {
  private readonly translations = new Map<string, TranslationRecord>();
  private readonly originalContents = new Map<string, string>();

  storeOriginal(element: HTMLElement, content: string | null): void {
    const id = this.getElementId(element);
    this.originalContents.set(id, content ?? '');
  }

  storeTranslation(element: HTMLElement, translation: string, provider: string): void {
    const id = this.getElementId(element);
    this.translations.set(id, {
      text: translation,
      provider,
      timestamp: Date.now()
    });
  }

  getOriginal(element: Element): string | undefined {
    const id = this.getElementId(element as HTMLElement);
    return this.originalContents.get(id);
  }

  getElementId(element: HTMLElement): string {
    if (!element.dataset.translationId) {
      element.dataset.translationId = `trans_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;
    }
    return element.dataset.translationId;
  }

  clear(): void {
    this.translations.clear();
    this.originalContents.clear();
  }

  getTranslationCount(): number {
    return this.translations.size;
  }
}

const translationState = new PageTranslationState();
let statusOverlay: HTMLDivElement | null = null;
let statusHideTimeout: number | null = null;

type SelectionOverlayElements = {
  container: HTMLDivElement;
  statusBar: HTMLDivElement;
  errorBar: HTMLDivElement;
  originalPanel: HTMLDivElement;
  translationPanel: HTMLDivElement;
  originalContent: HTMLPreElement;
  translationContent: HTMLPreElement;
  originalTab: HTMLButtonElement;
  translationTab: HTMLButtonElement;
  expandBtn: HTMLButtonElement;
  collapseBtn: HTMLButtonElement;
  translationReady: boolean;
  isExpanded: boolean;
};

let selectionOverlay: SelectionOverlayElements | null = null;
const selectionOverlayStyleId = 'multi-ai-selection-overlay-style';

export function getTranslatableNodes(
  rootElement: Element | Document = document.body ?? document
): Text[] {
  const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node): number => {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      const tagName = parent.tagName.toLowerCase();
      if (['script', 'style', 'noscript', 'iframe', 'object', 'code'].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      const text = (node.textContent || '').trim();
      if (!text || text.length < 3) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes: Text[] = [];
  let currentNode: Node | null;
  while ((currentNode = walker.nextNode())) {
    nodes.push(currentNode as Text);
  }

  return nodes;
}

export function replaceNodeContent(node: Text, translation: string, provider: string | null): void {
  const parent = node.parentElement;
  if (!parent || parent.closest('code, pre, kbd, samp')) {
    return;
  }

  const providerLabel = provider ?? '';
  const element = parent as HTMLElement;
  translationState.storeOriginal(element, node.textContent);
  node.textContent = translation;
  translationState.storeTranslation(element, translation, providerLabel);

  if (!element.classList.contains('translated')) {
    element.classList.add('translated');
    element.dataset.translatedBy = providerLabel;
  }
}

export function restoreOriginalContent(
  rootElement: Element | Document = document.body ?? document
): void {
  const translatedElements = rootElement.querySelectorAll<HTMLElement>('[data-translation-id]');

  translatedElements.forEach((element) => {
    const original = translationState.getOriginal(element);
    if (!original) {
      return;
    }

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode() as Text | null;
    if (node) {
      node.textContent = original;
    }

    element.classList.remove('translated');
    delete element.dataset.translatedBy;
    delete element.dataset.translationId;
  });

  translationState.clear();
}

export function showLoadingIndicator(element: Element): void {
  element.classList.add('translation-loading');
}

export function hideLoadingIndicator(element: Element): void {
  element.classList.remove('translation-loading');
}

export function clearAllLoadingIndicators(): void {
  const loadingElements = document.querySelectorAll<HTMLElement>('.translation-loading');
  loadingElements.forEach((el) => el.classList.remove('translation-loading'));
}

export function updateTranslationStatus(message: string, type: StatusType = 'info'): void {
  if (!statusOverlay) {
    statusOverlay = document.createElement('div');
    statusOverlay.id = 'multi-ai-translation-status';
    Object.assign(statusOverlay.style, {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      zIndex: '2147483647',
      maxWidth: '320px',
      padding: '12px 16px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      lineHeight: '1.4'
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(statusOverlay);
  }

  if (statusHideTimeout) {
    clearTimeout(statusHideTimeout);
    statusHideTimeout = null;
  }

  const colors: Record<StatusType, { bg: string; text: string }> = {
    info: { bg: '#1e40af', text: '#fff' },
    success: { bg: '#15803d', text: '#fff' },
    error: { bg: '#b91c1c', text: '#fff' }
  };

  const palette = colors[type];
  statusOverlay.style.background = palette.bg;
  statusOverlay.style.color = palette.text;
  statusOverlay.textContent = message;
}

export function clearTranslationStatus(delay = 0): void {
  if (!statusOverlay) {
    return;
  }

  if (statusHideTimeout) {
    clearTimeout(statusHideTimeout);
    statusHideTimeout = null;
  }

  if (delay > 0) {
    statusHideTimeout = window.setTimeout(() => {
      statusOverlay?.remove();
      statusOverlay = null;
      statusHideTimeout = null;
    }, delay);
  } else {
    statusOverlay.remove();
    statusOverlay = null;
  }
}

type SelectionOverlayMeta = {
  original: string;
  provider: string;
  targetLanguage: string;
  sourceLanguage: string;
  title: string;
  labels: {
    source: string;
    target: string;
    provider: string;
    original: string;
    result: string;
  };
  statusPreparing: string;
};

function ensureSelectionOverlayStyles(): void {
  if (document.getElementById(selectionOverlayStyleId)) {
    return;
  }
  const style = document.createElement('style');
  style.id = selectionOverlayStyleId;
  style.textContent = `
    #multi-ai-selection-overlay {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: 380px;
      max-height: calc(100vh - 32px);
      background: #ffffff;
      color: #1a202c;
      border-radius: 12px;
      box-shadow: 0 20px 45px rgba(15, 23, 42, 0.25);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483647;
    }
    #multi-ai-selection-overlay.dark {
      background: #1f2933;
      color: #f7fafc;
    }
    #multi-ai-selection-overlay header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(226, 232, 240, 1);
    }
    #multi-ai-selection-overlay.dark header {
      border-bottom-color: rgba(74, 85, 104, 0.6);
    }
    #multi-ai-selection-overlay .overlay-body {
      padding: 16px;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    #multi-ai-selection-overlay .meta {
      font-size: 12px;
      color: #475569;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
    }
    #multi-ai-selection-overlay.dark .meta {
      color: #cbd5f5;
    }
    #multi-ai-selection-overlay .overlay-tabs {
      display: flex;
      gap: 6px;
    }
    #multi-ai-selection-overlay .overlay-tab {
      flex: 1;
      border: 1px solid rgba(148, 163, 184, 0.6);
      background: transparent;
      color: inherit;
      border-radius: 8px;
      padding: 4px 0;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: background 0.2s, color 0.2s, border-color 0.2s;
    }
    #multi-ai-selection-overlay .overlay-tab.active {
      background: rgba(79, 70, 229, 0.12);
      border-color: rgba(99, 102, 241, 0.6);
    }
    #multi-ai-selection-overlay .overlay-tab:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #multi-ai-selection-overlay .overlay-panels {
      flex: 1;
    }
    #multi-ai-selection-overlay .overlay-panel {
      max-height: 45vh;
      overflow-y: auto;
      padding-right: 8px;
    }
    #multi-ai-selection-overlay h3 {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: #4a5568;
    }
    #multi-ai-selection-overlay.dark h3 {
      color: #cbd5f5;
    }
    #multi-ai-selection-overlay pre {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 15px;
      line-height: 1.6;
      background: transparent;
      padding: 0;
      margin: 0;
      color: inherit;
    }
    #multi-ai-selection-overlay .status,
    #multi-ai-selection-overlay .error {
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    #multi-ai-selection-overlay .status {
      background: #ebf4ff;
      color: #1e429f;
      border: 1px solid #c3dafe;
    }
    #multi-ai-selection-overlay.dark .status {
      background: rgba(79, 209, 197, 0.15);
      color: #bee3f8;
      border-color: rgba(79, 209, 197, 0.3);
    }
    #multi-ai-selection-overlay .error {
      background: #fed7d7;
      color: #742a2a;
      border: 1px solid #feb2b2;
    }
    #multi-ai-selection-overlay.dark .error {
      background: rgba(252, 129, 129, 0.2);
      color: #fed7d7;
      border-color: rgba(252, 129, 129, 0.4);
    }
    #multi-ai-selection-overlay button.close-btn,
    #multi-ai-selection-overlay button.expand-btn,
    #multi-ai-selection-overlay button.collapse-btn {
      border: none;
      background: transparent;
      color: inherit;
      font-size: 18px;
      cursor: pointer;
      line-height: 1;
      padding: 4px 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
      min-width: 24px;
      min-height: 24px;
    }
    #multi-ai-selection-overlay button.close-btn:hover,
    #multi-ai-selection-overlay button.expand-btn:hover,
    #multi-ai-selection-overlay button.collapse-btn:hover {
      opacity: 0.7;
    }
    #multi-ai-selection-overlay.expanded {
      width: 90vw;
      max-width: 1200px;
      height: 90vh;
      max-height: 90vh;
      right: 5vw;
      bottom: 5vh;
    }
    #multi-ai-selection-overlay.expanded .overlay-panel {
      max-height: calc(90vh - 200px);
    }
    #multi-ai-selection-overlay .header-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }
  `;
  document.head.appendChild(style);
}

export function showSelectionOverlay(meta: SelectionOverlayMeta, onClose: () => void): void {
  ensureSelectionOverlayStyles();

  if (selectionOverlay) {
    selectionOverlay.container.remove();
    selectionOverlay = null;
  }

  const container = document.createElement('div');
  container.id = 'multi-ai-selection-overlay';
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    container.classList.add('dark');
  }

  const header = document.createElement('header');
  const title = document.createElement('span');
  title.textContent = meta.title;

  const headerControls = document.createElement('div');
  headerControls.className = 'header-controls';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'expand-btn';
  expandBtn.textContent = '↖';
  expandBtn.setAttribute('aria-label', 'Expand');
  expandBtn.title = 'Expand';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'collapse-btn';
  collapseBtn.textContent = '↘';
  collapseBtn.setAttribute('aria-label', 'Collapse');
  collapseBtn.title = 'Collapse';
  collapseBtn.style.display = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.title = 'Close';
  closeBtn.onclick = () => {
    hideSelectionOverlay();
    onClose();
  };

  expandBtn.onclick = () => {
    if (selectionOverlay) {
      selectionOverlay.container.classList.add('expanded');
      selectionOverlay.isExpanded = true;
      expandBtn.style.display = 'none';
      collapseBtn.style.display = 'flex';
    }
  };

  collapseBtn.onclick = () => {
    if (selectionOverlay) {
      selectionOverlay.container.classList.remove('expanded');
      selectionOverlay.isExpanded = false;
      expandBtn.style.display = 'flex';
      collapseBtn.style.display = 'none';
    }
  };

  headerControls.appendChild(expandBtn);
  headerControls.appendChild(collapseBtn);
  headerControls.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(headerControls);

  const body = document.createElement('div');
  body.className = 'overlay-body';

  const metaSection = document.createElement('div');
  metaSection.className = 'meta';

  metaSection.textContent = `${meta.labels.source}: ${meta.sourceLanguage || 'auto'} / ${
    meta.labels.target
  }: ${meta.targetLanguage || ''} / ${meta.labels.provider}: ${ConstVariables.formatProviderName(
    meta.provider
  )}`;

  const tabs = document.createElement('div');
  tabs.className = 'overlay-tabs';
  const originalTab = document.createElement('button');
  originalTab.className = 'overlay-tab active';
  originalTab.textContent = meta.labels.original;
  const translationTab = document.createElement('button');
  translationTab.className = 'overlay-tab';
  translationTab.textContent = meta.labels.result;
  translationTab.disabled = true;
  tabs.appendChild(originalTab);
  tabs.appendChild(translationTab);

  const panelsWrapper = document.createElement('div');
  panelsWrapper.className = 'overlay-panels';

  const originalPanel = document.createElement('div');
  originalPanel.className = 'overlay-panel';
  const originalHeading = document.createElement('h3');
  originalHeading.textContent = meta.labels.original;
  const originalPre = document.createElement('pre');
  originalPre.textContent = meta.original;
  originalPanel.appendChild(originalHeading);
  originalPanel.appendChild(originalPre);

  const translationPanel = document.createElement('div');
  translationPanel.className = 'overlay-panel';
  translationPanel.hidden = true;
  const translationHeading = document.createElement('h3');
  translationHeading.textContent = meta.labels.result;
  const translationPre = document.createElement('pre');
  translationPre.textContent = '';
  translationPanel.appendChild(translationHeading);
  translationPanel.appendChild(translationPre);

  panelsWrapper.appendChild(originalPanel);
  panelsWrapper.appendChild(translationPanel);

  const statusBar = document.createElement('div');
  statusBar.className = 'status';
  statusBar.textContent = meta.statusPreparing;

  const errorBar = document.createElement('div');
  errorBar.className = 'error';
  errorBar.hidden = true;

  body.appendChild(metaSection);
  body.appendChild(statusBar);
  body.appendChild(tabs);
  body.appendChild(panelsWrapper);
  body.appendChild(errorBar);

  container.appendChild(header);
  container.appendChild(body);
  document.body.appendChild(container);

  selectionOverlay = {
    container,
    statusBar,
    errorBar,
    originalPanel,
    translationPanel,
    originalContent: originalPre,
    translationContent: translationPre,
    originalTab,
    translationTab,
    expandBtn,
    collapseBtn,
    translationReady: false,
    isExpanded: false
  };

  originalTab.addEventListener('click', () => setSelectionOverlayTab('original'));
  translationTab.addEventListener('click', () => setSelectionOverlayTab('translation'));

  setSelectionOverlayTab('original');
}

export function updateSelectionOverlayStatus(message: string): void {
  if (!selectionOverlay) return;
  selectionOverlay.statusBar.textContent = message;
  selectionOverlay.statusBar.hidden = false;
  selectionOverlay.errorBar.hidden = true;
}

export function showSelectionOverlayResult(text: string): void {
  if (!selectionOverlay) return;
  selectionOverlay.translationContent.textContent = text;
  selectionOverlay.translationReady = true;
  selectionOverlay.translationTab.disabled = false;
  selectionOverlay.statusBar.textContent = '';
  selectionOverlay.statusBar.hidden = true;
  selectionOverlay.errorBar.hidden = true;
  setSelectionOverlayTab('translation');
}

export function showSelectionOverlayError(message: string): void {
  if (!selectionOverlay) return;
  selectionOverlay.translationReady = true;
  selectionOverlay.translationTab.disabled = false;
  selectionOverlay.errorBar.textContent = message;
  selectionOverlay.errorBar.hidden = false;
  selectionOverlay.statusBar.hidden = true;
  setSelectionOverlayTab('translation');
}

export function hideSelectionOverlay(): void {
  selectionOverlay?.container.remove();
  selectionOverlay = null;
}

function setSelectionOverlayTab(target: 'original' | 'translation'): void {
  if (!selectionOverlay) return;
  if (target === 'translation' && !selectionOverlay.translationReady) {
    return;
  }

  const showOriginal = target === 'original';
  selectionOverlay.originalTab.classList.toggle('active', showOriginal);
  selectionOverlay.translationTab.classList.toggle('active', !showOriginal);
  selectionOverlay.originalPanel.hidden = !showOriginal;
  selectionOverlay.translationPanel.hidden = showOriginal;
}

export function isPageTranslated(): boolean {
  return translationState.getTranslationCount() > 0;
}
