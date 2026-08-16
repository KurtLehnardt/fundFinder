/**
 * Per-portal content-script entry point for Grants.gov. This file is
 * deliberately its own bundler entry (not a shared reference to
 * `runtime.ts`) so `@crxjs/vite-plugin` emits a SEPARATE build chunk per
 * portal, each with its own `web_accessible_resources` match scoped to that
 * portal's own origins. When multiple `manifest.content_scripts` entries
 * point at the exact same source file, the plugin's chunk-resource matching
 * only ends up granting the LAST-registered portal's origins access to
 * shared dynamically-imported chunks (e.g. `navigator.ts`) — silently
 * breaking content-script initialization on every other portal via a failed
 * `import()` at runtime. Splitting into one entry file per portal (all
 * importing the SAME shared `../runtime`) keeps the actual logic in one
 * place while giving each portal its own correctly-scoped resource grant.
 */
import "../runtime";
