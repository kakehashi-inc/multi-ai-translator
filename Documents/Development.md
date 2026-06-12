# Development Guide

## Prerequisites

- Node.js 22+
- Yarn 4
- Chrome / Edge / Firefox

## Setup

```bash
git clone https://github.com/yourusername/multi-ai-translator.git
cd multi-ai-translator
yarn install
```

## Common Scripts

| Command | Purpose |
| --- | --- |
| `yarn dev` | Watch build for Chrome (outputs to `dist/`) |
| `yarn dev:firefox` | Watch build for Firefox (outputs to `dist-firefox/`) |
| `yarn build` | Production build for both Chrome and Firefox |
| `yarn build:chrome` | Production build for Chrome / Edge → `dist/` |
| `yarn build:firefox` | Firefox (MV2) build → `dist-firefox/` |
| `yarn lint` | Run ESLint, Stylelint, jsonlint, and `tsc --noEmit` (via Gulp) |
| `yarn format` | Format `src/**` with Prettier |
| `yarn package` | Build distributable ZIPs into `packages/` |
| `yarn sync:version` | Propagate `package.json` version to both manifests |
| `yarn clean` | Remove `dist/`, `dist-firefox/`, `packages/` |

> `yarn lint` is more than ESLint: it also runs Stylelint, jsonlint, and a TypeScript type check (`tsc --noEmit`). A type error fails the whole `lint` task.

## Loading the Extension

### Chrome / Edge

1. Run `yarn dev` (watch) or `yarn build:chrome`
2. Open `chrome://extensions/` or `edge://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select `dist/`
5. After changes, wait for Vite to rebuild and click the refresh icon on the extension card

### Firefox

1. Run `yarn build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick `dist-firefox/manifest.json`
4. Rebuild and press **Reload** after each change
5. Use the **Inspect** button to view background logs

> Need a persistent install?
>
> - **Developer Edition / Nightly**: set `xpinstall.signatures.required = false` in `about:config` to load unsigned builds.
> - **AMO “Unlisted” signing**: upload the `dist-firefox/` package to the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/), download the signed XPI, and install it via `about:addons`.
> - **Enterprise policy**: organizations can disable signature requirements through managed policies, though this is uncommon outside corporate environments.

## Testing Changes

1. Edit the source
2. Wait for the watcher/build to finish
3. Reload the extension in the browser
4. Exercise popup, options, and translation flows

## Project Structure

```text
multi-ai-translator/
├── src/
│   ├── background/         # Service worker
│   ├── content/            # Content scripts (content-script.ts, translator.ts)
│   ├── options/            # Options page (React + MUI: options.tsx, OptionsApp.tsx, providerMeta.ts)
│   ├── popup/              # Popup UI (React + MUI: popup.tsx, PopupApp.tsx)
│   ├── providers/          # AI providers (base-provider.ts, index.ts, one file per provider)
│   ├── prompts/            # Prompt profiles (default-profile.ts, profiles/<model>.ts, index.ts)
│   ├── ui/                 # Shared MUI theme and design tokens
│   ├── types/              # Shared TypeScript types (settings.ts, etc.)
│   ├── utils/              # Shared utilities (storage, i18n, dom-manager, const-variables)
│   └── locales/            # i18n resources (en, ja, zh, ko, es, fr, de, it, pt, ru, ar, hi)
├── icons/                  # Extension icons
├── scripts/                # Build / packaging / version-sync scripts
├── Documents/              # Documentation
├── manifest.json           # Chrome / Edge (MV3)
├── manifest.firefox.json   # Firefox (MV2)
├── vite.config.ts          # Chrome / Edge build config
├── vite.firefox.config.ts  # Firefox build config
├── dist/                   # Chrome build output
└── dist-firefox/           # Firefox build output
```

## Adding a Provider

1. Create `src/providers/your-provider.ts`:

   ```ts
   import { BaseProvider } from './base-provider';

   export class YourProvider extends BaseProvider {
     constructor(config) {
       super(config);
       this.name = 'your-provider';
     }

     validateConfig() {
       return !!this.config.apiKey;
     }

     async translate(texts: string[], targetLanguage: string, sourceLanguage = 'auto') {
       // Implementation
     }

     async getModels() {
       // Implementation
     }
   }
   ```

2. Register it in the `PROVIDERS` map in `src/providers/index.ts`
3. Add field metadata in `src/options/providerMeta.ts` (the options UI renders from this)
4. Provide defaults in `src/utils/storage.ts` (`createProviderDefaults`) and add the name to `PROVIDER_ORDER` in `src/utils/const-variables.ts`

## Updating Icons

The extension ships PNG icons in `icons/` at four sizes (16, 32, 48, 128),
referenced by both manifests. Regenerate them from a single high-resolution
master image (`icon.png`, 512x512) with [ImageMagick](https://imagemagick.org/).

ImageMagick v7 uses the `magick` command (v6 uses `convert`).

PowerShell (this repo's default shell):

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

- `-filter Lanczos` keeps small sizes crisp; `-strip` removes metadata to shrink files.
- Transparency in the source PNG is preserved. To force a white background instead, add `-background white -flatten`.
- If you add or remove icon sizes, update the `icons` / `action.default_icon` entries in both `manifest.json` and `manifest.firefox.json`.

## Debugging

### Background

- Chrome/Edge: `chrome://extensions/` → extension card → **Service Worker**
- Firefox: `about:debugging` → **Inspect**

### Content Scripts

- Open any page, press F12, check the Console tab

### Popup / Options

- Right-click the UI → **Inspect**
