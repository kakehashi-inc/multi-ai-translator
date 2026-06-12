/**
 * Generate src/scss/_tokens.scss from src/ui/design-tokens.ts
 *
 * design-tokens.ts is the single source of truth for visual style.
 * This script flattens the tokens object into SCSS variables that
 * SCSS files can `@use` via `src/scss/_tokens.scss`.
 *
 * The generated file is written under src/scss/ and is gitignored;
 * yarn build* runs this script before invoking Vite.
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const tokensSourcePath = resolve(projectRoot, 'src/ui/design-tokens.ts');
const outputDir = resolve(projectRoot, 'src/scss');
const outputPath = resolve(outputDir, '_tokens.scss');

const require = createRequire(import.meta.url);

async function loadTokens() {
  // Strip TypeScript types via a tiny inline transform: design-tokens.ts only
  // uses `as const` and a single `type DesignTokens` line, so we can convert
  // it to a runtime-loadable JS module without a TS compiler.
  const { readFileSync } = await import('fs');
  let source = readFileSync(tokensSourcePath, 'utf8');

  // Remove "as const" and TypeScript-only `type` / `export type` lines.
  source = source.replace(/\bas const\b/g, '');
  source = source.replace(/^\s*export\s+type[^\n]*$/gm, '');
  source = source.replace(/^\s*type\s[^\n]*$/gm, '');

  // Write to a temp .mjs and import it.
  const tmpPath = resolve(projectRoot, 'node_modules/.cache/design-tokens.mjs');
  mkdirSync(dirname(tmpPath), { recursive: true });
  writeFileSync(tmpPath, source, 'utf8');

  const mod = await import(pathToFileURL(tmpPath).href);
  return mod.tokens;
}

function toKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function flatten(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const name = prefix ? `${prefix}-${toKebab(key)}` : toKebab(key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out.push(...flatten(value, name));
    } else {
      out.push([name, value]);
    }
  }
  return out;
}

function formatValue(name, value) {
  // Treat keys under "space" or "radius" as pixel values
  if (typeof value === 'number') {
    if (name.startsWith('space-') || name.startsWith('radius-')) {
      return `${value}px`;
    }
    return String(value);
  }
  return String(value);
}

function buildScss(tokens) {
  const flat = flatten(tokens);
  const lines = [
    '// AUTO-GENERATED — DO NOT EDIT.',
    '// Source: src/ui/design-tokens.ts',
    '// Run `yarn tokens:generate` (or any `yarn build*`) to regenerate.',
    ''
  ];
  for (const [name, value] of flat) {
    lines.push(`$${name}: ${formatValue(name, value)};`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const tokens = await loadTokens();
  const scss = buildScss(tokens);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, scss, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[tokens] wrote ${outputPath}`);
}

main().catch((error) => {
  console.error('[tokens] generation failed:', error);
  process.exitCode = 1;
});
