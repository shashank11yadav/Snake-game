import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * Content Security Policy for the built page. It is only added at build time
 * because the dev server injects inline styles and an HMR client that a
 * strict policy would block. Everything the game needs ships from its own
 * origin, so 'self' is enough for scripts and styles.
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

function cspMeta(): Plugin {
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base: '/Snake-game/',
  plugins: [cspMeta()],
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    sourcemap: false,
  },
  preview: {
    port: 5501,
    strictPort: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
