# デプロイメントガイド

## 本番環境用ビルド

1. 拡張機能をビルドする（Chrome + Firefox）：
```bash
yarn build
```

`dist/`（Chrome 用）と `dist-firefox/`（Firefox 用）が生成されます。
Chrome だけ、あるいは Firefox だけを個別に更新する場合は `yarn build:chrome` / `yarn build:firefox` を使用します。

2. 配布パッケージを作成する：
```bash
yarn package
```

`packages/` ディレクトリに、各 `manifest*.json` のバージョンを反映した ZIP が作成されます。
- `multi-ai-translator-chrome-<version>.zip`（Chrome / Edge 用）— 例: `multi-ai-translator-chrome-0.1.2.zip`
- `multi-ai-translator-firefox-<version>.zip`（Firefox 用）

## 費用サマリ（2026-04 時点）

| フェーズ | 項目 | 費用 |
| --- | --- | --- |
| Chrome ウェブストア | 開発者登録（1回限り） | **5 USD** |
| Chrome ウェブストア | 拡張機能の提出・ホスティング・更新 | 無料 |
| Microsoft Edge アドオン | パートナーセンター登録（個人開発者） | 無料 |
| Microsoft Edge アドオン | 提出・ホスティング・更新 | 無料 |
| Firefox アドオン (AMO) | 開発者登録 | 無料 |
| Firefox アドオン (AMO) | Listed / Unlisted の提出・署名・ホスティング | 無料 |

補足:
- Chrome の 5 USD は **Google アカウントごとに 1 回限り** の登録料で、拡張機能ごとに発生するものではありません。1 アカウントで最大 20 個の拡張機能を公開できます。料金は個人・法人とも同額で、Chrome ウェブストアでは法人検証のための追加料金は発生しません。
- Microsoft Edge アドオンは、2025-12 時点で **個人アカウント・法人アカウントとも公開料金は無料** です（Microsoft Learn 公式：「There is no registration fee for submitting extensions to the Microsoft Edge program」）。一部の情報源で言及される **99 USD のパートナーセンター料金は、Windows アプリ等の別プログラム向け** であり、Edge 拡張機能プログラムには適用されません。
- 法人（企業）アカウント特有の事項:
  - **Chrome ウェブストア**: 任意でドメイン検証を行うと「verified publisher（認証済み発行者）」バッジが付与されます。これにはドメインの所有が必要で、ドメイン自体の費用（通常 年間 10〜15 USD 程度）が別途レジストラに発生します（Google への支払いではありません）。
  - **Edge アドオン**: 法人アカウントの検証自体は無料ですが、個人アカウントよりも時間がかかります（数日〜数週間）。Microsoft が指定された **会社承認者（company approver）** に電話・メールで連絡し、パートナーセンターの「Legal info」に補足書類（公共料金請求書、DUNS ID、政府発行書類など）のアップロードを求められる場合があります。Publisher 表示名は **登記された法人名** と一致している必要があります。登録後にアカウント種別を法人から個人へ変更することはできません。
- 以下に記載する標準の公開フローでは、サードパーティのホスティング・署名証明書・CI サービスは不要です。

## Chrome ウェブストア

### 前提条件
- Googleアカウント
- **5 USD** の1回限りの開発者登録料（下記の登録ステップで支払います）
- 準備済みのアセット（アイコン、スクリーンショット、説明文）

### 手順

1. **開発者として登録**
   - [Chrome ウェブストア デベロッパー ダッシュボード](https://chrome.google.com/webstore/devconsole)にアクセス
   - 登録料（5ドル）を支払う
   - 利用規約に同意する

2. **アセットの準備**

   必要なアイコン：
   - 128x128 アイコン（必須）
   - スクリーンショット：1280x800 または 640x400（最低1枚、最大5枚）
   - プロモーション画像（オプション）：
     - 小サイズ：440x280
     - マーキー：1400x560

3. **新規アイテムの作成**
   - 「新規アイテム」をクリック
   - `packages/` 内のバージョン付き ZIP（例: `multi-ai-translator-chrome-0.1.2.zip`）をアップロード
   - 自動チェックを待つ

4. **ストアリストの記入**

   必須フィールド：
   - **名前**：Multi AI Translator
   - **概要**：複数のAIプロバイダーを使用してウェブページを翻訳
   - **説明**：下記のテンプレートを参照
   - **カテゴリ**：生産性
   - **言語**：日本語

   説明文テンプレート：
   ```
   Multi AI Translatorは、OpenAI、Claude、Gemini、Ollamaなど、複数のAIプロバイダーを
   使用してウェブページを翻訳できる強力なブラウザ拡張機能です。

   主な機能：
   • 複数のAIプロバイダーに対応
   • ページ全体または選択したテキストの翻訳
   • ポップアップでの翻訳表示
   • 元のコンテンツの復元
   • カスタマイズ可能な設定
   • 多言語UI（英語、日本語）

   対応プロバイダー：
   • Gemini（Google）
   • Claude（Anthropic）
   • Anthropic互換API
   • OpenAI
   • OpenAI互換API
   • Ollama（ローカル）

   プライバシー：
   この拡張機能は個人データを一切収集しません。すべてのAPIキーはブラウザに
   ローカルで保存されます。翻訳リクエストは選択したAIプロバイダーに直接送信されます。
   ```

5. **プライバシー設定**
   - プライバシーポリシーを追加（ネットワークリクエストを使用する場合は必須）
   - データ使用について説明
   - 権限の正当性を説明

   プライバシーポリシーテンプレート：
   ```
   Multi AI Translator のプライバシーポリシー

   データ収集：
   この拡張機能は、個人情報を収集、保存、送信することはありません。

   APIキー：
   すべてのAPIキーは、Chromeのストレージ APIを使用してブラウザにローカルで保存されます。
   キーが当社のサーバーに送信されることはありません。

   翻訳データ：
   翻訳リクエストは、選択したAIプロバイダー（OpenAI、Claudeなど）に直接送信されます。
   当社は翻訳コンテンツを傍受または保存することはありません。

   権限：
   • storage：設定（APIキー、言語設定など）をローカルに保存するため
   • activeTab：ユーザーが翻訳を実行したときにアクティブなタブへアクセスするため
   • scripting：現在のページに翻訳ロジックを注入するため
   • contextMenus：右クリックメニューに「翻訳」項目を提供するため
   • notifications：翻訳の成功・失敗を通知するため
   • <all_urls>（ホスト権限）：ユーザーが開いた任意のウェブページを翻訳するため
   ```

   これらは `manifest.json` および `manifest.firefox.json` で宣言されている権限と一致します。権限を変更する場合はこのセクションも同期してください。

6. **審査用に提出**
   - すべての情報を確認
   - 「審査用に提出」をクリック
   - 承認まで1〜3日待つ

### 承認後

- 拡張機能が自動的に公開される
- レビューとフィードバックを監視
- ユーザーの問題に対応

## Microsoft Edge アドオン

### 前提条件
- Microsoftアカウント
- 登録料不要
- 準備済みのアセット

### 手順

1. **登録**
   - [パートナーセンター](https://partner.microsoft.com/dashboard)にアクセス
   - Microsoftアカウントでサインイン
   - 登録を完了

2. **拡張機能を提出**
   - 「新しい拡張機能」をクリック
   - `packages/` 内のバージョン付き Chrome ZIP（例: `multi-ai-translator-chrome-0.1.2.zip`）をアップロード（Edge も Chrome ビルドを使用）
   - 必須フィールドを記入（Chromeと同様）

3. **審査プロセス**
   - 通常1〜7日
   - Chromeよりも徹底的
   - 変更を求められる場合がある

## Firefox アドオン (AMO)

### 前提条件
- Mozilla アカウント（Firefox アカウント）
- 登録料不要
- 準備済みのアセット（アイコン、スクリーンショット、説明文）
- Firefox 用ビルドは MV2 で、`yarn build:firefox` により `manifest.firefox.json` が `dist-firefox/` にバンドルされます

### 手順

1. **登録**
   - [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/) にアクセス
   - Mozilla アカウントでサインイン
   - Add-on Distribution Agreement に同意

2. **拡張機能を提出**
   - 「Submit a New Add-on」をクリック
   - 配布方法を選択:
     - **On this site (Listed)** — addons.mozilla.org で公開され、審査後に自動で署名されます
     - **On your own (Unlisted)** — 自己配布用に署名されるだけで、AMO には掲載されません
   - `packages/` 内のバージョン付き Firefox ZIP（例: `multi-ai-translator-firefox-0.1.2.zip`）をアップロード
   - メタデータ（名称、概要、説明、カテゴリ、ライセンス、サポート連絡先）を記入
   - ミニファイ／バンドルされたコードが含まれる場合はソースコードの URL を提示するかソースをアップロード（Vite の出力はこれに該当するため、GitHub リポジトリ URL またはソースアーカイブを必ず指定すること）

3. **審査プロセス**
   - 自動バリデーションは即時実行
   - Listed の人手レビューは通常数時間〜数日
   - Unlisted は通常数分で署名完了
   - AMO はリモートコード実行やミニファイコードの出所に厳格なため、ビルド手順を再現可能に保つこと

### 承認後

- Listed アドオンは addons.mozilla.org で自動的に公開されます
- Unlisted アドオンは Developer Hub から署名済み `.xpi` をダウンロードして手動で配布できます

## 拡張機能の更新

1. **`package.json` のバージョンを更新**（これがソース・オブ・トゥルースです）：
```json
{
  "version": "0.1.3"
}
```
   `yarn build:chrome` / `yarn build:firefox` を実行すると `scripts/sync-manifest-version.js` が自動で動作し、`manifest.json`（Chrome/Edge、MV3）と `manifest.firefox.json`（Firefox、MV2）の双方にバージョンが伝播されます。手動で同期したい場合は `yarn sync:version` を実行してください。

2. **ビルドしてパッケージ化**：
```bash
yarn build
yarn package
```
   `packages/` 配下に `multi-ai-translator-chrome-0.1.3.zip` や `multi-ai-translator-firefox-0.1.3.zip` のようなバージョン付き ZIP が生成されます。

3. **新しいバージョンをアップロード**：
   - Chrome：デベロッパー ダッシュボードの既存アイテムに `multi-ai-translator-chrome-<version>.zip` をアップロード（更新は無料）
   - Edge：パートナーセンターで新しい提出を作成し、同じ Chrome ZIP をアップロード（無料）
   - Firefox：Firefox Add-ons Developer Hub の既存アドオンに新しいバージョンとして `multi-ai-translator-firefox-<version>.zip` をアップロード（Listed は自動審査、Unlisted は署名のみ。どちらも無料）

4. **リリースノートを追加**：
```
バージョン 1.0.1
- 翻訳エラーハンドリングを修正
- パフォーマンスを改善
- 依存関係を更新
```
