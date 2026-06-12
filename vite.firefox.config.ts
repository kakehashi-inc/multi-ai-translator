import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { build as esbuildBuild } from 'esbuild';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { PluginOption } from 'vite';

/**
 * Stub Node.js builtin imports (e.g. `node:fs`, `node:path`) with an empty module.
 *
 * Some dependencies (such as `@anthropic-ai/sdk`) reference Node builtins from
 * code paths that never run inside a browser extension (e.g. file-based
 * credential loading). esbuild's `platform: 'browser'` still tries to resolve
 * those dynamic imports and fails. Resolving them to an empty module keeps the
 * unused code paths inert while allowing the bundle to build.
 */
function stubNodeBuiltinsPlugin(): EsbuildPlugin {
  return {
    name: 'stub-node-builtins',
    setup(build) {
      build.onResolve({ filter: /^node:/ }, (args) => ({
        path: args.path,
        namespace: 'stub-node-builtins'
      }));
      build.onLoad({ filter: /.*/, namespace: 'stub-node-builtins' }, () => ({
        contents: 'export default {};',
        loader: 'js'
      }));
    }
  };
}

const firefoxScriptTargets = [
  {
    entry: 'src/background/service-worker.ts',
    outfile: 'dist-firefox/assets/service-worker.js'
  },
  {
    entry: 'src/content/content-script.ts',
    outfile: 'dist-firefox/assets/content-script.js'
  }
];

function firefoxScriptsPlugin(): PluginOption {
  return {
    name: 'build-firefox-scripts',
    apply: 'build' as const,
    async writeBundle() {
      await Promise.all(
        firefoxScriptTargets.map(({ entry, outfile }) =>
          esbuildBuild({
            entryPoints: [entry],
            outfile,
            bundle: true,
            format: 'iife',
            target: 'es2020',
            platform: 'browser',
            plugins: [stubNodeBuiltinsPlugin()],
            define: {
              'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
            }
          })
        )
      );
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.firefox.json',
          dest: '.',
          rename: 'manifest.json'
        },
        {
          src: 'icons',
          dest: '.'
        },
        {
          src: 'src/locales/**/*',
          dest: '_locales',
          rename: { stripBase: 2 }
        }
      ]
    }),
    firefoxScriptsPlugin()
  ],
  build: {
    // Ensure compatibility with older browsers
    target: 'es2020',
    // Optimize output
    minify: 'esbuild',
    sourcemap: true,
    outDir: 'dist-firefox',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
        options: 'src/options/options.html'
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  },
  resolve: {
    alias: {
      // webextension-polyfill for cross-browser compatibility
      'webextension-polyfill': 'webextension-polyfill'
    }
  },
  // Ensure proper handling of web extension APIs
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  }
});
