import { defineConfig } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest as unknown as ManifestV3Export }),
    viteStaticCopy({
      targets: [
        {
          src: 'src/locales/**/*',
          dest: '_locales',
          rename: { stripBase: 2 }
        }
      ]
    })
  ],
  css: {
    preprocessorOptions: {
      // Vite 8 routes scss to sass-embedded automatically when installed.
      // `api: 'modern-compiler'` is the recommended fast path; the property
      // is recognized at runtime even though it is not yet in the public
      // type for SassPreprocessorOptions.
      scss: {
        api: 'modern-compiler'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    }
  },
  build: {
    // Ensure compatibility with older browsers
    target: 'es2020',
    // Optimize output
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      input: {
        // CRXJS will automatically handle these from manifest.json
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
