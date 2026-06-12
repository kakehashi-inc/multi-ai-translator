# 開発ガイド

## 前提条件

- Node.js 22 以上
- Yarn 4
- Chrome / Edge / Firefox

## セットアップ

```bash
git clone https://github.com/yourusername/multi-ai-translator.git
cd multi-ai-translator
yarn install
```

## よく使うコマンド

| コマンド | 用途 |
| --- | --- |
| `yarn dev` | Chrome 用ウォッチビルド（`dist/`） |
| `yarn dev:firefox` | Firefox 用ウォッチビルド（`dist-firefox/`） |
| `yarn build` | Chrome と Firefox の両方を配布用ビルド |
| `yarn build:chrome` | Chrome / Edge への配布用ビルド（`dist/`） |
| `yarn build:firefox` | Firefox (MV2) 用ビルド（`dist-firefox/`） |
| `yarn lint` | ESLint・Stylelint・jsonlint・`tsc --noEmit` を実行（Gulp 経由） |
| `yarn format` | `src/**` を Prettier で整形 |
| `yarn package` | 配布用 ZIP を `packages/` に生成 |
| `yarn sync:version` | `package.json` のバージョンを両マニフェストへ反映 |
| `yarn clean` | `dist/`, `dist-firefox/`, `packages/` を削除 |

> `yarn lint` は ESLint だけでなく、Stylelint・jsonlint・TypeScript 型チェック（`tsc --noEmit`）も実行する。型エラーがあると `lint` タスク全体が失敗する。

## ブラウザへの読み込み

### Chrome / Edge

1. `yarn dev` で開発用ウォッチ、または `yarn build:chrome` で本番ビルド
2. `chrome://extensions/` もしくは `edge://extensions/` を開く
3. 右上で「デベロッパーモード」を ON
4. 「パッケージ化されていない拡張機能を読み込む」で `dist/` を指定
5. コード変更後は Vite の再ビルド完了を待ち、拡張機能カードの更新アイコンでリロード

### Firefox

1. `yarn build:firefox` を実行して `dist-firefox/` を生成
2. `about:debugging#/runtime/this-firefox` を開く
3. 「一時的なアドオンを読み込む」→ `dist-firefox/manifest.json`
4. 変更後は再ビルドし、「再読み込み」で反映
5. 背景スクリプトのログは「検査」ボタンから確認

> 永続的にインストールしたい場合
>
> - **Developer Edition / Nightly**: `about:config` で `xpinstall.signatures.required` を `false` にすると署名なしでも読み込めます。
> - **AMO の「非公開（Unlisted）」署名**: `yarn build:firefox` で作成したパッケージを [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/) にアップロードし、署名付き XPI をダウンロードして `about:addons` からインストールします。
> - **企業ポリシー**: 管理ポリシーで署名チェックを無効化する方法もありますが、一般利用では非推奨です。

## 変更のテスト

1. ソースコードを編集
2. ウォッチビルドの完了、または手動ビルドを待つ
3. 読み込んでいるブラウザで拡張機能を更新
4. ポップアップ／オプション／翻訳動作を確認

## プロジェクト構造

```text
multi-ai-translator/
├── src/
│   ├── background/         # バックグラウンドサービスワーカー
│   ├── content/            # コンテンツスクリプト（content-script.ts, translator.ts）
│   ├── options/            # オプションページ（React + MUI: options.tsx, OptionsApp.tsx, providerMeta.ts）
│   ├── popup/              # ポップアップ UI（React + MUI: popup.tsx, PopupApp.tsx）
│   ├── providers/          # AI プロバイダー実装（base-provider.ts, index.ts, プロバイダーごとに1ファイル）
│   ├── prompts/            # プロンプトプロファイル（default-profile.ts, profiles/<model>.ts, index.ts）
│   ├── ui/                 # 共通の MUI テーマ・デザイントークン
│   ├── types/              # 共通の TypeScript 型（settings.ts など）
│   ├── utils/              # ユーティリティ（storage, i18n, dom-manager, const-variables）
│   └── locales/            # 翻訳リソース（en, ja, zh, ko, es, fr, de, it, pt, ru, ar, hi）
├── icons/                  # アイコン
├── scripts/                # ビルド／パッケージ化／バージョン同期スクリプト
├── Documents/              # ドキュメント
├── manifest.json           # Chrome / Edge (MV3)
├── manifest.firefox.json   # Firefox (MV2)
├── vite.config.ts          # Chrome / Edge 用ビルド設定
├── vite.firefox.config.ts  # Firefox 用ビルド設定
├── dist/                   # Chrome 向け出力
└── dist-firefox/           # Firefox 向け出力
```

## プロバイダーの追加

1. `src/providers/your-provider.ts` を作成：

   ```ts
   import { BaseProvider } from './base-provider';

   export class YourProvider extends BaseProvider {
     constructor(config) {
       super(config);
       this.name = 'your-provider';
     }

     protected async initialize() {
       // クライアント初期化
     }

     validateConfig() {
       return !!(this.config.apiKey && this.config.model);
     }

     async translate(texts: string[], targetLanguage: string, sourceLanguage = 'auto') {
       // 実装
     }

     async getModels() {
       // 実装
     }
   }
   ```

2. `src/providers/index.ts` の `PROVIDERS` マップに登録
3. `src/options/providerMeta.ts` に入力フィールド定義を追加（オプション UI はこれを基に描画する）
4. `src/utils/storage.ts` の `createProviderDefaults` にデフォルト値を追加し、`src/utils/const-variables.ts` の `PROVIDER_ORDER` に名前を追加

## アイコンの更新

拡張機能は `icons/` 配下に 4 サイズ（16, 32, 48, 128）の PNG アイコンを同梱しており、両マニフェストから参照される。これらは 1 枚の高解像度マスター画像（`icon.png`、512x512）から [ImageMagick](https://imagemagick.org/) で再生成する。

ImageMagick v7 は `magick` コマンドを使用する（v6 は `convert`）。

PowerShell（本リポジトリの既定シェル）:

```powershell
16,32,48,128 | ForEach-Object {
  magick icon.png -filter Lanczos -resize "${_}x${_}" -strip "icons/icon-$_.png"
}
```

Bash:

```bash
for s in 16 32 48 128; do
  magick icon.png -filter Lanczos -resize ${s}x${s} -strip icons/icon-${s}.png
done
```

- `-filter Lanczos` は小サイズでも輪郭をシャープに保ち、`-strip` はメタデータを除去してファイルサイズを削減する。
- ソース PNG の透過はそのまま維持される。白背景で塗りつぶしたい場合は `-background white -flatten` を追加する。
- アイコンのサイズを追加・削除する場合は、`manifest.json` と `manifest.firefox.json` 両方の `icons` / `action.default_icon` も更新すること。

## デバッグ

### バックグラウンド

- `chrome://extensions/` → 対象拡張機能の「Service Worker」をクリック
- Firefox の場合は `about:debugging` の「検査」からログ確認

### コンテンツスクリプト

- 任意のページで DevTools (F12) を開き Console を確認

### ポップアップ / オプション

- 対象 UI 上で右クリック → 「検証」
