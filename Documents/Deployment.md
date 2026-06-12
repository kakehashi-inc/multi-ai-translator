# Deployment Guide

## Building for Production

1. Build the Chrome + Firefox targets:
```bash
yarn build
```

This produces optimized bundles in `dist/` (Chrome) and `dist-firefox/` (Firefox).
Use `yarn build:chrome` or `yarn build:firefox` if you need individual builds.

2. Create distribution packages:
```bash
yarn package
```

This writes versioned ZIP files to `packages/` (the version is read from each `manifest*.json`):
- `multi-ai-translator-chrome-<version>.zip` (for Chrome / Edge) — e.g. `multi-ai-translator-chrome-0.1.2.zip`
- `multi-ai-translator-firefox-<version>.zip` (for Firefox)

## Cost Summary (as of 2026-04)

| Phase | Item | Cost |
| --- | --- | --- |
| Chrome Web Store | Developer registration (one-time) | **USD 5** |
| Chrome Web Store | Per-extension submission / hosting / updates | Free |
| Microsoft Edge Add-ons | Partner Center registration (individual developer) | Free |
| Microsoft Edge Add-ons | Submission / hosting / updates | Free |
| Firefox Add-ons (AMO) | Developer registration | Free |
| Firefox Add-ons (AMO) | Listed / Unlisted submission, signing, hosting | Free |

Notes:
- The Chrome USD 5 fee is a **one-time** charge per Google account, not per extension. One paid account can publish up to 20 extensions. The fee is the same for individual and company accounts; Google does not charge an additional company-verification fee for Chrome Web Store.
- For Microsoft Edge Add-ons, **publishing is free for both individual and company accounts** as of 2025-12 (per Microsoft Learn: *"There is no registration fee for submitting extensions to the Microsoft Edge program"*). The USD 99 Partner Center fee that some sources mention applies to other Microsoft Store programs (e.g. Windows app publishing), **not** to the Edge extensions program.
- Company (enterprise) account specifics:
  - **Chrome Web Store**: optional domain verification gives a "verified publisher" badge — this requires owning a domain (typical cost USD ~10–15/year for the domain itself, paid to your registrar, not to Google).
  - **Edge Add-ons**: company verification is free but takes longer than individual (a few days to a few weeks). Microsoft contacts a designated *company approver* by phone/email, and you may need to upload supporting documents (utility bill, DUNS ID, government records) to Partner Center → Legal info. The publisher display name must match your registered business name. Account type cannot be changed from company to individual after enrollment.
- No third-party hosting, signing certificates, or CI services are required for the standard publishing flow described below.

## Chrome Web Store

### Prerequisites
- Google account
- **USD 5** one-time developer registration fee (paid once at the registration step below)
- Prepared assets (icons, screenshots, descriptions)

### Steps

1. **Register as Developer**
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Pay registration fee ($5)
   - Accept terms

2. **Prepare Assets**

   Required icons:
   - 128x128 icon (required)
   - Screenshots: 1280x800 or 640x400 (at least 1, max 5)
   - Promotional images (optional):
     - Small: 440x280
     - Marquee: 1400x560

3. **Create New Item**
   - Click "New Item"
   - Upload the versioned ZIP from `packages/` (e.g. `multi-ai-translator-chrome-0.1.2.zip`)
   - Wait for automatic checks

4. **Fill Store Listing**

   Required fields:
   - **Name**: Multi AI Translator
   - **Summary**: Translate web pages using multiple AI providers
   - **Description**: See template below
   - **Category**: Productivity
   - **Language**: English

   Description template:
   ```
   Multi AI Translator is a powerful browser extension that allows you to translate
   web pages using multiple AI providers including OpenAI, Claude, Gemini, and Ollama.

   Key Features:
   • Support for multiple AI providers
   • Translate entire pages or selected text
   • Popup translation display
   • Restore original content
   • Customizable settings
   • Multi-language UI (English, Japanese)

   Supported Providers:
   • Gemini (Google)
   • Claude (Anthropic)
   • Anthropic-compatible APIs
   • OpenAI
   • OpenAI-compatible APIs
   • Ollama

   Privacy:
   This extension does not collect any personal data. All API keys are stored locally
   in your browser. Translation requests are sent directly to your chosen AI provider.
   ```

5. **Privacy Settings**
   - Add privacy policy (required if using network requests)
   - Explain data usage
   - Justify permissions

   Privacy policy template:
   ```
   Privacy Policy for Multi AI Translator

   Data Collection:
   This extension does not collect, store, or transmit any personal information.

   API Keys:
   All API keys are stored locally in your browser using Chrome's storage API.
   Keys are never sent to our servers.

   Translation Data:
   Translation requests are sent directly to your chosen AI provider (OpenAI, Claude, etc.)
   We do not intercept or store translation content.

   Permissions:
   • storage: To save your settings (API keys, language preferences) locally
   • activeTab: To access the active tab when the user invokes translation
   • scripting: To inject the translation logic into the current page
   • contextMenus: To provide right-click "Translate" entries
   • notifications: To show translation success or failure notifications
   • <all_urls> (host permission): To translate any webpage the user opens
   ```

   These match the permissions declared in `manifest.json` and `manifest.firefox.json`. Keep this section in sync if permissions change.

6. **Submit for Review**
   - Review all information
   - Click "Submit for Review"
   - Wait 1-3 days for approval

### After Approval

- Extension automatically goes live
- Monitor reviews and feedback
- Respond to user issues

## Microsoft Edge Add-ons

### Prerequisites
- Microsoft account
- No registration fee
- Prepared assets

### Steps

1. **Register**
   - Go to [Partner Center](https://partner.microsoft.com/dashboard)
   - Sign in with Microsoft account
   - Complete registration

2. **Submit Extension**
   - Click "New Extension"
   - Upload the versioned Chrome ZIP from `packages/` (e.g. `multi-ai-translator-chrome-0.1.2.zip`) — Edge consumes the same Chrome build
   - Fill required fields (similar to Chrome)

3. **Review Process**
   - Usually 1-7 days
   - More thorough than Chrome
   - May request changes

## Firefox Add-ons (AMO)

### Prerequisites
- Mozilla account (Firefox account)
- No registration fee
- Prepared assets (icons, screenshots, descriptions)
- The Firefox build is MV2 — `manifest.firefox.json` is bundled into `dist-firefox/` by `yarn build:firefox`

### Steps

1. **Register**
   - Go to [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
   - Sign in with a Mozilla account
   - Accept the Add-on Distribution Agreement

2. **Submit Extension**
   - Click **Submit a New Add-on**
   - Choose distribution:
     - **On this site (Listed)** — published on addons.mozilla.org, signed automatically after review
     - **On your own (Unlisted)** — only signed for self-distribution; not listed on AMO
   - Upload the versioned Firefox ZIP from `packages/` (e.g. `multi-ai-translator-firefox-0.1.2.zip`)
   - Fill in metadata (name, summary, description, categories, license, support contact)
   - Provide a source code URL or upload sources if minified/bundled code is included (Vite output qualifies — make sure the GitHub repo URL or a source archive is supplied)

3. **Review Process**
   - Automated validation runs immediately
   - Human review for Listed submissions: typically a few hours to several days
   - Unlisted submissions are usually signed within minutes
   - AMO is strict about remote code execution and minified code provenance — keep build instructions reproducible

### After Approval

- Listed add-ons go live on addons.mozilla.org automatically
- Unlisted add-ons can be downloaded as a signed `.xpi` from the Developer Hub and distributed manually

## Updating the Extension

1. **Bump the version in `package.json`** — this is the source of truth:
```json
{
  "version": "0.1.3"
}
```
   `yarn build:chrome` / `yarn build:firefox` automatically run `scripts/sync-manifest-version.js`, which propagates the version to both `manifest.json` (Chrome/Edge, MV3) and `manifest.firefox.json` (Firefox, MV2). You can also run `yarn sync:version` manually.

2. **Build and package**:
```bash
yarn build
yarn package
```
   This produces versioned ZIPs such as `multi-ai-translator-chrome-0.1.3.zip` and `multi-ai-translator-firefox-0.1.3.zip` under `packages/`.

3. **Upload new version**:
   - Chrome: Upload `multi-ai-translator-chrome-<version>.zip` to the existing item in the Developer Dashboard (no fee for updates)
   - Edge: Create a new submission in Partner Center and upload the same Chrome ZIP (no fee)
   - Firefox: Upload `multi-ai-translator-firefox-<version>.zip` as a new version of the existing add-on in the Firefox Add-ons Developer Hub (Listed goes through automated review, Unlisted is signing-only — both are free)

4. **Add release notes**:
```
Version 1.0.1
- Fixed translation error handling
- Improved performance
- Updated dependencies
```
