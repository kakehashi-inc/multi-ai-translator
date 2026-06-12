# アーキテクチャドキュメント

## 概要

Multi AI Translatorは、Chrome（Chrome / Edge）向けには Manifest V3、Firefox 向けには Manifest V2 で動作するクロスブラウザ拡張機能です。実装は TypeScript + Vite を用い、共通のコードベースを `webextension-polyfill` で抽象化しています。ポップアップと設定画面は React と Material UI（MUI）で構築されています。このドキュメントでは、拡張機能のアーキテクチャ、コンポーネント構成、データフローについて説明します。

## アーキテクチャ図

```text
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
  abstract translate(texts: string[], targetLanguage: string, sourceLanguage?: string): Promise<string[]>;
  abstract getModels(): Promise<string[]>;

  // 基底クラスが提供する共通ヘルパー:
  // ensureInitialized(), withErrorHandling(), runTranslation(),
  // handleError(), splitIntoChunks()
}
```

`translate` は**テキストの配列**を受け取り、入力と同じ順序で 1 件につき 1 件の翻訳を返す。`runTranslation(texts, targetLanguage, sourceLanguage, send)` は、設定されたモデル名から**プロンプトプロファイル**と**方式（dispatch：ブロック／単一）**の両方を解決し（[プロンプトプロファイル](#プロンプトプロファイル)を参照）、翻訳を駆動する：1 回のバッチリクエスト、または 1 テキストにつき 1 リクエスト。プロバイダーは `send`（プロンプト文字列で 1 回 API 呼び出しを行い生のモデル出力を返す関数）を渡すだけでよい。プロンプトの組み立てとレスポンスの解析はすべてプロファイル側、バッチ制御はすべて `runTranslation` 側にあるため、プロバイダー（および `translator.ts`）はプロンプト形式を一切知らない。

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

### プロンプトプロファイル

**ファイル**：`src/prompts/`

翻訳は、いずれもモデル名から解決される**2つの独立した関心事**で制御される。

- **プロンプト** — モデルに何を送り、その返答をどう解析するか。**プロンプトプロファイル**（`PromptProfile`）が担う。プロンプト形式（XML バッチ、Hy-MT2 の素プロンプトなど）はプロファイル内部に閉じ、`translator.ts` やプロバイダーへ漏れない。
- **方式（dispatch）** — テキストのバッチを 1 リクエストにまとめる（`block`）か、1 件ずつ送る（`single`）か。`dispatch.ts` で別個に解決される。

この 2 つは意図的に分離されている。あるモデルは**既定プロンプトのまま**でも、複数テキストをまとめると混乱するため**単一方式が必要**になることがある（小型ローカルモデルなど）。プロンプトと方式は別の軸で選ばれ、自由に組み合わせられる。アプリの他の部分とやり取りするデータは常に**テキスト配列を入力 → 翻訳配列を出力**である。

**構成ファイル**：

- `types.ts` — `PromptProfile` インターフェースと `DispatchMode`（`'block' | 'single'`）。プロファイルはプロンプトと解析のみを担う：`buildBlockPrompt`/`parseBlockResponse`（ブロック用・任意）と `buildSinglePrompt`/`parseSingleResponse`（単一用・必須）。`dispatch` の希望も宣言できる。
- `dispatch.ts` — `SINGLE_DISPATCH_MODEL_RULES`（各ルールは「すべてマッチすべき正規表現の配列」で、いずれかのルールを満たせばマッチ）と `resolveDispatch(profile, model)`。解決順は、プロファイル自身の `dispatch` → モデル名ルール一致 → 既定の `block`。正規表現の AND により、ファミリー名・サイズなど複数のトークンを、順序や間に挟まる修飾子に関係なく要求できる。
- `default-profile.ts` — 専用プロファイルを持たないモデルの既定。ブロックは XML `<request>`/`<response>`（このファイルの私的な詳細）、単一は素の 1 テキスト指示を使う。
- `profiles/<model>.ts` — モデルファミリーごとに 1 ファイル。`matches()` ルール、プロンプト文、任意で `dispatch` の希望を持つ。
- `index.ts` — レジストリ。`resolveProfile(model)` は `matches(model)` が true になる最初のプロファイルを返し、なければ既定プロファイルを返す。dispatch のヘルパーも再エクスポートする。

**翻訳の流れ**：

1. `translator.ts` がテキストのバッチ（`string[]`）を集めてバックグラウンドワーカーへ送る。プロンプト形式は一切関与しない。
2. プロバイダーの `translate(texts, …)` が `runTranslation(texts, …, send)` を呼ぶ。
3. `BaseProvider.runTranslation()` がモデル名からプロンプトプロファイルと方式（dispatch）の両方を解決する。
4. `block` なら全テキストで 1 つのプロンプトを作りバッチ応答を解析、`single` なら 1 件ずつリクエストを送る。いずれも入力と 1:1 に揃った `string[]` を返す。（`block` が選ばれてもプロファイルが単一用メソッドしか持たない場合は単一へフォールバックする。）

**進捗とバッチサイズ**：ページ翻訳の前に `translator.ts` がバックグラウンドワーカーへ翻訳プラン（`getTranslationPlan` → 実効プロバイダー・モデル・方式）を問い合わせる。`single` 方式では 1 グループを 1 バッチにし（バッチサイズ 1、文字数上限なし）、進捗カウンターが複数テキストのチャンク全体が終わるまで固まらず、ブロックごとに進むようにする。方式の決定自体は `dispatch.ts` に閉じており、translator は解決済みの方式を受け取って使うだけである。

**モデル固有プロンプトの追加手順**（新しいプロンプト文）：

1. `src/prompts/profiles/<model>.ts` を作成し、`PromptProfile` をエクスポートする。
2. `src/prompts/index.ts` の `PROFILES` 配列に登録する。

**独自プロンプトなしで単一方式を強制する**：`dispatch.ts` の `SINGLE_DISPATCH_MODEL_RULES` にルールを追加する。そのモデルは既定プロンプトのまま、1 テキストずつ翻訳される。Gemma 3 の 1B〜4B はこの方法で扱われている：ルールが `gemma3` トークンと `1b`〜`4b` のサイズトークンの両方を（各々区切り文字で境界付けし、順序は問わず）要求するため、`gemma3:4b`、`gemma3-qat-4b`、`gemma3-4b-qat`、`library/gemma3:1b` のようなレジストリ接頭辞付きはすべてマッチし、`codegemma3:4b`、`gemma31b`、`gemma3:12b` はマッチしない。

**例：Hy-MT2**（`profiles/hy-mt2.ts`）：Tencent Hunyuan の
[Hy-MT2](https://github.com/Tencent-Hunyuan/Hy-MT2) は翻訳専用モデル。このプロファイルは `hy-mt2` を含む（大文字小文字を区別しない・派生版も対象）モデル名にマッチし、モデルの単一テキストプロンプト（`Translate the following text into <Language>. Note that you should only output the translated result without any additional explanation:\n\n<text>`）を使い、対象言語を共通の言語テーブル（`src/utils/languages.ts`）で完全な英語名へ正規化し、`dispatch: 'single'` を宣言して各テキストを個別リクエストで送る。プロンプトプロファイルも dispatch リストもモデル名でマッチするため、そのようなモデルを選択できる任意のプロバイダー（Ollama、OpenAI 互換、Anthropic 互換など）で、プロバイダー固有のコードなしに適用される。

## データフロー

### ページ翻訳フロー

```text
1. ユーザーがポップアップで「ページを翻訳」をクリック
   │
   ▼
2. ポップアップがアクティブタブのコンテンツスクリプトへ送信
   （コンテンツスクリプト未注入の場合はポップアップ側で動的に注入）
   │
   ▼
3. コンテンツスクリプト（Translator）が DOM のテキストノードを抽出・グループ化
   │
   ▼
4. Translator がジョブを開始する：
     begin-translation { jobId, provider, language }
   -> ワーカーがプロバイダーを解決し、その設定をスナップショットし、
      AbortController を生成して { provider, model, dispatch } を返す
   │
   ▼
5. バッチごとに translate { jobId, texts, ... } を送信
   -> ワーカーはジョブの設定スナップショットと AbortSignal を使って翻訳し、
      provider.translate(texts, ..., signal) を呼ぶ
   │
   ▼
6. 翻訳結果を DOM に適用
   │
   ▼
7. end-translation { jobId } を送信（ワーカーがジョブを破棄）
   │
   ▼
8. ページ上のステータスオーバーレイで進捗/結果を表示

キャンセル（いずれか）：原文に戻す/キャンセルボタン -> cancel-translation { jobId }；
タブ close -> tabs.onRemoved；ナビゲーション/リフレッシュ -> tabs.onUpdated(loading)。
いずれもジョブの controller を abort し、送信中のプロバイダーリクエストを中断する。
「キャンセルの挙動と設定スナップショット」を参照。
```

### 選択テキスト翻訳フロー

```text
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

## キャンセルの挙動と設定スナップショット

ページ翻訳は、設定スナップショットと `AbortSignal`（プロバイダーの SDK まで貫通）を
持つ**ジョブ**であり、その所有者はバックグラウンドワーカーである。これにより
キャンセルが実効化され（送信中のリクエストを無視するのではなく abort する）、実行中の
翻訳が途中の設定変更の影響を受けないようになる。

### ジョブモデル

ページ翻訳は、`translator.ts` が新規生成した `jobId` を付けて `begin-translation` を
送ると開始する。ワーカーはそのとき `translationJobs` マップに `TranslationJob` を作る：

```ts
type TranslationJob = {
  jobId: string;
  tabId: number | undefined;       // メッセージ送信元から取得。タブ close 時に使う
  controller: AbortController;     // ジョブごとに 1 つ。abort でジョブをキャンセル
  provider: string;                // begin 時に一度だけ解決
  providerConfig: ProviderSettings; // 設定の deep clone スナップショット
  targetLanguage: string;
  sourceLanguage: string;
};
```

以降、各バッチはその `jobId` を載せた `translate` メッセージとして送られる。ワーカーは
ジョブを引き、**スナップショット**の設定とジョブの `controller.signal` を使ってバッチを
翻訳する。ジョブは `end-translation`（正常終了）、`cancel-translation`（ユーザーの
キャンセル / 原文に戻す / 再翻訳）、またはタブのライフサイクルイベント（後述）で破棄される。

### 設定スナップショット — 実行中のジョブは後からの変更を無視する

`begin-translation` はプロバイダーを解決し、その設定を**deep clone** してジョブに格納する。
以降の各バッチはこのクローンを読み、ストレージのライブ設定は読まない。そのため翻訳の途中で
オプション画面でモデル（やその他の設定）を変更しても、**すでに翻訳中のページには影響しない** —
そのページは開始時の設定で完遂する。新しい設定は次回の翻訳から反映される。（以前のコードは
バッチごとに `getSettings()` を読み直しており、途中のモデル変更が残りのバッチに漏れていた。）

`jobId` を持たない単発バッチ（選択範囲翻訳）は、従来どおりライブ設定を解決する。単一
リクエストのため、保護すべき複数バッチの時間窓が存在しないからである。

### キャンセルは送信中のリクエストを abort する

`BaseProvider.translate(texts, target, source, signal?)` と
`runTranslation(..., send, signal?)` ランナーは `AbortSignal` を受け取る。ランナーは
各リクエストの前に `signal.throwIfAborted()` を呼び（キャンセル時に残りのテキストを即座に
止める）、signal を各プロバイダーの `send` に渡し、`send` がそれを SDK に渡す：

- OpenAI / OpenAI-compatible: `chat.completions.create(params, { signal })`
- Anthropic / Anthropic-compatible: `messages.create(params, { signal })`
- Gemini: `generateContent({ ..., config: { abortSignal: signal } })`
- Ollama: signal の `abort` イベントに `client.abort()` を接続（SDK はそのクライアントの
  全 in-flight リクエストを abort する。各バッチは新しいクライアントを使うため実質的に
  バッチ単位になる）

signal が abort すると、SDK は `AbortError` で reject する。`handleError` は abort エラーを
そのまま再 throw し（キャンセルは翻訳失敗ではない）、`translateText` はそれを
`statusCancelled` の結果に変換するので、UI はエラーではなく「キャンセル」を表示する。
`BaseProvider.isAbortError(err)` が abort 判定を一元化する（`DOMException`、SDK の abort
クラス、abort 名のエラーをカバー）。

したがってキャンセルはもはや「将来のバッチを止める」だけに限定されない：いままさに
プロバイダーと通信中のリクエストも破棄される。N バッチに分割されたページなら、バッチ間の
N-1 個のチェックポイント**に加えて**、送信中のバッチの中断もできる — つまり実質的に
どの時点でも止まる。

### キャンセルのトリガー

| トリガー | 検知 | 効果 |
| --- | --- | --- |
| 「原文に戻す」/キャンセルボタン | content script の `restoreOriginal()` → `cancel-translation` | 送信中リクエストを abort ＋ DOM を復元 |
| 実行中の再翻訳 | `translatePage()` が `isTranslating` を検知し、旧ジョブをキャンセル・復元してから新ジョブ開始 | 旧ジョブを abort し、新ジョブで翻訳 |
| タブ close | ワーカーの `tabs.onRemoved` | そのタブの全ジョブを abort |
| ナビゲーション /（ハード）リフレッシュ | ワーカーの `tabs.onUpdated`（`status === 'loading'`） | そのタブの全ジョブを abort |

タブ close / ナビゲーションではコンテンツスクリプトが消えるため、反応すべきは**ワーカー**で
ある — これがジョブに `tabId` を持たせ、ワーカーがタブのライフサイクルイベントを購読する
理由である。`translateText` の防御的チェック（すでに破棄済みのジョブの `jobId` は翻訳せず
`AbortError` で reject する）により、キャンセルをすり抜けたバッチが余分なプロバイダー呼び出しを
通すことを防ぐ。

### 再翻訳の挙動

翻訳の実行中にもう一度「翻訳」を押すと、既存のジョブをキャンセルし（送信中のリクエストを
abort）、ページを原文に戻し、`statusCancellingPrevious` を短く表示してから、現在の設定で
新しいジョブを開始する。

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
      batchMaxItems: 10
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
