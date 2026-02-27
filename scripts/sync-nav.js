const fs = require("fs");
const path = require("path");

const REPO_ROOT = process.cwd();
const PARTIALS_DIR = path.join(REPO_ROOT, "partials");
const NAV_TEMPLATE_PATH = path.join(PARTIALS_DIR, "nav.html");

function listHtmlFiles(dir) {
  const out = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const it of items) {
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      if ([".git", "node_modules", "dist", "build", ".github"].includes(it.name)) continue;
      out.push(...listHtmlFiles(full));
      continue;
    }
    if (it.isFile() && it.name.toLowerCase().endsWith(".html")) out.push(full);
  }
  return out;
}

function titleFromFilename(file) {
  const base = path.basename(file, ".html");

  if (base === "index") return "Easy&nbsp;Suite";
  if (base.startsWith("easy-")) {
    const words = base.replace(/^easy-/, "").split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1));
    // preserve nbsp for two-word common labels if you want; otherwise just spaces
    return words.join("&nbsp;");
  }
  // fallback
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function buildNav(links) {
  const linkHtml = links.map(l => {
    if (l.href === "index.html") {
      return `    <a data-safe-link href="index.html" class="font-black text-xl mr-4">Easy&nbsp;Suite</a>`;
    }
    return `    <a data-safe-link href="${l.href}" class="hover:underline">${l.label}</a>`;
  }).join("\n");

  return `<!-- NAV:START -->
<nav class="bg-blue-600 text-white py-4 no-print">
  <div class="container mx-auto px-4 flex flex-wrap items-center gap-4">
${linkHtml}
  </div>
</nav>
<!-- NAV:END -->
`;
}

function replaceBetweenMarkers(html, navTemplate) {
  const start = "<!-- NAV:START -->";
  const end = "<!-- NAV:END -->";
  const startIdx = html.indexOf(start);
  const endIdx = html.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  const before = html.slice(0, startIdx);
  const after = html.slice(endIdx + end.length);
  return before + navTemplate + after;
}

function replaceFirstNavTag(html, navTemplate) {
  const navRegex = /<nav\b[\s\S]*?<\/nav>/i;
  if (!navRegex.test(html)) return null;
  const navNoMarkers = navTemplate
    .replace("<!-- NAV:START -->", "")
    .replace("<!-- NAV:END -->", "")
    .trim() + "\n";
  return html.replace(navRegex, navNoMarkers);
}

function main() {
  if (!fs.existsSync(PARTIALS_DIR)) fs.mkdirSync(PARTIALS_DIR, { recursive: true });

  // Build nav list from root-level pages only (recommended)
  const rootFiles = fs.readdirSync(REPO_ROOT)
    .filter(f => f.toLowerCase().endsWith(".html"))
    .map(f => path.join(REPO_ROOT, f));

  // Pick index.html + easy-*.html (you can expand patterns here)
  const navPages = rootFiles
    .filter(f => {
      const b = path.basename(f).toLowerCase();
      return b === "index.html" || b.startsWith("easy-");
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

  // Force index first
  const links = [
    { href: "index.html", label: "Easy&nbsp;Suite" },
    ...navPages
      .filter(f => path.basename(f).toLowerCase() !== "index.html")
      .map(f => ({
        href: path.basename(f),
        label: titleFromFilename(f)
      }))
  ];

  const navTemplate = buildNav(links);
  fs.writeFileSync(NAV_TEMPLATE_PATH, navTemplate, "utf8");

  // Now sync into all html files
  const allHtml = listHtmlFiles(REPO_ROOT);

  let changed = 0;
  let skipped = 0;

  for (const file of allHtml) {
    if (file === NAV_TEMPLATE_PATH) continue;

    const original = fs.readFileSync(file, "utf8");

    let updated = replaceBetweenMarkers(original, navTemplate);
    if (updated === null) updated = replaceFirstNavTag(original, navTemplate);

    if (updated === null) { skipped++; continue; }

    if (updated !== original) {
      fs.writeFileSync(file, updated, "utf8");
      changed++;
      console.log(`UPDATED: ${path.relative(REPO_ROOT, file)}`);
    }
  }

  console.log(`\nNav generated at partials/nav.html`);
  console.log(`Done. Changed: ${changed}, Skipped: ${skipped}`);
}

main();
