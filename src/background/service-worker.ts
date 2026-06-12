/**
 * Background Service Worker
 * Handles extension lifecycle, context menus, and message passing
 */
import browser from 'webextension-polyfill';
import type { Menus, Runtime, Tabs } from 'webextension-polyfill';
import { createProvider } from '../providers';
import { getSettings, addToHistory } from '../utils/storage';
import { getMessage } from '../utils/i18n';
import { resolveProfile, resolveDispatch } from '../prompts';
import type { DispatchMode } from '../prompts';
import type { ProviderSettings } from '../types/settings';
import { BaseProvider } from '../providers/base-provider';

type TranslatePayload = {
  texts: string[];
  targetLanguage?: string;
  sourceLanguage?: string;
  providerName?: string | null;
  // When present, ties this batch to a translation job started via
  // 'begin-translation'. The job owns the settings snapshot and the
  // AbortController, so the batch is translated with the configuration captured
  // when the job started (immune to later settings changes) and can be aborted.
  jobId?: string | null;
};

type BeginTranslationPayload = {
  jobId: string;
  providerName?: string | null;
  targetLanguage?: string;
  sourceLanguage?: string;
};

type CancelTranslationPayload = {
  jobId: string;
};

type EndTranslationPayload = {
  jobId: string;
};

type ProviderRequestPayload = {
  providerName: string;
  config?: ProviderSettings;
};

type TranslationPlanPayload = {
  providerName?: string | null;
};

type BackgroundRequest =
  | { action: 'translate'; data: TranslatePayload }
  | { action: 'begin-translation'; data: BeginTranslationPayload }
  | { action: 'cancel-translation'; data: CancelTranslationPayload }
  | { action: 'end-translation'; data: EndTranslationPayload }
  | { action: 'getTranslationPlan'; data?: TranslationPlanPayload }
  | { action: 'getSettings' }
  | { action: 'testProvider'; data: ProviderRequestPayload }
  | { action: 'getModels'; data: ProviderRequestPayload }
  | { action: 'setLastUsedProvider'; data?: { provider?: string | null } }
  | { action: 'getLastUsedProvider' }
  | {
      action: 'translate-selection-inline';
      data: {
        tabId: number;
        text: string;
        language?: string;
        provider?: string;
        sourceLanguage?: string;
      };
    }
  | { action: string; data?: unknown };

type TranslateResponse =
  | { success: true; translations: string[]; provider: string }
  | { success: false; error: string };

type TranslationPlanResponse =
  | { success: true; provider: string; model: string | null; dispatch: DispatchMode }
  | { success: false; error: string };

type ProviderResponse = { success: true } | { success: false; error: string };

type BeginTranslationResponse =
  | { success: true; provider: string; model: string | null; dispatch: DispatchMode }
  | { success: false; error: string };

type SimpleSuccessResponse = { success: true };

/**
 * A page-translation job. Created by 'begin-translation' and torn down by
 * 'end-translation', a cancel, or tab close / navigation.
 *
 * The job captures a SETTINGS SNAPSHOT at start time: the resolved provider name
 * plus a deep clone of its config and the source/target languages. Every batch
 * for this job is translated from the snapshot, so changing the model or any
 * other setting mid-translation does NOT leak into a job that is already running
 * — the page finishes with the configuration it started with.
 *
 * The job also owns an AbortController. Aborting it cancels the request that is
 * currently in flight (the SDKs receive the signal) and makes any subsequent
 * batch reject immediately.
 */
type TranslationJob = {
  jobId: string;
  tabId: number | undefined;
  controller: AbortController;
  provider: string;
  providerConfig: ProviderSettings;
  targetLanguage: string;
  sourceLanguage: string;
};

// Active page-translation jobs, keyed by jobId.
const translationJobs = new Map<string, TranslationJob>();

function deepCloneConfig(config: ProviderSettings): ProviderSettings {
  return JSON.parse(JSON.stringify(config)) as ProviderSettings;
}

/**
 * Abort and remove a job. Safe to call with an unknown jobId.
 */
function disposeJob(jobId: string, reason: string): void {
  const job = translationJobs.get(jobId);
  if (!job) {
    return;
  }
  translationJobs.delete(jobId);
  if (!job.controller.signal.aborted) {
    job.controller.abort(new DOMException(reason, 'AbortError'));
  }
}

/**
 * Abort every job that belongs to a tab (used on tab close / navigation).
 */
function disposeJobsForTab(tabId: number, reason: string): void {
  for (const [jobId, job] of translationJobs) {
    if (job.tabId === tabId) {
      disposeJob(jobId, reason);
    }
  }
}

type ModelsResponse =
  | { success: true; models: string[] }
  | { success: false; error: string; models: string[] };

// Cache for last used provider (for performance)
let lastUsedProviderCache: string | null = null;
// Ensure we only log the session storage fallback once to avoid noisy console output
let sessionStorageWarningLogged = false;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

/**
 * Get last used provider from storage
 * Works in both Chrome and Firefox
 */
async function getLastUsedProvider(): Promise<string | null> {
  if (lastUsedProviderCache !== null) {
    return lastUsedProviderCache;
  }

  try {
    // Try session storage first (Firefox 109+, Chrome)
    if (browser.storage?.session) {
      const result = await browser.storage.session.get('lastUsedProvider');
      lastUsedProviderCache = (result.lastUsedProvider as string | undefined) || null;
      return lastUsedProviderCache;
    }
  } catch (error) {
    if (!sessionStorageWarningLogged) {
      console.warn('[Service Worker] Session storage not available, using local storage', error);
      sessionStorageWarningLogged = true;
    }
  }

  // Fallback to local storage (persists until browser restart)
  try {
    const result = await browser.storage.local.get('lastUsedProvider');
    const stored = result?.lastUsedProvider;
    lastUsedProviderCache = typeof stored === 'string' ? stored : null;
    return lastUsedProviderCache;
  } catch (error) {
    console.warn('[Service Worker] Failed to get last used provider', error);
    return null;
  }
}

/**
 * Set last used provider to storage
 * Works in both Chrome and Firefox
 */
async function setLastUsedProvider(provider: string | null): Promise<void> {
  lastUsedProviderCache = provider;

  try {
    // Try session storage first (Firefox 109+, Chrome)
    if (browser.storage?.session) {
      await browser.storage.session.set({ lastUsedProvider: provider ?? null });
      return;
    }
  } catch (error) {
    if (!sessionStorageWarningLogged) {
      console.warn('[Service Worker] Session storage not available, using local storage', error);
      sessionStorageWarningLogged = true;
    }
  }

  // Fallback to local storage (persists until browser restart)
  try {
    await browser.storage.local.set({ lastUsedProvider: provider });
  } catch (error) {
    console.warn('[Service Worker] Failed to set last used provider', error);
  }
}

/**
 * Initialize extension
 */
browser.runtime.onInstalled.addListener(async (details) => {
  console.info('[Multi AI Translator] Extension installed', details);

  // Create context menus
  await createContextMenus();

  // Set default settings on first install
  if (details.reason === 'install') {
    console.info('[Multi AI Translator] First install, setting default settings');
  }
});

// Re-create context menus on browser startup. `onInstalled` only fires on
// install/update/reload, so without this listener the menus disappear after
// a browser restart (Chrome MV3 service workers are torn down between sessions).
if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(async () => {
    console.info('[Multi AI Translator] Browser startup — re-creating context menus');
    await createContextMenus();
  });
}

// Cancel any translation running in a tab when that tab is closed: the content
// script (and its progress UI) is gone, so there is no reason to keep calling
// the provider. Without this the background worker would happily finish every
// already-dispatched batch for a tab the user has closed.
if (browser.tabs?.onRemoved) {
  browser.tabs.onRemoved.addListener((tabId) => {
    disposeJobsForTab(tabId, 'Tab closed');
  });
}

// Cancel on navigation / (hard) refresh. When a tab starts loading a new
// document the old page — and any translation targeting it — no longer exists.
// 'loading' fires for reloads and in-page navigations alike; the freshly loaded
// page will start its own job with a new jobId, so dropping the old one is safe.
if (browser.tabs?.onUpdated) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      disposeJobsForTab(tabId, 'Page navigated or reloaded');
    }
  });
}

/**
 * Create context menus
 */
async function createContextMenus(): Promise<void> {
  try {
    await browser.contextMenus.removeAll();
  } catch (error) {
    console.warn(
      '[Multi AI Translator] Failed to clear context menus before creating new ones',
      error
    );
  }

  const menuItems: Array<{ id: string; title: string; contexts: Menus.ContextType[] }> = [
    {
      id: 'translate-selection-inline',
      title: getMessage('contextMenuTranslateSelection'),
      contexts: ['selection']
    },
    {
      // Only shown when nothing is selected. Together with the selection
      // menu above, this guarantees exactly one extension menu item is ever
      // visible at a time, which prevents Chrome / Firefox from collapsing
      // the items into an "extension name" submenu.
      id: 'translate-page',
      title: getMessage('contextMenuTranslatePage'),
      contexts: ['page']
    }
  ];

  for (const item of menuItems) {
    try {
      await browser.contextMenus.create(item);
    } catch (error) {
      console.error('[Multi AI Translator] Failed to create context menu', item.id, error);
    }
  }
}

/**
 * Handle context menu clicks
 */
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'translate-selection-inline') {
      await handleTranslateSelectionInline(info, tab);
    } else if (info.menuItemId === 'translate-page') {
      await handleTranslatePageContextMenu(tab);
    }
  } catch (error) {
    console.error('[Multi AI Translator] Context menu error:', error);
    showNotification('Error', getErrorMessage(error));
  }
});

/**
 * Handle messages from content scripts and popup
 */
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request as BackgroundRequest, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Multi AI Translator] Message error:', error);
      sendResponse({ error: getErrorMessage(error) });
    });

  return true; // Keep message channel open for async response
});

/**
 * Handle message routing
 */
async function handleMessage(
  request: BackgroundRequest,
  sender?: Runtime.MessageSender
): Promise<unknown> {
  const { action } = request;
  const data = (request as { data?: unknown }).data;
  const senderTabId = sender?.tab?.id;

  switch (action) {
    case 'begin-translation':
      return await beginTranslation((data || {}) as BeginTranslationPayload, senderTabId);
    case 'cancel-translation':
      return cancelTranslation((data || {}) as CancelTranslationPayload);
    case 'end-translation':
      return endTranslation((data || {}) as EndTranslationPayload);
    case 'translate':
      return await translateText((data || {}) as TranslatePayload);
    case 'getTranslationPlan':
      return await getTranslationPlan((data || {}) as TranslationPlanPayload);
    case 'getSettings':
      return await getSettings();
    case 'testProvider':
      return await testProvider((data || {}) as ProviderRequestPayload);
    case 'getModels':
      return await getProviderModels((data || {}) as ProviderRequestPayload);
    case 'setLastUsedProvider':
      await setLastUsedProvider((data as { provider?: string | null })?.provider ?? null);
      return { success: true };
    case 'getLastUsedProvider':
      return { provider: await getLastUsedProvider() };
    case 'translate-selection-inline':
      await forwardSelectionTranslation(
        (data || {}) as {
          tabId?: number;
          text?: string;
          language?: string;
          provider?: string;
          sourceLanguage?: string;
        }
      );
      return { success: true };
    default:
      throw new Error(getMessage('errorUnknownAction', [action]));
  }
}

/**
 * Begin a page-translation job: resolve the provider, capture a settings
 * snapshot, and register an AbortController. Subsequent 'translate' batches that
 * carry this jobId are translated from the snapshot and can be aborted.
 *
 * Returns the resolved provider / model / dispatch so the translator can size
 * its batches without a separate getTranslationPlan round-trip.
 */
async function beginTranslation(
  { jobId, providerName, targetLanguage, sourceLanguage }: BeginTranslationPayload,
  tabId: number | undefined
): Promise<BeginTranslationResponse> {
  try {
    if (!jobId) {
      throw new Error('jobId is required');
    }

    // If a job with this id somehow already exists (e.g. a stale one), replace
    // it so we never leak an old controller.
    disposeJob(jobId, 'Replaced by a new translation job');

    const settings = await getSettings();
    const lastUsed = await getLastUsedProvider();
    const requested = providerName || lastUsed || null;
    const provider = resolveEnabledProvider(settings, requested);

    if (!provider) {
      throw new Error(getMessage('errorNoEnabledProviders'));
    }

    const providerConfig = settings.providers[provider];
    if (!providerConfig) {
      throw new Error(getMessage('errorProviderNotEnabled', [provider]));
    }

    await setLastUsedProvider(provider);

    const job: TranslationJob = {
      jobId,
      tabId,
      controller: new AbortController(),
      provider,
      // Deep clone so later edits to stored settings cannot mutate this snapshot.
      providerConfig: deepCloneConfig(providerConfig),
      targetLanguage: targetLanguage || settings.common.defaultTargetLanguage,
      sourceLanguage: sourceLanguage || settings.common.defaultSourceLanguage || 'auto'
    };
    translationJobs.set(jobId, job);

    const model = providerConfig.model ?? null;
    const profile = resolveProfile(model ?? undefined);
    const dispatch = resolveDispatch(profile, model ?? undefined);

    return { success: true, provider, model, dispatch };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Cancel a running job (explicit user cancel / restore / re-translate). Aborts
 * the in-flight request and drops the job.
 */
function cancelTranslation({ jobId }: CancelTranslationPayload): SimpleSuccessResponse {
  if (jobId) {
    disposeJob(jobId, 'Translation cancelled by user');
  }
  return { success: true };
}

/**
 * End a job after its last batch. Just removes bookkeeping; nothing to abort.
 */
function endTranslation({ jobId }: EndTranslationPayload): SimpleSuccessResponse {
  if (jobId) {
    translationJobs.delete(jobId);
  }
  return { success: true };
}

/**
 * Translate one batch of texts.
 *
 * Two modes:
 *   - Job batch (jobId present and registered): use the job's settings SNAPSHOT
 *     and AbortController. This is what page translation uses, so the whole page
 *     finishes with the settings it started with and can be cancelled mid-call.
 *   - Ad-hoc (no/unknown jobId): resolve settings live and run without a signal.
 *     Used by selection translation and as a defensive fallback.
 */
async function translateText({
  texts,
  targetLanguage,
  sourceLanguage,
  providerName,
  jobId
}: TranslatePayload): Promise<TranslateResponse> {
  try {
    if (!texts || texts.length === 0) {
      throw new Error(getMessage('errorNoTranslatableText'));
    }

    const job = jobId ? translationJobs.get(jobId) : undefined;

    // If the caller supplied a jobId but the job is already gone (cancelled or
    // ended), do not silently translate anyway — that would be the very
    // "pretend to cancel but keep calling the API" behaviour we are fixing.
    if (jobId && !job) {
      throw new DOMException('Translation was cancelled', 'AbortError');
    }

    let provider: string;
    let providerConfig: ProviderSettings;
    let resolvedTarget: string;
    let resolvedSource: string;
    let signal: AbortSignal | undefined;

    if (job) {
      // Job batch: use the frozen snapshot, ignore any live settings changes.
      job.controller.signal.throwIfAborted();
      provider = job.provider;
      providerConfig = job.providerConfig;
      resolvedTarget = targetLanguage || job.targetLanguage;
      resolvedSource = sourceLanguage || job.sourceLanguage;
      signal = job.controller.signal;
    } else {
      // Ad-hoc batch: resolve from current settings.
      const settings = await getSettings();
      const lastUsed = await getLastUsedProvider();
      // Provider selection rule:
      //   1. If the caller passed an explicit, enabled provider → use it
      //   2. Otherwise if lastUsedProvider is enabled → use it
      //   3. Otherwise → first enabled provider
      const requested = providerName || lastUsed || null;
      const resolved = resolveEnabledProvider(settings, requested);

      if (!resolved) {
        throw new Error(getMessage('errorNoEnabledProviders'));
      }
      await setLastUsedProvider(resolved);

      const cfg = settings.providers[resolved];
      if (!cfg) {
        throw new Error(getMessage('errorProviderNotEnabled', [resolved]));
      }
      provider = resolved;
      providerConfig = cfg;
      resolvedTarget = targetLanguage || settings.common.defaultTargetLanguage;
      resolvedSource = sourceLanguage || 'auto';
      signal = undefined;
    }

    // Create and initialize provider
    const providerInstance = createProvider(provider, providerConfig) as BaseProvider;
    const translations = await providerInstance.translate(
      texts,
      resolvedTarget,
      resolvedSource,
      signal
    );

    // Add to history (record the first item as a representative entry)
    await addToHistory({
      original: (texts[0] ?? '').substring(0, 100),
      translated: (translations[0] ?? '').substring(0, 100),
      provider,
      targetLanguage: resolvedTarget || null,
      sourceLanguage: resolvedSource || null
    });

    return {
      success: true,
      translations,
      provider
    };
  } catch (error) {
    if (BaseProvider.isAbortError(error)) {
      // Cancellation is an expected outcome, not a failure. Report it as such so
      // the translator can show "cancelled" rather than an error.
      return {
        success: false,
        error: getMessage('statusCancelled')
      };
    }
    console.error('[Multi AI Translator] Translation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Resolve the translation plan (effective provider, model, and dispatch mode)
 * for the page translator WITHOUT performing a translation or mutating state.
 *
 * The translator needs the dispatch mode up front so it can size its batches
 * correctly: in 'single' mode each text is sent in its own request, so the
 * translator builds one-text batches to keep progress accurate. Provider/model
 * resolution mirrors translateText so the plan matches what translateText will
 * actually use (minus the lastUsedProvider write, which only happens on a real
 * translation).
 */
async function getTranslationPlan({
  providerName
}: TranslationPlanPayload): Promise<TranslationPlanResponse> {
  try {
    const settings = await getSettings();
    const lastUsed = await getLastUsedProvider();
    const requested = providerName || lastUsed || null;
    const provider = resolveEnabledProvider(settings, requested);

    if (!provider) {
      throw new Error(getMessage('errorNoEnabledProviders'));
    }

    const model = settings.providers[provider]?.model ?? null;
    const profile = resolveProfile(model ?? undefined);
    const dispatch = resolveDispatch(profile, model ?? undefined);

    return { success: true, provider, model, dispatch };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Test provider connection
 */
async function testProvider({
  providerName,
  config
}: ProviderRequestPayload): Promise<ProviderResponse> {
  try {
    const providerInstance = createProvider(providerName, config) as BaseProvider;

    // Try to get models as connection test
    await providerInstance.getModels();

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get available models for provider
 */
async function getProviderModels({
  providerName,
  config
}: ProviderRequestPayload): Promise<ModelsResponse> {
  try {
    const providerInstance = createProvider(providerName, config) as BaseProvider;
    const models = await providerInstance.getModels();

    return {
      success: true,
      models
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      models: []
    };
  }
}

async function handleTranslateSelectionInline(info: Menus.OnClickData, tab?: Tabs.Tab) {
  const targetTab = await resolveContentTab(tab);
  if (!targetTab?.id) {
    showNotification('Error', getMessage('errorNoActiveTab'));
    return;
  }

  // Get selection text with logical breaks from content script (same as popup)
  let selectionText: string;
  try {
    const response = await sendMessageToTab(targetTab.id, {
      action: 'get-selection-text'
    });
    selectionText = (response as { text?: string })?.text || '';
  } catch (error) {
    console.error('[Service Worker] Failed to get selection text:', error);
    // Fallback to info.selectionText if content script fails
    selectionText = info?.selectionText || '';
  }

  if (!selectionText?.trim()) {
    showNotification('Error', getMessage('errorNoSelectionText'));
    return;
  }

  const settings = await getSettings();
  const lastUsed = await getLastUsedProvider();
  const provider = resolveEnabledProvider(settings, lastUsed);
  if (!provider) {
    showNotification('Error', getMessage('errorNoEnabledProviders'));
    return;
  }
  const sourceLanguage = settings.common.defaultSourceLanguage || 'auto';
  const targetLanguage = settings.common.defaultTargetLanguage;

  await forwardSelectionTranslation({
    tabId: targetTab.id,
    text: selectionText,
    provider,
    language: targetLanguage,
    sourceLanguage
  });
}

/**
 * Context menu: Translate the current page using the last used / first
 * enabled provider. If no provider is enabled, notify the user and open
 * the options page so they can configure one.
 */
async function handleTranslatePageContextMenu(tab?: Tabs.Tab) {
  const targetTab = await resolveContentTab(tab);
  if (!targetTab?.id) {
    showNotification('Error', getMessage('errorNoActiveTab'));
    return;
  }

  const settings = await getSettings();
  const lastUsed = await getLastUsedProvider();
  const provider = resolveEnabledProvider(settings, lastUsed);

  if (!provider) {
    // No enabled provider — tell the user and open the options page so
    // they can pick one before retrying.
    showNotification(getMessage('extensionName'), getMessage('notificationOpeningSettings'));
    await browser.runtime.openOptionsPage();
    return;
  }

  // Persist the resolved provider so the popup / future invocations agree
  // on the same selection.
  await setLastUsedProvider(provider);

  const sourceLanguage = settings.common.defaultSourceLanguage || 'auto';
  const targetLanguage = settings.common.defaultTargetLanguage;

  await sendMessageToTab(targetTab.id, {
    action: 'translate-page',
    provider,
    language: targetLanguage,
    sourceLanguage
  });
}

async function forwardSelectionTranslation({
  tabId,
  text,
  language,
  provider,
  sourceLanguage
}: {
  tabId?: number;
  text?: string;
  language?: string;
  provider?: string;
  sourceLanguage?: string;
}): Promise<void> {
  if (!tabId) {
    throw new Error(getMessage('errorNoActiveTab'));
  }
  if (!text?.trim()) {
    throw new Error(getMessage('errorNoSelectionText'));
  }

  const settings = await getSettings();
  const resolvedProvider =
    provider && settings.providers?.[provider]?.enabled
      ? provider
      : resolveEnabledProvider(settings, await getLastUsedProvider());

  if (!resolvedProvider) {
    throw new Error(getMessage('errorNoEnabledProviders'));
  }

  await sendMessageToTab(tabId, {
    action: 'translate-selection-inline',
    text,
    language,
    provider: resolvedProvider,
    sourceLanguage
  });
}

function resolveEnabledProvider(
  settings: Awaited<ReturnType<typeof getSettings>>,
  preferred?: string | null
): string | null {
  if (preferred && settings.providers?.[preferred]?.enabled) {
    return preferred;
  }
  const entries = Object.entries(settings.providers || {});
  const enabledEntry = entries.find(([, cfg]) => cfg?.enabled);
  return enabledEntry ? enabledEntry[0] : null;
}

/**
 * Show notification
 */
function showNotification(title: string, message: string): void {
  browser.notifications.create({
    type: 'basic',
    iconUrl: '../icons/icon-128.png',
    title: title,
    message: message
  });
}

async function sendMessageToTab(
  tabId: number | undefined,
  message: Record<string, unknown>
): Promise<unknown> {
  if (!tabId) {
    throw new Error(getMessage('errorNoActiveTab'));
  }

  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (isMissingContentScriptError(error)) {
      await injectContentScript(tabId);
      return await browser.tabs.sendMessage(tabId, message);
    }
    throw error;
  }
}

function isMissingContentScriptError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (!message) return false;
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

function isAccessDeniedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (!message) return false;
  return (
    message.includes('Cannot access contents of the page') ||
    message.includes('Cannot access contents of url') ||
    message.includes('Extensions manifest must request permission') ||
    message.includes('No tab with id') ||
    message.includes('Frame with ID') ||
    message.includes('blocked by the administrator')
  );
}

function getContentScriptFiles(): string[] {
  const manifest = browser.runtime.getManifest();
  if (!manifest?.content_scripts) {
    return [];
  }
  const files: string[] = [];
  manifest.content_scripts.forEach((script) => {
    (script.js || []).forEach((file) => files.push(file));
  });
  return files;
}

async function injectContentScript(tabId: number): Promise<void> {
  const files = getContentScriptFiles();
  if (files.length === 0) {
    throw new Error(getMessage('errorScriptPathMissing'));
  }

  try {
    await executeContentScripts(tabId, files);
  } catch (error) {
    console.error('[Service Worker] Failed to inject content script:', error);
    if (isAccessDeniedError(error)) {
      throw new Error(getMessage('errorPageBlocksExtensions'), { cause: error });
    }
    throw new Error(getMessage('errorTranslatorCouldNotLoad'), { cause: error });
  }
}

async function executeContentScripts(tabId: number, files: string[]): Promise<void> {
  if (browser.scripting?.executeScript) {
    await browser.scripting.executeScript({
      target: { tabId },
      files
    });
    return;
  }

  if (browser.tabs?.executeScript) {
    for (const file of files) {
      await browser.tabs.executeScript(tabId, { file });
    }
    return;
  }

  throw new Error(getMessage('errorRuntimeNotSupported'));
}

async function resolveContentTab(tab?: Tabs.Tab | null): Promise<Tabs.Tab | undefined> {
  if (isContentTab(tab)) {
    return tab;
  }

  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs.find((candidate) => isContentTab(candidate));
}

function isContentTab(tab?: Tabs.Tab | null): tab is Tabs.Tab {
  if (!tab?.url) return false;
  return (
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    !tab.url.startsWith('edge://')
  );
}

console.info('[Multi AI Translator] Service worker loaded');
