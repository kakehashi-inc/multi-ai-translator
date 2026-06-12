# アーキテクチャドキュメント

## 概要

Multi AI Translatorは、Chrome（Chrome / Edge）向けには Manifest V3、Firefox 向けには Manifest V2 で動作するクロスブラウザ拡張機能です。実装は TypeScript + Vite を用い、共通のコードベースを `webextension-polyfill` で抽象化しています。ポップアップと設定画面は React と Material UI（MUI）で構築されています。このドキュメントでは、拡張機能のアーキテクチャ、コンポーネント構成、データフローについて説明します。

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Extension                    │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Popup UI   │  │  Options UI  │  │  Content     │  │
│  │              │  │              │  │  Scripts     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │           │
│         └─────────────────┼──────────────────┘           │
│                           │                              │
│                  ┌────────▼────────┐                     │
│                  │   Background    │                     │
│                  │  Service Worker │                     │
│                  └────────┬────────┘                     │
│                           │                              │
│                  ┌────────▼────────┐                     │
│                  │   Providers     │                     │
│                  │   Layer         │                     │
│                  └────────┬────────┘                     │
│                           │                              │
└───────────────────────────┼──────────────────────────────┘
                            │
   ┌──────────┬──────────┬──┴───────┬──────────┬───────────┐
   │          │          │          │          │           │
┌──▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼─────┐ ┌───▼──────┐
│Gemini│ │Anthropic│ │ OpenAI │ │ Ollama │ │ OpenAI- │ │Anthropic-│
│ API  │ │ (Claude)│ │  API   │ │        │ │compatible│ │compatible│
└──────┘ └─────────┘ └────────┘ └────────┘ └─────────┘ └──────────┘
```

## コンポーネント構成

### 1. Background Service Worker

**ファイル**：`src/background/service-worker.ts`

**役割**：
- 拡張機能の中核となる永続的なバックグラウンドプロセス
- メッセージングのハブとして機能
- API呼び出しの調整
- 状態管理

**主な責務**：
```ts
// メッセージハンドリング
browser.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
```

**特徴**：
- Manifest V3のService Workerとして実装
- イベント駆動型
- 必要に応じてアクティブ化/非アクティブ化

### 2. Content Scripts

**ファイル**：`src/content/content-script.ts`、`src/content/translator.ts`

**役割**：
- ウェブページのDOMにアクセス
- ページコンテンツの抽出と操作
- 翻訳結果のページへの適用

**主な機能**：
```ts
// 翻訳フロー
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

**注入モード**：
- `matches`: `<all_urls>` - すべてのページで実行可能
- `run_at`: `document_idle` - DOMが完全に読み込まれた後に実行

### 3. Popup UI

**ファイル**：`src/popup/popup.html`、`src/popup/popup.tsx`（React エントリ）、`src/popup/PopupApp.tsx`（React + MUI コンポーネント）

**役割**：
- ユーザーインターフェース
- 翻訳操作のトリガー
- 現在の状態表示

**主な機能**：
- ページ翻訳ボタン
- 選択範囲翻訳ボタン
- 元に戻すボタン
- 設定ページへのリンク
- 選択中のプロバイダーと、そのプロバイダーに設定されたモデルの表示

**通信**：
```ts
// ページ翻訳はアクティブタブのコンテンツスクリプトへ送信する
await browser.tabs.sendMessage(tabId, {
  action: 'translate-page',
  provider,
  language: targetLanguage,
  sourceLanguage
});
// 最後に使用したプロバイダーはバックグラウンドワーカー経由で永続化する
await browser.runtime.sendMessage({
  action: 'setLastUsedProvider',
  data: { provider }
});
```

### 4. Options UI

**ファイル**：`src/options/options.html`、`src/options/options.tsx`（React エントリ）、`src/options/OptionsApp.tsx`（React + MUI コンポーネント）、`src/options/providerMeta.ts`（プロバイダーごとの入力フィールド定義）

**役割**：
- 拡張機能の設定管理
- プロバイダー設定
- APIキー管理
- UI言語設定

**設定項目**：
- プロバイダー選択（Gemini、Anthropic（Claude）、Anthropic 互換、OpenAI、OpenAI 互換、Ollama）
- APIキー
- モデル選択
- 既定の翻訳元/翻訳先言語
- 詳細設定（バッチ最大文字数、バッチ最大件数など）

### 5. Providers Layer

**ファイル**：`src/providers/`

**役割**：
- 各AIプロバイダーとの通信を抽象化
- 統一されたインターフェース提供
- エラーハンドリング

**クラス構造**：
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

  // サブクラスが実装する:
  protected abstract initialize(): Promise<void>;
  abstract validateConfig(): boolean;
  abstract translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string>;
  abstract getModels(): Promise<string[]>;

  // 基底クラスが提供する共通ヘルパー:
  // ensureInitialized(), withErrorHandling(), createPrompt(),
  // handleError(), splitIntoChunks()
}
```

各プロバイダーは公式 SDK もしくは `fetch` を内部でラップする（例: `@anthropic-ai/sdk`、`openai`、`@google/genai`、`ollama`）。

**サポートされているプロバイダー**（`src/providers/index.ts` の `PROVIDERS` マップで「プロバイダー名 → コンストラクタ」を定義し、`createProvider(name, config)` ファクトリが利用する）：
- `gemini` → `GeminiProvider`
- `anthropic` → `AnthropicProvider`
- `anthropic-compatible` → `AnthropicCompatibleProvider`
- `openai` → `OpenAIProvider`
- `openai-compatible` → `OpenAICompatibleProvider`
- `ollama` → `OllamaProvider`

### 6. Utils

**ファイル**：`src/utils/`

**役割**：
- 共通ユーティリティ関数
- ストレージ管理
- i18n（国際化）

**主要モジュール**：

#### Storage Utils
```typescript
import browser from 'webextension-polyfill';

export async function saveSettings(settings: Settings) {
  await browser.storage.local.set({ settings });
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await browser.storage.local.get('settings');
  return normalizeSettings(settings);
}
```

#### i18n Utils
```typescript
import browser from 'webextension-polyfill';

export function getMessage(key: string, substitutions?: string[]) {
  return browser.i18n.getMessage(key, substitutions);
}
```

#### Text Processing Utils
```javascript
// テキストのチャンク分割
function chunkText(text, maxChunkSize) {
  const chunks = [];
  let currentChunk = '';

  const sentences = text.split(/[.!?。！？]\s*/);

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = sentence;
    } else {
      currentChunk += sentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

## データフロー

### ページ翻訳フロー

```
1. ユーザーがポップアップで「ページを翻訳」をクリック
   │
   ▼
2. ポップアップがアクティブタブのコンテンツスクリプトへ送信
   browser.tabs.sendMessage(tabId, {
     action: 'translate-page', provider, language, sourceLanguage
   })
   （コンテンツスクリプト未注入の場合はポップアップ側で動的に注入）
   │
   ▼
3. コンテンツスクリプト（Translator）が DOM のテキストノードを抽出・グループ化
   │
   ▼
4. Translator がテキストをバッチに分割し、選択されたプロバイダーで翻訳
   （プロバイダーのモデル一覧取得などはバックグラウンドの 'getModels' を利用）
   │
   ▼
5. 翻訳結果を DOM に適用し、ページ上のステータスオーバーレイで進捗/結果を表示
```

### 選択テキスト翻訳フロー

```
1. ユーザーがテキストを選択し、ポップアップの「選択範囲を翻訳」または右クリックメニューを使用
   │
   ▼
2. ポップアップがコンテンツスクリプトへ 'get-selection-text' を送り選択テキストを取得
   │
   ▼
3. ポップアップが 'translate-selection-inline' を送信（text, provider, language, sourceLanguage）
   │
   ▼
4. コンテンツスクリプト（Translator）がプロバイダーで翻訳
   │
   ▼
5. 選択範囲付近のインラインポップアップに結果を表示
```

## ストレージ戦略

### WebExtension Storage API

**使用するストレージタイプ**：
- `browser.storage.local`: 設定、プロバイダー情報、翻訳履歴
- `browser.storage.session`: 最後に使用したプロバイダー（session 領域が使えない場合（例: Firefox MV2）は `storage.local` にフォールバック）

**ストレージ構造**（抜粋）。`src/types/settings.ts` の `Settings` 型に対応する：
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
      // プロバイダー名をキーとする。フィールドはプロバイダーごとに異なる:
      openai: { enabled: true, apiKey: 'sk-...', model: 'gpt-4o-mini', temperature: 0.3, maxTokens: 4096 },
      anthropic: { enabled: false, apiKey: '', model: '', temperature: 0.3, maxTokens: 4096 },
      ollama: { enabled: false, host: 'http://localhost:11434', model: '', temperature: 0.3 }
      // 'anthropic-compatible' / 'openai-compatible' はさらに baseUrl を持つ
    },
    ui: {
      theme: 'auto', // 'auto' | 'light' | 'dark'
      fontSize: 14
    }
  },
  // settings の外側、トップレベルの別キーとして保存される:
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

ポップアップは `lastUsedProvider`（有効な場合）を読み取ってプロバイダーを選択し、無効な場合は有効なプロバイダーの先頭にフォールバックする。現状、翻訳キャッシュは導入しておらず、最新 100 件の翻訳履歴のみを保持する。

## セキュリティ考慮事項

### APIキーの保護

1. **ローカルストレージ**：
   - APIキーは `browser.storage.local` に保存
   - 他の拡張機能からアクセス不可

2. **通信の暗号化**：
   - すべてのAPI通信はHTTPS経由
   - TLS 1.2以上を使用

3. **XSS対策**：
   - コンテンツスクリプトでのユーザー入力サニタイズ
   - `textContent`の使用（`innerHTML`を避ける）

### Content Security Policy

**manifest.json**：
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

### 権限の最小化

**必要な権限のみを要求**：
```json
{
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "contextMenus",
    "notifications"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

これは `manifest.json`（MV3）と `manifest.firefox.json`（MV2）に一致する。権限を変更する際は両マニフェストと本ドキュメントを同期すること。

## パフォーマンス最適化

### 1. 遅延読み込み

- Service Workerは必要時のみアクティブ化
- コンテンツスクリプトの条件付き実行
- Firefox ビルドの esbuild パス（`vite.firefox.config.ts`）は `stub-node-builtins` プラグインを実行し、`node:*` の import をすべて空モジュールに解決する。一部の依存（例: `@anthropic-ai/sdk`）はブラウザ拡張では実行されないコードパスから `node:fs` / `node:path` などの Node 組み込みを参照するため、これらをスタブ化して当該パスを無害化し、ブラウザ向けバンドルをビルド可能にしている。

### 2. バッチ処理

```javascript
// 複数のテキストチャンクを効率的に処理
async function batchTranslate(chunks, provider) {
  const results = [];
  const batchSize = 3; // 並列リクエスト数

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const promises = batch.map(chunk => provider.translate(chunk));
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // レート制限対策
    if (i + batchSize < chunks.length) {
      await sleep(500);
    }
  }

  return results;
}
```

### 3. DOM操作の最適化

```javascript
// 一括DOM更新
function applyTranslationsBatch(translations) {
  // DocumentFragmentを使用して再描画を最小化
  const fragment = document.createDocumentFragment();

  for (const { node, translation } of translations) {
    const clone = node.cloneNode(true);
    clone.textContent = translation;
    fragment.appendChild(clone);
  }

  // 一度にDOMに適用
  container.appendChild(fragment);
}
```

### 4. メモリ管理

- 大きなキャッシュの定期的なクリーンアップ
- 未使用データの削除
- WeakMapの使用（適用可能な場合）

## エラーハンドリング

### 階層的エラーハンドリング

```javascript
// Provider層
class OpenAIProvider {
  async translate(text, targetLanguage) {
    try {
      const response = await fetch(API_URL, options);
      if (!response.ok) {
        throw new ProviderError(response.status, await response.text());
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new NetworkError('Failed to connect to OpenAI', error);
    }
  }
}

// Background Script層
async function handleTranslateRequest(message) {
  try {
    const translation = await provider.translate(message.text);
    return { success: true, translation };
  } catch (error) {
    console.error('Translation error:', error);
    return {
      success: false,
      error: error.message,
      errorType: error.constructor.name
    };
  }
}

// UI層
async function translatePage() {
  const response = await browser.runtime.sendMessage({
    action: 'translate-page'
  });

  if (!response.success) {
    showError(response.error);
    return;
  }

  showSuccess('Translation completed');
}
```

## テスト戦略

現状、自動テストランナーはリポジトリに導入されていない（`package.json` に `test` スクリプトはない）。品質確認は主に以下で行う。

- **手動 / 探索的テスト**：Chrome・Edge・Firefox で、ポップアップ・設定画面・翻訳フローを実機確認
- **将来の予定**：回帰チェック用に自動 E2E ハーネス（例：Playwright）の導入を検討

将来ユニットテストを導入する場合は、ユーティリティ（チャンク分割など）とプロバイダーのラッパーを優先対象とする。

## 拡張性

### 新しいプロバイダーの追加

1. `BaseProvider` を継承し、`initialize` / `validateConfig` / `translate` / `getModels` を実装
2. `src/providers/index.ts` の `PROVIDERS` マップに登録
3. `src/utils/storage.ts` の `createProviderDefaults` と `const-variables.ts` の `PROVIDER_ORDER` に既定値を追加
4. `src/options/providerMeta.ts` に入力フィールド定義を追加（ポップアップは有効プロバイダー一覧から自動的に認識する）

```ts
// 1. プロバイダークラス作成
export class NewProvider extends BaseProvider {
  protected async initialize() {
    // クライアント初期化
  }

  validateConfig() {
    return !!(this.config.apiKey && this.config.model);
  }

  async translate(text: string, targetLanguage: string, sourceLanguage = 'auto') {
    // 実装
  }

  async getModels() {
    // 利用可能なモデルのリストを返す
  }
}

// 2. 登録
import { NewProvider } from './new-provider';
export const PROVIDERS: Record<string, ProviderConstructor> = {
  gemini: GeminiProvider,
  // …
  'new-provider': NewProvider as ProviderConstructor
};
```

## 参考資料

- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Service Workers in Extensions](https://developer.chrome.com/docs/extensions/mv3/service_workers/)
- [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [Message Passing](https://developer.chrome.com/docs/extensions/mv3/messaging/)
