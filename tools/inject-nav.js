#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PARTIAL_PATH = path.join(ROOT, "partials", "easy-nav.html");
const SYNC_SCRIPT = '<script defer src="scripts/sync-nav.js"></script>';
const EXCLUDED_DIRECTORIES = new Set([".git", "node_modules", "partials", "brand"]);

const ENCODING_FIXUPS = new Map([
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€\"", "—"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¦", "…"],
  ["â†’", "→"],
  ["â†", "←"],
  ["âœ…", "✓"]
]);

function stripBom(value) {
  return value.replace(/^\uFEFF/, "");
}

function readNavigation() {
  if (!fs.existsSync(PARTIAL_PATH)) {
    throw new Error(`Navigation partial not found: ${path.relative(ROOT, PARTIAL_PATH)}`);
  }

  const partial = stripBom(fs.readFileSync(PARTIAL_PATH, "utf8")).trim();
  return `<!-- NAV_SYNC -->\n${partial}`;
}

function applyEncodingFixups(content) {
  let output = content;
  for (const [from, to] of ENCODING_FIXUPS) {
    output = output.split(from).join(to);
  }
  return output;
}

function removeLegacyNavigation(content) {
  let output = content;

  output = output.replace(/<!--\s*NAV:START\s*-->[\s\S]*?<!--\s*NAV:END\s*-->\s*/gi, "");
  output = output.replace(/<!--\s*NAV_SYNC\s*-->[\s\S]*?<\/nav>\s*/gi, "");
  output = output.replace(
    /<nav\b[^>]*class=(["'])[^"']*\bbg-blue-600\b[^"']*\1[^>]*>[\s\S]*?<\/nav>\s*/gi,
    ""
  );
  output = output.replace(
    /<div\b[^>]*id=(["'])easyNavMount\1[^>]*>\s*<\/div>\s*/gi,
    ""
  );
  output = output.replace(
    /<script\b[^>]*src=(["'])(?:\.\/)?scripts\/sync-nav\.js\1[^>]*>\s*<\/script>\s*/gi,
    ""
  );

  return output;
}

function collapseAdjacentMainElements(content) {
  return content.replace(
    /<main\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<main\b/gi,
    (match) => match.slice(match.toLowerCase().lastIndexOf("<main"))
  );
}

function ensureMainPairs(content) {
  const opens = (content.match(/<main\b/gi) || []).length;
  const closes = (content.match(/<\/main\s*>/gi) || []).length;

  if (opens <= closes || !/<\/body\s*>/i.test(content)) return content;

  const missing = Array.from({ length: opens - closes }, () => "</main>").join("\n");
  return content.replace(/<\/body\s*>/i, `${missing}\n</body>`);
}

function injectNavigation(content, navigation) {
  if (!/<body\b[^>]*>/i.test(content) || !/<\/body\s*>/i.test(content)) {
    return content;
  }

  let output = removeLegacyNavigation(content);
  output = collapseAdjacentMainElements(output);
  output = output.replace(/<body\b[^>]*>/i, (bodyTag) => `${bodyTag}\n${navigation}`);
  output = ensureMainPairs(output);
  output = output.replace(/<\/body\s*>/i, `${SYNC_SCRIPT}\n</body>`);
  return output;
}

function listHtmlFiles(directory) {
  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRECTORIES.has(entry.name)) files.push(...listHtmlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
}

function processFile(filePath, navigation) {
  const before = stripBom(fs.readFileSync(filePath, "utf8"));
  const repaired = applyEncodingFixups(before);
  const after = injectNavigation(repaired, navigation);

  if (after === before) return false;
  fs.writeFileSync(filePath, after, "utf8");
  return true;
}

function main() {
  const navigation = readNavigation();
  const files = listHtmlFiles(ROOT);
  let changed = 0;

  for (const filePath of files) {
    if (processFile(filePath, navigation)) changed += 1;
  }

  console.log(`Navigation enforcement complete: scanned ${files.length} document(s), updated ${changed}.`);
}

main();
