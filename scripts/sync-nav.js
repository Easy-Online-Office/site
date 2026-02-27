/* scripts/sync-nav.js
 *
 * Auto-generate navbar from root-level HTML pages, then sync into all *.html files.
 *
 * Guarantees (after run):
 *  - partials/nav.html exists and contains canonical nav wrapped with markers:
 *      <!-- NAV:START --> ... <!-- NAV:END -->
 *  - every *.html file in repo contains:
 *      1) <!-- NAV_SYNC: scripts/sync-nav.js -->  (enrollment marker)
 *      2) canonical nav between NAV markers (or first <nav> replaced if markers absent)
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

// -----------------------------
// File discovery
// -----------------------------
function listHtmlFilesRecursive(dir) {
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const it of items) {
    const full = path.join(dir, it.name);

    if (it.isDirectory()) {
      // Skip common noise/build dirs
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

    // Use &nbsp; for tight nav spacing
    return words.join("&nbsp;");
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
  // Ensure enrollment marker exists exactly once
  if (html.includes(NAV_SYNC_MARKER)) return html;

  // Prefer inserting inside <head> right after <head ...>
  const headOpen = /<head\b[^>]*>/i;
  const match = html.match(headOpen);
  if (match && typeof match.index === "number") {
    const insertAt = match.index + match[0].length;
    return html.slice(0, insertAt) + "\n  " + NAV_SYNC_MARKER + "\n" + html.slice(insertAt);
  }

  // Fallback: prepend to file
  return NAV_SYNC_MARKER + "\n" + html;
}

function ensureNavMarkersPresent(html) {
  // If already contains both markers, leave it
  if (html.includes(NAV_START) && html.includes(NAV_END)) return html;

  // If it contains a <nav>...</nav>, wrap the FIRST nav with markers (non-greedy)
  const navRegex = /<nav\b[\s\S]*?<\/nav>/i;
  const m = html.match(navRegex);
  if (m) {
    const wrapped = `${NAV_START}\n${m[0]}\n${NAV_END}`;
    return html.replace(navRegex, wrapped);
  }

  // If no nav exists, insert a placeholder nav block near top of <body>
  const bodyOpen = /<body\b[^>]*>/i;
  const bm = html.match(bodyOpen);
  if (bm && typeof bm.index === "number") {
    const insertAt = bm.index + bm[0].length;
    const placeholder = `\n${NAV_START}\n<nav class="bg-blue-600 text-white py-4 no-print"><div class="container mx-auto px-4 flex flex-wrap items-center gap-4"></div></nav>\n${NAV_END}\n`;
    return html.slice(0, insertAt) + placeholder + html.slice(insertAt);
  }

  // Absolute fallback: prepend placeholder
  const placeholder = `${NAV_START}\n<nav class="bg-blue-600 text-white py-4 no-print"><div class="container mx-auto px-4 flex flex-wrap items-center gap-4"></div></nav>\n${NAV_END}\n`;
  return placeholder + html;
}

function replaceBetweenMarkers(html, navTemplate) {
  const startIdx = html.indexOf(NAV_START);
  const endIdx = html.indexOf(NAV_END);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;

  const before = html.slice(0, startIdx);
  const after = html.slice(endIdx + NAV_END.length);

  return before + navTemplate + after;
}

function replaceFirstNavTag(html, navTemplate) {
  const navRegex = /<nav\b[\s\S]*?<\/nav>/i;
  if (!navRegex.test(html)) return null;

  // For fallback replacement, remove markers from template
  const navNoMarkers =
    navTemplate.replace(NAV_START, "").replace(NAV_END, "").trim() + "\n";

  return html.replace(navRegex, navNoMarkers);
}

// -----------------------------
// Main
// -----------------------------
function main() {
  if (!fs.existsSync(PARTIALS_DIR)) fs.mkdirSync(PARTIALS_DIR, { recursive: true });

  // Build nav ONLY from root-level HTML files (stable + avoids nested docs leaking into nav)
  const rootHtmlFiles = fs
    .readdirSync(REPO_ROOT)
    .filter((f) => f.toLowerCase().endsWith(".html"));

  // Include index.html + easy-*.html
  const navFiles = rootHtmlFiles
    .filter((f) => {
      const b = f.toLowerCase();
      return b === "index.html" || b.startsWith("easy-");
    })
    .sort((a, b) => a.localeCompare(b));

  // Force index first, then rest
  const links = [
    { href: "index.html", label: "Easy&nbsp;Suite" },
    ...navFiles
      .filter((f) => f.toLowerCase() !== "index.html")
      .map((f) => ({ href: f, label: labelFromFilename(f) })),
  ];

  const navTemplate = buildNavTemplate(links);

  // Write canonical template
  fs.writeFileSync(NAV_TEMPLATE_PATH, navTemplate, "utf8");

  // Sync into all HTML files across repo
  const allHtmlFiles = listHtmlFilesRecursive(REPO_ROOT);

  let changed = 0;
  let skipped = 0;

  for (const file of allHtmlFiles) {
    // Skip canonical partial itself
    if (path.resolve(file) === path.resolve(NAV_TEMPLATE_PATH)) continue;

    const original = fs.readFileSync(file, "utf8");

    // Ensure page is "enrolled" + has markers for deterministic replacement
    let working = ensureMarkerInHead(original);
    working = ensureNavMarkersPresent(working);

    // Prefer marker-based replacement
    let updated = replaceBetweenMarkers(working, navTemplate);

    // Fallback: replace first <nav> if markers not found (should be rare after ensureNavMarkersPresent)
    if (updated === null) updated = replaceFirstNavTag(working, navTemplate);

    if (updated === null) {
      skipped++;
      continue;
    }

    // Ensure marker remains (safety)
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
