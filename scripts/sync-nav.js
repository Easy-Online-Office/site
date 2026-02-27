/* scripts/sync-nav.js
 *
 * Auto-generate navbar from root-level HTML pages, then sync into all *.html files.
 * Also enforces a standard "page header" (with Dashboard button) on all pages
 * EXCEPT index.html.
 *
 * Guarantees (after run):
 *  - partials/nav.html exists and contains canonical nav wrapped with markers:
 *      <!-- NAV:START --> ... <!-- NAV:END -->
 *  - every *.html file in repo contains:
 *      1) <!-- NAV_SYNC: scripts/sync-nav.js -->  (enrollment marker in <head>)
 *      2) canonical nav between NAV markers
 *      3) standard header inserted after <body> (except index.html)
 *
 * Nav source-of-truth:
 *  - root-level index.html + any root-level easy-*.html files (alphabetical)
 *
 * Usage:
 *  node scripts/sync-nav.js
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const PARTIALS_DIR = path.join(REPO_ROOT, "partials");
const NAV_TEMPLATE_PATH = path.join(PARTIALS_DIR, "nav.html");

const NAV_START = "<!-- NAV:START -->";
const NAV_END = "<!-- NAV:END -->";
const NAV_SYNC_MARKER = "<!-- NAV_SYNC: scripts/sync-nav.js -->";

// Header enforcement (except index.html)
const HEADER_START = "<!-- HEADER:START -->";
const HEADER_END = "<!-- HEADER:END -->";

function buildHeaderHtml(pageTitle) {
  // pageTitle is a human label like "Invoice", "Purchase Order", etc.
  // Keep classes consistent with your UI screenshot style.
  return `${HEADER_START}
<div class="bg-gray-100 border-b px-6 py-4 flex justify-between items-center">
  <div>
    <h1 class="text-2xl font-bold text-blue-600">${escapeHtml(pageTitle)}</h1>
    <p class="text-sm text-gray-600">Feature-Rich Document Generator</p>
  </div>

  <div class="flex items-center gap-3">
    <a href="index.html" class="px-4 py-2 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700">Dashboard</a>
    <button class="px-4 py-2 bg-white border rounded shadow-sm hover:bg-gray-50" data-action="save">Save</button>
    <button class="px-4 py-2 bg-white border rounded shadow-sm hover:bg-gray-50" data-action="load">Load</button>
    <button class="px-4 py-2 bg-white border rounded shadow-sm hover:bg-gray-50" data-action="reset">Reset</button>
  </div>
</div>
${HEADER_END}
`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// -----------------------------
// File discovery
// -----------------------------
function listHtmlFilesRecursive(dir) {
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const it of items) {
    const full = path.join(dir, it.name);

    if (it.isDirectory()) {
      if ([".git", "node_modules", "dist", "build", ".github"].includes(it.name)) continue;
      out.push(...listHtmlFilesRecursive(full));
      continue;
    }

    if (it.isFile() && it.name.toLowerCase().endsWith(".html")) out.push(full);
  }

  return out;
}

// -----------------------------
// Nav generation
// -----------------------------
function labelFromFilename(filename) {
  const base = filename.replace(/\.html$/i, "");

  if (base.toLowerCase() === "index") return "Easy&nbsp;Suite";

  if (base.toLowerCase().startsWith("easy-")) {
    const words = base
      .replace(/^easy-/i, "")
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join("&nbsp;");
  }

  return base.charAt(0).toUpperCase() + base.slice(1);
}

function humanTitleFromFilename(filename) {
  const base = filename.replace(/\.html$/i, "");

  if (base.toLowerCase() === "index") return "Dashboard";

  if (base.toLowerCase().startsWith("easy-")) {
    const words = base
      .replace(/^easy-/i, "")
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
    return words.join(" ");
  }

  return base.charAt(0).toUpperCase() + base.slice(1);
}

function buildNavTemplate(navLinks) {
  const linkHtml = navLinks
    .map((l) => {
      if (l.href.toLowerCase() === "index.html") {
        return `    <a data-safe-link href="index.html" class="font-black text-xl mr-4">Easy&nbsp;Suite</a>`;
      }
      return `    <a data-safe-link href="${l.href}" class="hover:underline">${l.label}</a>`;
    })
    .join("\n");

  return `${NAV_START}
<nav class="bg-blue-600 text-white py-4 no-print">
  <div class="container mx-auto px-4 flex flex-wrap items-center gap-4">
${linkHtml}
  </div>
</nav>
${NAV_END}
`;
}

// -----------------------------
// Injection helpers
// -----------------------------
function ensureMarkerInHead(html) {
  if (html.includes(NAV_SYNC_MARKER)) return html;

  const headOpen = /<head\b[^>]*>/i;
  const match = html.match(headOpen);
  if (match && typeof match.index === "number") {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + "\n  " + NAV_SYNC_MARKER + "\n" + html.slice(insertAt);
  }

  return NAV_SYNC_MARKER + "\n" + html;
}

function ensureNavMarkersPresent(html) {
  if (html.includes(NAV_START) && html.includes(NAV_END)) return html;

  const navRegex = /<nav\b[\s\S]*?<\/nav>/i;
  const m = html.match(navRegex);
  if (m) {
    const wrapped = `${NAV_START}\n${m[0]}\n${NAV_END}`;
    return html.replace(navRegex, wrapped);
  }

  const bodyOpen = /<body\b[^>]*>/i;
  const bm = html.match(bodyOpen);
  if (bm && typeof bm.index === "number") {
    const insertAt = bm.index + bm[0].length;
    const placeholder = `\n${NAV_START}\n<nav class="bg-blue-600 text-white py-4 no-print"><div class="container mx-auto px-4 flex flex-wrap items-center gap-4"></div></nav>\n${NAV_END}\n`;
    return html.slice(0, insertAt) + placeholder + html.slice(insertAt);
  }

  const placeholder = `${NAV_START}\n<nav class="bg-blue-600 text-white py-4 no-print"><div class="container mx-auto px-4 flex flex-wrap items-center gap-4"></div></nav>\n${NAV_END}\n`;
  return placeholder + html;
}

function replaceBetweenMarkers(html, startMarker, endMarker, replacementBlock) {
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

  const before = html.slice(0, startIdx);
  const after = html.slice(endIdx + endMarker.length);
  return before + replacementBlock + after;
}

function ensureHeaderPresent(html, headerHtml) {
  // If header markers exist, replace block
  if (html.includes(HEADER_START) && html.includes(HEADER_END)) {
    const replaced = replaceBetweenMarkers(html, HEADER_START, HEADER_END, headerHtml);
    return replaced ?? html;
  }

  // Otherwise insert header after <body ...>
  const bodyOpen = /<body\b[^>]*>/i;
  const bm = html.match(bodyOpen);
  if (bm && typeof bm.index === "number") {
    const insertAt = bm.index + bm[0].length;
    return html.slice(0, insertAt) + "\n" + headerHtml + html.slice(insertAt);
  }

  // Fallback: prepend
  return headerHtml + "\n" + html;
}

// -----------------------------
// Main
// -----------------------------
function main() {
  if (!fs.existsSync(PARTIALS_DIR)) fs.mkdirSync(PARTIALS_DIR, { recursive: true });

  // Build nav ONLY from root-level HTML files
  const rootHtmlFiles = fs
    .readdirSync(REPO_ROOT)
    .filter((f) => f.toLowerCase().endsWith(".html"));

  const navFiles = rootHtmlFiles
    .filter((f) => {
      const b = f.toLowerCase();
      return b === "index.html" || b.startsWith("easy-");
    })
    .sort((a, b) => a.localeCompare(b));

  const links = [
    { href: "index.html", label: "Easy&nbsp;Suite" },
    ...navFiles
      .filter((f) => f.toLowerCase() !== "index.html")
      .map((f) => ({ href: f, label: labelFromFilename(f) })),
  ];

  const navTemplate = buildNavTemplate(links);

  // Write canonical nav template
  fs.writeFileSync(NAV_TEMPLATE_PATH, navTemplate, "utf8");

  const allHtmlFiles = listHtmlFilesRecursive(REPO_ROOT);

  let changed = 0;
  let skipped = 0;

  for (const file of allHtmlFiles) {
    if (path.resolve(file) === path.resolve(NAV_TEMPLATE_PATH)) continue;

    const filename = path.basename(file);
    const isIndex = filename.toLowerCase() === "index.html";

    const original = fs.readFileSync(file, "utf8");

    // 1) Ensure enrollment marker
    let working = ensureMarkerInHead(original);

    // 2) Ensure nav markers and replace nav block
    working = ensureNavMarkersPresent(working);
    let updated = replaceBetweenMarkers(working, NAV_START, NAV_END, navTemplate);

    if (updated === null) {
      // Should be rare after ensureNavMarkersPresent; treat as skip
      skipped++;
      continue;
    }

    // 3) Enforce header (except index.html)
    if (!isIndex) {
      const pageTitle = humanTitleFromFilename(filename);
      const headerHtml = buildHeaderHtml(pageTitle);
      updated = ensureHeaderPresent(updated, headerHtml);
    }

    // 4) Ensure marker remains
    updated = ensureMarkerInHead(updated);

    if (updated !== original) {
      fs.writeFileSync(file, updated, "utf8");
      changed++;
      console.log(`UPDATED: ${path.relative(REPO_ROOT, file)}`);
    }
  }

  console.log(`\nNav generated: ${path.relative(REPO_ROOT, NAV_TEMPLATE_PATH)}`);
  console.log(`Done. Changed: ${changed}, Skipped: ${skipped}`);
}

main();