#!/usr/bin/env node
/* eslint-disable no-console */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const DEFAULT_GLOB_EXT = ".html";

// Basic HTML void elements
const VOID_TAGS = new Set([
  "area","base","br","col","embed","hr","img","input","link","meta",
  "param","source","track","wbr"
]);

// Tags we will track for balancing.
// You can widen this, but keeping it to "div" is safest for your current failure mode.
const BALANCE_TAGS = new Set(["div"]);

// Encoding fixups we *know* you have in the repo
const ENCODING_FIXUPS = [
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€\"", "—"],
  ["â€'", "’"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€˜", "‘"],
  ["â€¦", "…"],
  ["Â£", "£"],
  ["â‚¬", "€"],
  ["Â ", " "],
  ["â†’", "→"],
  ["â†", "←"],
  ["âˆ’", "−"],
  ["â€\"", "—"],
];

// Conservative “spec-char-escape” helper:
// only escapes raw < and > that appear inside TEXT NODES (not tags, not scripts/styles).
function escapeTextNodeAngles(html) {
  let out = "";
  let i = 0;
  let inTag = false;
  let inComment = false;
  let inScript = false;
  let inStyle = false;

  const startsWithAt = (s, idx) => html.slice(idx, idx + s.length).toLowerCase() === s;

  while (i < html.length) {
    const ch = html[i];

    // comment handling
    if (!inTag && startsWithAt("<!--", i)) {
      inComment = true;
      out += "<!--";
      i += 4;
      continue;
    }
    if (inComment) {
      if (startsWithAt("-->", i)) {
        inComment = false;
        out += "-->";
        i += 3;
      } else {
        out += ch;
        i += 1;
      }
      continue;
    }

    // tag boundaries
    if (!inTag && ch === "<") {
      // detect script/style open/close tags by raw text (simple but effective)
      if (startsWithAt("<script", i)) inScript = true;
      if (startsWithAt("<style", i)) inStyle = true;
      if (startsWithAt("</script", i)) inScript = false;
      if (startsWithAt("</style", i)) inStyle = false;

      inTag = true;
      out += ch;
      i += 1;
      continue;
    }
    if (inTag && ch === ">") {
      inTag = false;
      out += ch;
      i += 1;
      continue;
    }

    // inside script/style: do not touch
    if (inScript || inStyle) {
      out += ch;
      i += 1;
      continue;
    }

    // in text node: escape < and >
    if (!inTag) {
      if (ch === "<") out += "&lt;";
      else if (ch === ">") out += "&gt;";
      else out += ch;
      i += 1;
      continue;
    }

    // inside a tag: leave untouched
    out += ch;
    i += 1;
  }

  return out;
}

// Tokenize tags with a minimal state machine (safe enough for balancing divs).
function balanceTags(html) {
  let out = "";
  let i = 0;

  // Stack of open tags we are balancing (only div by default)
  const stack = [];

  const lower = (s) => s.toLowerCase();

  // Skip balancing inside these blocks
  let inScript = false;
  let inStyle = false;

  while (i < html.length) {
    const ch = html[i];

    if (ch !== "<") {
      out += ch;
      i += 1;
      continue;
    }

    // Handle comments
    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, end + 3);
      i = end + 3;
      continue;
    }

    // Find end of tag
    const endTag = html.indexOf(">", i + 1);
    if (endTag === -1) {
      out += html.slice(i);
      break;
    }

    const rawTag = html.slice(i, endTag + 1);
    const rawLower = lower(rawTag);

    // Script/style state (do not balance within)
    if (rawLower.startsWith("<script")) inScript = true;
    if (rawLower.startsWith("</script")) inScript = false;
    if (rawLower.startsWith("<style")) inStyle = true;
    if (rawLower.startsWith("</style")) inStyle = false;

    // If inside script/style, just pass through
    if (inScript || inStyle) {
      out += rawTag;
      i = endTag + 1;
      continue;
    }

    // Parse tag name
    const isClose = rawLower.startsWith("</");
    const isDoctype = rawLower.startsWith("<!doctype");
    const isDirective = rawLower.startsWith("<!") && !isDoctype; // <!— etc already handled
    const isProcessing = rawLower.startsWith("<?");

    if (isDoctype || isDirective || isProcessing) {
      out += rawTag;
      i = endTag + 1;
      continue;
    }

    // Extract name
    let name = "";
    if (isClose) {
      name = rawLower.slice(2).replace(/[\s>\/].*$/, "");
    } else {
      name = rawLower.slice(1).replace(/[\s>\/].*$/, "");
    }

    if (!name) {
      out += rawTag;
      i = endTag + 1;
      continue;
    }

    // Void tags (ignore)
    if (!isClose && VOID_TAGS.has(name)) {
      out += rawTag;
      i = endTag + 1;
      continue;
    }

    // Self-closing
    const selfClosing = !isClose && /\/\s*>$/.test(rawTag);

    // Only balance selected tags (div)
    const shouldBalance = BALANCE_TAGS.has(name);

    if (!shouldBalance) {
      out += rawTag;
      i = endTag + 1;
      continue;
    }

    if (!isClose) {
      out += rawTag;
      if (!selfClosing) stack.push(name);
      i = endTag + 1;
      continue;
    }

    // Closing tag
    if (stack.length === 0) {
      // Orphan close: drop it (validator was complaining about these)
      i = endTag + 1;
      continue;
    }

    // Pop until matching (rare but happens when mis-nesting)
    let found = false;
    for (let s = stack.length - 1; s >= 0; s--) {
      if (stack[s] === name) {
        // Close any unclosed inner tags first
        for (let k = stack.length - 1; k > s; k--) {
          out += `</${stack[k]}>`;
        }
        stack.splice(s);
        out += rawTag;
        found = true;
        break;
      }
    }

    if (!found) {
      // Orphan close that doesn't match our tracked stack: drop
      // (keeps output stable)
    }

    i = endTag + 1;
  }

  // Close remaining tags
  while (stack.length) {
    out += `</${stack.pop()}>`;
  }

  return out;
}

function applyEncodingFixups(html) {
  let out = html;
  for (const [from, to] of ENCODING_FIXUPS) {
    out = out.split(from).join(to);
  }
  return out;
}

function listHtmlFiles(dir) {
  const files = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(DEFAULT_GLOB_EXT)) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}

function ensureBackup(filePath) {
  const bak = filePath + ".bak2";
  if (!fs.existsSync(bak)) fs.copyFileSync(filePath, bak);
}

function writeUtf8NoBom(filePath, content) {
  fs.writeFileSync(filePath, content, { encoding: "utf8" });
}

function main() {
  const args = process.argv.slice(2);
  const WRITE = args.includes("--write");
  const NO_ESCAPE = args.includes("--no-escape-text");
  const files = listHtmlFiles(ROOT);

  const report = [];
  let changedCount = 0;

  for (const f of files) {
    const before = fs.readFileSync(f, "utf8");
    let after = before;

    after = applyEncodingFixups(after);
    after = balanceTags(after);
    if (!NO_ESCAPE) after = escapeTextNodeAngles(after);

    if (after !== before) {
      changedCount++;
      if (WRITE) {
        ensureBackup(f);
        writeUtf8NoBom(f, after);
      }
      report.push({ file: path.relative(ROOT, f), changed: true });
    } else {
      report.push({ file: path.relative(ROOT, f), changed: false });
    }
  }

  const changed = report.filter(r => r.changed).length;
  console.log(`repair-html: scanned ${report.length} file(s), changed ${changed}${WRITE ? " (written)" : " (dry-run)"}`);

  // write report
  const reportPath = path.join(ROOT, "tools", "repair-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ when: new Date().toISOString(), write: WRITE, changedCount, report }, null, 2), "utf8");
  console.log(`repair-html: report -> ${path.relative(ROOT, reportPath)}`);
}

main();
