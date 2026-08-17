// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Static-first: every marketing page is prerendered HTML (fast, cacheable, nothing
// to leak). Only the waitlist endpoint opts into on-demand rendering
// (`export const prerender = false`) so it runs as an isolated serverless function
// where a storage secret can live in the host env — never in the client bundle.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  site: 'https://angel0x1.fun',
  build: { inlineStylesheets: 'never' }, // external CSS → CSP can forbid inline scripts/styles cleanly
  devToolbar: { enabled: false },
});
