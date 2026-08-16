import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Drift-guard (spec §9.4, T3). Reads the scaffold originals from the SAME
 * worktree (`../scaffold/lib/contracts/*`, `../scaffold/lib/apply/package.ts`,
 * relative to `extension/`) and asserts the vendored copies under
 * `src/lib/contracts/` match by NORMALIZED-hash equality (comments and
 * incidental whitespace stripped — the vendored files carry an additional
 * "VENDORED COPY" header comment scaffold's originals don't have, and for
 * `package.ts` only specific symbols are vendored, not the whole file, so
 * comparison is symbol-scoped there).
 *
 * Per spec §9.4: SKIP with a clear warning (not a hard failure) if
 * `../scaffold` is absent, so the extension still builds/tests standalone
 * outside this monorepo worktree.
 */

const SCAFFOLD_ROOT = join(process.cwd(), "..", "scaffold");
const scaffoldAvailable = existsSync(SCAFFOLD_ROOT);

/** Strip comments and collapse whitespace so incidental formatting never causes a false drift signal. */
function normalize(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Extract a top-level `export const|interface|type|function <name> ...` block, up to the next top-level export. */
function extractExportBlock(source: string, name: string): string {
  const lines = source.split("\n");
  const startPattern = new RegExp(`^export\\s+(const|interface|type|function)\\s+${name}\\b`);
  const startIdx = lines.findIndex((l) => startPattern.test(l));
  if (startIdx === -1) {
    throw new Error(`Could not find "export ... ${name}" in source (scaffold export renamed/removed?).`);
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^export\s/.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

const describeOrSkip = scaffoldAvailable ? describe : describe.skip;

if (!scaffoldAvailable) {
  console.warn(
    `[contractDrift] SKIPPING: ../scaffold not found at ${SCAFFOLD_ROOT}. ` +
      "This is expected when extension/ is built standalone outside the fundFinder monorepo worktree; " +
      "the drift-guard only runs when scaffold/ is a sibling directory.",
  );
}

describeOrSkip("contract drift-guard (spec §9.4) — vendored copies match scaffold originals", () => {
  test("applicationDraft.ts — whole-file normalized match", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/contracts/applicationDraft.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/applicationDraft.ts"), "utf8");
    expect(await sha256Hex(normalize(vendoredSrc))).toBe(await sha256Hex(normalize(scaffoldSrc)));
  });

  test("applicationForms.ts — whole-file normalized match (the load-bearing honesty contract)", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/contracts/applicationForms.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/applicationForms.ts"), "utf8");
    expect(await sha256Hex(normalize(vendoredSrc))).toBe(await sha256Hex(normalize(scaffoldSrc)));
  });

  test("applicationBudget.ts — whole-file normalized match", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/contracts/applicationBudget.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/applicationBudget.ts"), "utf8");
    expect(await sha256Hex(normalize(vendoredSrc))).toBe(await sha256Hex(normalize(scaffoldSrc)));
  });

  test("package.ts — AssembledPackage interface matches symbol-for-symbol", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/apply/package.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/package.ts"), "utf8");
    const scaffoldBlock = normalize(extractExportBlock(scaffoldSrc, "AssembledPackage"));
    const vendoredBlock = normalize(extractExportBlock(vendoredSrc, "AssembledPackage"));
    expect(await sha256Hex(vendoredBlock)).toBe(await sha256Hex(scaffoldBlock));
  });

  test("package.ts — AOR_HANDOFF matches symbol-for-symbol (the terminal-panel copy source of truth)", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/apply/package.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/package.ts"), "utf8");
    const scaffoldBlock = normalize(extractExportBlock(scaffoldSrc, "AOR_HANDOFF"));
    const vendoredBlock = normalize(extractExportBlock(vendoredSrc, "AOR_HANDOFF"));
    expect(await sha256Hex(vendoredBlock)).toBe(await sha256Hex(scaffoldBlock));
  });

  test("package.ts — PACKAGE_INTRO matches symbol-for-symbol", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/apply/package.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/package.ts"), "utf8");
    const scaffoldBlock = normalize(extractExportBlock(scaffoldSrc, "PACKAGE_INTRO"));
    const vendoredBlock = normalize(extractExportBlock(vendoredSrc, "PACKAGE_INTRO"));
    expect(await sha256Hex(vendoredBlock)).toBe(await sha256Hex(scaffoldBlock));
  });

  test("FOUNDER_TODO_PATTERN regex literal is identical (the anti-fabrication anchor)", async () => {
    const scaffoldSrc = readFileSync(join(SCAFFOLD_ROOT, "lib/contracts/applicationDraft.ts"), "utf8");
    const vendoredSrc = readFileSync(join(process.cwd(), "src/lib/contracts/applicationDraft.ts"), "utf8");
    const extract = (src: string) => /export const FOUNDER_TODO_PATTERN = (.+);/.exec(src)?.[1];
    expect(extract(vendoredSrc)).toBe(extract(scaffoldSrc));
    expect(extract(scaffoldSrc)).toBeTruthy();
  });
});

test("scaffold-absence path is documented (meta-test; always runs)", () => {
  // This test always runs (even when scaffold/ is absent) so the suite as a
  // whole never silently reports zero tests for this file.
  expect(typeof scaffoldAvailable).toBe("boolean");
});
