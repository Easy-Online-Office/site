/* scripts/verify-nav.js
 *
 * Validates that every *.html file is enrolled in nav automation and
 * contains the canonical nav block. Also validates header enforcement:
 *  - index.html: header is OPTIONAL (not enforced)
 *  - all other HTML pages: must contain header markers and a Dashboard button link.
 *
 * Checks:
 *  1) Enrollment marker exists: <!-- NAV_SYNC: scripts/sync-nav.js -->
 *  2) NAV markers exist: <!-- NAV:START --> ... <!-- NAV:END -->
 *  3) The nav block matches partials/nav.html exactly (normalized)
 *  4) (Except index.html) header markers exist: <!-- HEADER:START --> ... <!-- HEADER:END -->
 *  5) (Except index.html) header contains Dashboard link to index.html
 *
 * Usage:
 *  node scripts/verify-nav.js
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const NAV_TEMPLATE_PATH = path.join(REPO_ROOT, "partials", "nav.html");

const NAV_START = "<!-- NAV:START -->";
const NAV_END = "<!-- NAV:END -->";
const NAV_SYNC_MARKER = "<!-- NAV_SYNC: scripts/sync-nav.js -->";

const HEADER_START = "<!-- HEADER:START -->";
const HEADER_END = "<!-- HEADER:END -->";

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

function normalize(s) {
  return s.replace(/\r\n/g, "\n").trim();
}

function extractBlock(html, startMarker, endMarker) {
  const s = html.indexOf(startMarker);
  const e = html.indexOf(endMarker);
  if (s === -1 || e === -1 || e < s) return null;
  return html.slice(s, e + endMarker.length);
}

function main() {
  if (!fs.existsSync(NAV_TEMPLATE_PATH)) {
    console.error(`❌ Missing ${path.relative(REPO_ROOT, NAV_TEMPLATE_PATH)}.`);
    console.error(`Fix: run "node scripts/sync-nav.js" first so partials/nav.html is generated.`);
    process.exit(1);
  }

  const canonicalNav = normalize(fs.readFileSync(NAV_TEMPLATE_PATH, "utf8"));
  const htmlFiles = listHtmlFilesRecursive(REPO_ROOT);

  const failures = [];

  for (const file of htmlFiles) {
    const rel = path.relative(REPO_ROOT, file);

    // Don't validate the nav partial as a "page"
    if (path.resolve(file) === path.resolve(NAV_TEMPLATE_PATH)) continue;

    const filename = path.basename(file).toLowerCase();
    const isIndex = filename === "index.html";

    const html = fs.readFileSync(file, "utf8");

    // 1) Enrollment marker
    if (!html.includes(NAV_SYNC_MARKER)) {
      failures.push({ file: rel, issue: "Missing NAV_SYNC marker (page not enrolled)." });
      continue;
    }

    // 2) NAV markers
    const navBlock = extractBlock(html, NAV_START, NAV_END);
    if (!navBlock) {
      failures.push({ file: rel, issue: "Missing NAV markers (NAV:START/NAV:END)." });
      continue;
    }

    // 3) Canonical nav match
    if (normalize(navBlock) !== canonicalNav) {
      failures.push({ file: rel, issue: "Nav block differs from partials/nav.html canonical nav." });
      continue;
    }

    // 4/5) Header enforcement (except index.html)
    if (!isIndex) {
      const headerBlock = extractBlock(html, HEADER_START, HEADER_END);
      if (!headerBlock) {
        failures.push({ file: rel, issue: "Missing HEADER markers (HEADER:START/HEADER:END) on non-index page." });
        continue;
      }

      // Must contain Dashboard link
      if (!/href\s*=\s*["']index\.html["']/i.test(headerBlock)) {
        failures.push({ file: rel, issue: 'Header missing Dashboard link to index.html.' });
        continue;
      }
    }
  }

  if (failures.length) {
    console.error("\n❌ VERIFICATION FAILED\n");
    for (const f of failures) console.error(`- ${f.file}: ${f.issue}`);
    console.error(`\nFix: run "node scripts/sync-nav.js" and commit the changes.\n`);
    process.exit(2);
  }

  console.log("✅ VERIFICATION PASSED: All HTML pages are enrolled, nav is canonical, and headers are enforced.");
}

main();