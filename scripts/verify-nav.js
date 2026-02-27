/* scripts/verify-nav.js
 *
 * Validates that every *.html file is enrolled in nav automation and
 * contains the canonical nav block.
 *
 * Checks:
 *  1) Enrollment marker exists: <!-- NAV_SYNC: scripts/sync-nav.js -->
 *  2) NAV markers exist: <!-- NAV:START --> ... <!-- NAV:END -->
 *  3) The nav block matches partials/nav.html exactly (normalized for line endings)
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

function extractNavBlock(html) {
  const s = html.indexOf(NAV_START);
  const e = html.indexOf(NAV_END);
  if (s === -1 || e === -1 || e < s) return null;
  return html.slice(s, e + NAV_END.length);
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

    // Don’t validate the nav partial as a “page”
    if (path.resolve(file) === path.resolve(NAV_TEMPLATE_PATH)) continue;

    const html = fs.readFileSync(file, "utf8");

    // 1) Enrollment marker
    if (!html.includes(NAV_SYNC_MARKER)) {
      failures.push({ file: rel, issue: "Missing NAV_SYNC marker (page not enrolled)." });
      continue;
    }

    // 2) NAV markers
    const navBlock = extractNavBlock(html);
    if (!navBlock) {
      failures.push({ file: rel, issue: "Missing NAV markers (NAV:START/NAV:END)." });
      continue;
    }

    // 3) Exact canonical match
    if (normalize(navBlock) !== canonicalNav) {
      failures.push({ file: rel, issue: "Nav block differs from partials/nav.html canonical nav." });
      continue;
    }
  }

  if (failures.length) {
    console.error("\n❌ NAV VERIFICATION FAILED\n");
    for (const f of failures) console.error(`- ${f.file}: ${f.issue}`);
    console.error(`\nFix: run "node scripts/sync-nav.js" and commit the changes.\n`);
    process.exit(2);
  }

  console.log("✅ NAV VERIFICATION PASSED: All HTML pages are enrolled and match canonical nav.");
}

main();
