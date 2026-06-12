# Architecture Document

## Overview

Multi AI Translator runs as a cross-browser extension: Manifest V3 for Chrome (Chrome / Edge) and Manifest V2 for Firefox. The codebase is shared through TypeScript + Vite and relies on `webextension-polyfill` so that browser-specific APIs are abstracted behind a single surface. The popup and options pages are built with React and Material UI (MUI). This document explains the overall architecture, component structure, and data flow.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Extension                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Popup UI   │  │  Options UI  │  │ Content      │     │
│  │              │  │              │  │ Scripts      │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │             │
│         └─────────────────┼──────────────────┘             │
│                           │                                │
│                  ┌────────▼────────┐                       │
│                  │  Background     │                       │
│                  │ Service Worker  │                       │
│                  └────────┬────────┘                       │
│                           │                                │
│                  ┌────────▼────────┐                       │
│                  │   Providers     │                       │
│                  │      Layer      │                       │
│                  └────────┬────────┘                       │
│                           │                                │
└───────────────────────────┼──────────────────────────────┘
                            │
   ┌──────────┬──────────┬──┴───────┬──────────┬───────────┐
   │          │          │          │          │           │
┌──▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌───▼──────┐
│Gemini│ │Anthropic│ │ OpenAI │ │ Ollama │ │ OpenAI- │ │Anthropic-│
│ API  │ │ (Claude)│ │  API   │ │      │ │compatible│ │compatible│
└──────┘ └─────────┘ └────────┘ └────────┘ └─────────┘ └──────────┘
```

## Component Breakdown

### 1. Background Service Worker

**File**: `src/background/service-worker.ts`

**Role**:
- Central message hub between popup/options/content scripts
- Orchestrates provider interactions and error handling
- Persists lightweight state (last used provider, history)

**Key responsibilities**:
```ts
import browser from 'webextension-polyfill';

browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true; // keep the channel open
});
```

**Characteristics**:
- MV3 service worker on Chrome, MV2 background script (built via esbuild) on Firefox
- Event-driven, spins up on demand

### 2. Content Scripts

**Files**: `src/content/content-script.ts`, `src/content/translator.ts`

**Role**:
- Access the page DOM, extract text nodes, patch translations back in
- Show selection popups and page-level status overlays

**Workflow**:
```ts
const translator = new Translator();
await translator.initialize();

browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  translator
    .handleMessage(request)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
```

**Injection**:
- `matches`: `<all_urls>`
- `run_at`: `document_idle`
- Built as module for Chrome, bundled to IIFE for Firefox

### 3. Popup UI

**Files**: `src/popup/popup.html`, `src/popup/popup.tsx` (React entry), `src/popup/PopupApp.tsx` (React + MUI component)

**Role**:
- Primary user controls (translate page, translate selection, restore, open settings)
- Displays the selected provider, the model configured for that provider, and source/target language state

**Communication**:
```ts
// Page translation is dispatched to the active tab's content script.
await browser.tabs.sendMessage(tabId, {
  action: 'translate-page',
  provider,
  language: targetLanguage,
  sourceLanguage
});
// The last-used provider is persisted via the background worker.
await browser.runtime.sendMessage({
  action: 'setLastUsedProvider',
  data: { provider }
});
```

### 4. Options UI

**Files**: `src/options/options.html`, `src/options/options.tsx` (React entry), `src/options/OptionsApp.tsx` (React + MUI component), `src/options/providerMeta.ts` (per-provider field metadata)

**Role**:
- Manage provider credentials, model selection, batch settings, UI preferences
- Trigger import/export/reset of settings

**Highlights**:
- Fetch available models by sending `getModels` requests to the background worker
- Persists settings through storage utilities

### 5. Providers Layer

**Directory**: `src/providers/`

**Role**:
- Abstract the communication differences across OpenAI, Anthropic, Gemini, Ollama, etc.
- Provide a shared interface (`translate`, `getModels`, `validateConfig`)

**Structure**:
```ts
export abstract class BaseProvider<
  Config extends ProviderSettings = ProviderSettings,
  Client = unknown
> {
  protected readonly config: Config;
  protected name: ProviderName | string;
  protected client: Client | null;

  constructor(config: Config) {
    this.config = config;
    this.name = 'base';
    this.client = null;
  }

  // Subclasses must implement:
  protected abstract initialize(): Promise<void>;
  abstract validateConfig(): boolean;
  abstract translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  abstract getModels(): Promise<string[]>;

  // Shared helpers provided by the base class:
  // ensureInitialized(), withErrorHandling(), createPrompt(),
  // handleError(), splitIntoChunks()
}
```

Registered providers (`src/providers/index.ts` exports a `PROVIDERS` map of
provider name → constructor, consumed by the `createProvider(name, config)`
factory):

- `gemini` → `GeminiProvider`
- `anthropic` → `AnthropicProvider`
- `anthropic-compatible` → `AnthropicCompatibleProvider`
- `openai` → `OpenAIProvider`
- `openai-compatible` → `OpenAICompatibleProvider`
- `ollama` → `OllamaProvider`

### 6. Utils

**Directory**: `src/utils/`

**Modules**:
- `storage.ts`: normalization, default settings, CRUD helpers
```ts
import browser from 'webextension-polyfill';

export async function saveSettings(settings: Settings) {
  await browser.storage.local.set({ settings });
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return normalizeSettings(settings);
}
```
- `i18n.ts`: wrappers around `browser.i18n`
- `prompt-builder.ts`, `dom-manager.ts`, `const-variables.ts`, etc.

## Storage Strategy

### WebExtension Storage API

**Storage Types**:

- `browser.storage.local` — settings, provider configs, translation history
- `browser.storage.session` — the last-used provider (falls back to `storage.local` when the session area is unavailable, e.g. on Firefox MV2)

**Structure (excerpt)** — mirrors the `Settings` type in `src/types/settings.ts`:
```ts
{
  settings: {
    common: {
      defaultSourceLanguage: 'auto',
      defaultTargetLanguage: 'ja',
      uiLanguage: 'ja',
      batchMaxChars: 2000,
      batchMaxItems: 50
    },
    providers: {
      // Keyed by provider name. Fields vary per provider; common ones:
      openai: { enabled: true, apiKey: 'sk-...', model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 4096 },
      anthropic: { enabled: false, apiKey: '', model: '', temperature: 0.3, maxTokens: 4096 },
      ollama: { enabled: false, host: 'http://localhost:11434', model: '', temperature: 0.3 },
      // 'anthropic-compatible' / 'openai-compatible' additionally carry a baseUrl
    },
    ui: {
      theme: 'auto', // 'auto' | 'light' | 'dark'
      fontSize: 14
    }
  },
  // Stored as a separate top-level key (not inside settings):
  lastUsedProvider: 'openai',
  translationHistory: [
    {
      original: 'Hello',
      translated: 'こんにちは',
      provider: 'openai',
      targetLanguage: 'ja',
      sourceLanguage: 'auto',
      timestamp: 1710000000000
    }
  ]
}
```

The popup chooses its provider by reading `lastUsedProvider` (if still enabled) and otherwise falls back to the first enabled provider. We keep only the latest 100 translation history entries and do not cache translations.

## Data Flow

### Page Translation

```
1. User clicks "Translate Page" in Popup
2. Popup sends { action: 'translate-page', provider, language }
3. Background worker resolves settings + provider, injects content script if necessary
4. Content script groups text nodes and streams them back
5. Background batches requests and calls provider.translate(...)
6. Content script receives translations and updates DOM
7. Status overlay reports success / errors
```

### Selection Translation

```
1. User selects text and triggers context menu / popup button
2. Content script extracts selection (or uses provided text)
3. Background worker translates via provider
4. Result is shown in a popup bubble near the selection
```

## Security Considerations

1. **API Keys**
   - Stored exclusively in `browser.storage.local`
   - Never transmitted to any server other than the chosen provider

2. **Network Security**
   - All API calls go through HTTPS (TLS 1.2+)

3. **XSS Mitigation**
   - Content script updates use `textContent`, never `innerHTML`
   - DOM manipulations scoped to allowed nodes

4. **CSP**
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

5. **Permissions**
```json
{
  "permissions": ["storage", "activeTab", "scripting", "contextMenus", "notifications"],
  "host_permissions": ["<all_urls>"]
}
```

   These match `manifest.json` (MV3) and `manifest.firefox.json` (MV2). Keep all three in sync when permissions change.

## Performance Optimizations

1. **Lazy Activation**
   - Service worker wakes only when needed
   - Firefox build bundles background/content as lightweight IIFEs
   - The Firefox esbuild pass (`vite.firefox.config.ts`) runs a `stub-node-builtins` plugin that resolves any `node:*` import to an empty module. Some dependencies (e.g. `@anthropic-ai/sdk`) reference Node builtins such as `node:fs` / `node:path` from code paths that never execute in a browser extension; stubbing them keeps those paths inert so the browser bundle can build.

2. **Batch Translation**
```ts
async function batchTranslate(chunks: string[], provider: BaseProvider) {
  const results: string[] = [];
  const batchSize = 3;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    results.push(...(await Promise.all(batch.map((chunk) => provider.translate(chunk)))));

    if (i + batchSize < chunks.length) {
      await delay(ConstVariables.BATCH_THROTTLE_DELAY_MS);
    }
  }

  return results;
}
```

3. **DOM Updates**
   - Group nodes by parent, display loading indicators, update in-place to minimize reflow

4. **Memory Handling**
   - Drop references after each batch
   - Limit history to 100 entries

## Error Handling

1. **Provider Layer**
   - Distinguish API errors, network errors, credential issues
   - Convert provider-specific messages into user-friendly ones

2. **Background Layer**
```ts
async function handleTranslateRequest(data: TranslatePayload) {
  try {
    const translation = await provider.translate(data.text, data.targetLanguage);
    return { success: true, translation };
  } catch (error) {
    console.error('Translation error:', error);
    return { success: false, error: (error as Error).message };
  }
}
```

3. **UI Layer**
   - Popup displays descriptive errors and allows retry
   - Status overlay reports errors encountered during page translation

## Testing Strategy

- **Unit tests** (where practical) for utilities and provider wrappers
- **Manual / exploratory testing** in Chrome, Edge, and Firefox via the documented workflows
- Future work: add automated E2E harness (e.g., Playwright) for regression checks

## Extensibility

### Adding a New Provider

1. Create `src/providers/your-provider.ts`
```ts
export class YourProvider extends BaseProvider {
  validateConfig() {
    return !!this.config.apiKey;
  }

  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto') {
    // Implementation
  }

  async getModels() {
    // Implementation
  }
}
```
2. Register it inside `src/providers/index.ts`
```ts
import { YourProvider } from './your-provider';

export const PROVIDERS: Record<string, ProviderConstructor> = {
  gemini: GeminiProvider,
  // …
  'your-provider': YourProvider as ProviderConstructor
};
```
3. Extend the defaults in `src/utils/storage.ts` (`createProviderDefaults`, `PROVIDER_ORDER` in `const-variables.ts`), add field metadata in `src/options/providerMeta.ts`, and the popup picks it up automatically from the enabled-providers list

## References

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Service Workers in Extensions](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [Firefox WebExtensions Guide](https://extensionworkshop.com/documentation/)
