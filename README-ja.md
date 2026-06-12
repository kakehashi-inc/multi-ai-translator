# Multi AI Translator

[English README](README.md)

複数のAIプロバイダを使用してWebページを翻訳する強力なブラウザ拡張機能です。

## 機能

- 🌐 **複数のAIプロバイダ対応**: Gemini、Anthropic（Claude）、Anthropic互換API、OpenAI、OpenAI互換API、Ollamaから選択可能
- 🦊 **マルチブラウザ対応**: Chrome、Edge、Firefoxで動作
- 📄 **ページ翻訳**: ワンクリックでWebページ全体を翻訳
- ✨ **選択範囲翻訳**: 選択したテキストを翻訳
- 🔄 **原文に戻す**: 簡単に元のコンテンツに戻せます
- 🌍 **多言語対応**: 日本語と英語のUIに対応

## 対応AIプロバイダ

| プロバイダ | 概要 | APIキー |
|----------|------|---------|
| Gemini | Google AI Studio / Generative Language API | ✅ 必要 |
| Anthropic（Claude） | Claude API および互換ゲートウェイ | ✅ 必要 |
| Anthropic互換 | Claude互換API（例: AWS Bedrock 等） | 状況による |
| OpenAI | OpenAI公式API | ✅ 必要 |
| OpenAI互換 | OpenAI互換のRESTエンドポイント（LM Studio, LocalAI 等） | 状況による |
| Ollama | ローカルで動作するOllama | ❌ 不要（ローカルのみ） |

## インストール

### ソースから

1. リポジトリをクローン:
```bash
git clone https://github.com/yourusername/multi-ai-translator.git
cd multi-ai-translator
```

2. 依存関係をインストール:
```bash
yarn install
```

3. 拡張機能をビルド:
```bash
# Chrome / Edge（dist/に出力）
yarn build:chrome

# Firefox（dist-firefox/に出力）
yarn build:firefox
```

4. ブラウザに読み込み:

   **Chrome/Edge:**
   - `chrome://extensions/`（Chrome）または`edge://extensions/`（Edge）を開く
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」をクリック
   - `dist`フォルダを選択

   **Firefox（`yarn build:firefox` 実行後）:**
   - `about:debugging#/runtime/this-firefox`を開く
   - 「一時的なアドオンを読み込む」をクリック
   - `dist-firefox`フォルダ内の`manifest.json`ファイルを選択

## クイックスタート

1. **プロバイダを設定**:
   - 拡張機能アイコンをクリック
   - 「設定」をクリック
   - プロバイダを有効化してAPIキーを追加
   - モデルを選択

2. **ページを翻訳**:
   - 任意のWebページを開く
   - 拡張機能アイコンをクリック
   - 「ページを翻訳」をクリック

3. **選択範囲を翻訳**:
   - ページ上のテキストを選択
   - 拡張機能のポップアップを開く
   - 「選択範囲を翻訳」をクリックするとページ内にオーバーレイが表示され、進捗と結果を確認できます

## 開発

ビルド/リリース手順や詳細な設定は [Documents/Development-ja.md](Documents/Development-ja.md) に集約されています。

## プライバシー

この拡張機能は:

- ✅ 個人情報を収集しません
- ✅ すべての設定をブラウザのローカルに保存します
- ✅ 翻訳リクエストを選択したAIプロバイダに直接送信します
- ✅ トラッキングやアナリティクスを使用しません
- ✅ 完全にオープンソースです

## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。
