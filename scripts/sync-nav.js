/* Auto-generate navbar from root-level HTML pages, then sync into all *.html files
 *
 * Rules:
 * - Nav includes: index.html + any root-level easy-*.html
 * - Nav label is derived from filename (easy-site-inspection.html -> Site&nbsp;Inspection)
 * - Writes canonical template to partials/nav.html
 * - Syncs into every HTML file by replacing:
 *   a) content between <!-- NAV:START --> and <!-- NAV:END --> if present
 *   b) otherwise: the first <nav>...</nav> block
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const PARTIALS_DIR = path.join(REPO_ROOT, "partials");
const NAV_TEMPLATE_PATH = path.join(PARTIALS_DIR, "nav.html");

const NAV_START = "<!-- NAV:START -->";
const NAV_END = "<!-- NAV:END -->";

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

  // fallback for any non-easy pages that might slip in
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

  const navNoMarkers = navTemplate
    .replace(NAV_START, "")
    .replace(NAV_END, "")
    .trim() + "\n";

  return html.replace(navRegex, navNoMarkers);
}

function main() {
  if (!fs.existsSync(PARTIALS_DIR)) fs.mkdirSync(PARTIALS_DIR, { recursive: true });

  // Build nav ONLY from root-level HTML files (stable + avoids nested docs getting into nav)
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
    // Don't sync into the canonical partial itself
    if (path.resolve(file) === path.resolve(NAV_TEMPLATE_PATH)) continue;

    const original = fs.readFileSync(file, "utf8");

    let updated = replaceBetweenMarkers(original, navTemplate);
    if (updated === null) updated = replaceFirstNavTag(original, navTemplate);

    if (updated === null) {
      skipped++;
      continue;
    }

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
