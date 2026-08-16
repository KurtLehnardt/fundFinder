import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Static-scan test (INV-7) — independent of the ESLint rule
 * (`eslint.config.js`'s `no-restricted-globals`/`no-restricted-syntax`), so a
 * disabled/misconfigured lint rule still fails the build. Greps every `.ts`/
 * `.tsx` file under `src/background/**` and `src/content/**` for network-
 * capable globals: `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`.
 */

const NETWORK_PATTERNS: RegExp[] = [
  /\bfetch\s*\(/,
  /\bnew\s+XMLHttpRequest\b/,
  /\bXMLHttpRequest\b/,
  /\bnew\s+WebSocket\b/,
  /\bWebSocket\b/,
  /\.sendBeacon\s*\(/,
  /\bnavigator\.sendBeacon\b/,
];

const SCAN_ROOTS = ["src/background", "src/content"];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("INV-7 static scan — zero network egress in background/content scripts", () => {
  const files = SCAN_ROOTS.flatMap((root) => listFiles(join(process.cwd(), root)));

  test("scans at least one file per directory (sanity — the scan isn't vacuous)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files.map((f) => [f] as const))("%s contains no network-capable global usage", (file) => {
    // Strip comments and string literals containing the word "fetch" etc. in
    // documentation prose (this codebase's own doc comments reference fetch/
    // XHR/WebSocket/sendBeacon BY NAME to explain the ban) — only flag actual
    // CODE usage, i.e. lines outside of `/* */` and `//` comments.
    const source = readFileSync(file, "utf8");
    const codeOnly = stripComments(source);
    const violations = NETWORK_PATTERNS.filter((re) => re.test(codeOnly));
    expect(violations).toEqual([]);
  });
});

/**
 * Minimal comment stripper — good enough for this scan (not a full parser).
 * The negative lookbehind on `//` avoids treating a `://` inside a URL
 * literal (e.g. `"https://www.grants.gov/*"`) as the start of a line
 * comment, which would otherwise silently truncate — and hide violations on
 * — the rest of that line.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
    .replace(/(?<!:)\/\/.*$/gm, ""); // line comments (not preceded by ':')
}
