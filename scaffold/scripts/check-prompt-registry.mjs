#!/usr/bin/env node
/**
 * check-prompt-registry — flags model-prompt strings written inline in
 * application code instead of living in `lib/prompts/registry.ts` (CON-04,
 * R10.2: "prompts are not edited inline in application code").
 *
 * Scope: any call that looks like an Anthropic SDK message-creation call
 * (`....messages.create({ ... })`) anywhere under `lib/` or `app/`, excluding
 * `lib/prompts/**` (the registry itself, which is allowed to hold prompt
 * text). Within such a call:
 *
 *   - a `system` property whose value is a literal (string / template
 *     literal), rather than a reference to a registry-loaded value
 *     (e.g. `loadPrompt(id).template`), is flagged.
 *   - a message `content` property that is a fully static string/template
 *     literal (no `${...}` interpolation) over a length threshold is
 *     flagged — a real user/data payload always interpolates request data,
 *     so a long *static* literal here is almost certainly a hand-written
 *     prompt that should be registered instead.
 *
 * This intentionally does NOT flag ordinary long strings elsewhere in the
 * codebase (UI copy, sample text, etc.) — only literals passed directly into
 * an SDK message-creation call, which is where an inline prompt would
 * actually reach the model.
 *
 * Usage: node scripts/check-prompt-registry.mjs
 * Exit code 0 = clean, 1 = violations found (or scan error).
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["lib", "app"];
const EXCLUDE_DIR_PARTS = ["node_modules", ".next", "lib/prompts"];
const LONG_STATIC_CONTENT_THRESHOLD = 120; // chars

/** @param {string} dir */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (EXCLUDE_DIR_PARTS.some((p) => rel === p || rel.startsWith(p + "/"))) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, out);
    } else if ([".ts", ".tsx"].includes(extname(full))) {
      out.push(full);
    }
  }
  return out;
}

function isStringish(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function textOf(node) {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return "";
}

function looksLikeMessagesCreateCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const calleeText = node.expression.getText();
  return /\.messages\.create$/.test(calleeText) || /\bmessages\.create$/.test(calleeText);
}

function lineOf(sf, pos) {
  const { line } = sf.getLineAndCharacterOfPosition(pos);
  return line + 1;
}

function checkFile(filePath) {
  const relPath = relative(ROOT, filePath);
  const source = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  function visitCallArgs(objArg) {
    if (!ts.isObjectLiteralExpression(objArg)) return;
    for (const prop of objArg.properties) {
      if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
      const propName = prop.name.getText();

      if (propName === "system") {
        if (isStringish(prop.initializer)) {
          violations.push({
            line: lineOf(sf, prop.initializer.getStart()),
            reason: "inline `system` prompt string — move it into lib/prompts/registry.ts and use loadPrompt(id).template",
            preview: textOf(prop.initializer).slice(0, 60).replace(/\s+/g, " "),
          });
        } else if (ts.isTemplateExpression(prop.initializer)) {
          violations.push({
            line: lineOf(sf, prop.initializer.getStart()),
            reason: "inline `system` prompt template literal — move the static text into lib/prompts/registry.ts",
            preview: prop.initializer.getText().slice(0, 60).replace(/\s+/g, " "),
          });
        }
      }

      if (propName === "messages" && ts.isArrayLiteralExpression(prop.initializer)) {
        for (const el of prop.initializer.elements) {
          if (!ts.isObjectLiteralExpression(el)) continue;
          const contentProp = el.properties.find(
            (p) => ts.isPropertyAssignment(p) && p.name?.getText() === "content"
          );
          if (!contentProp || !ts.isPropertyAssignment(contentProp)) continue;
          const init = contentProp.initializer;
          if (isStringish(init) && textOf(init).length > LONG_STATIC_CONTENT_THRESHOLD) {
            violations.push({
              line: lineOf(sf, init.getStart()),
              reason: `static message content literal (${textOf(init).length} chars, no interpolation) — a real payload interpolates request data; if this is prompt text, register it`,
              preview: textOf(init).slice(0, 60).replace(/\s+/g, " "),
            });
          }
        }
      }
    }
  }

  function visit(node) {
    if (looksLikeMessagesCreateCall(node) && node.arguments[0]) {
      visitCallArgs(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  return violations.map((v) => ({ file: relPath, ...v }));
}

function main() {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const allViolations = files.flatMap(checkFile);

  if (allViolations.length === 0) {
    console.log(`check-prompt-registry: OK — no inline prompt strings found outside lib/prompts/ (scanned ${files.length} files).`);
    process.exit(0);
  }

  console.error(`check-prompt-registry: found ${allViolations.length} inline prompt string(s) outside the registry:\n`);
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line}  ${v.reason}\n    "${v.preview}${v.preview.length >= 60 ? "…" : ""}"`);
  }
  console.error("\nRegister these in lib/prompts/registry.ts (see extractProfile/explainMatches/explainWeakField for the pattern) and load them via loadPrompt(id).template.");
  process.exit(1);
}

main();
