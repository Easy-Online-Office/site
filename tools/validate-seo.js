const fs = require("fs");
const path = require("path");
const glob = require("glob");

const root = process.cwd();
const exclude = ["**/node_modules/**", "**/.git/**", "**/tools/**", "**/*.bak", "**/*.bak.html"];
const files = glob.sync("**/*.html", { cwd: root, ignore: exclude });

function has(re, s) {
  return re.test(s);
}

function report(file, issues) {
  if (!issues.length) return false;
  console.error(`\n❌ SEO validation failed: ${file}`);
  issues.forEach((i) => console.error(`  - ${i}`));
  return true;
}

let failed = false;

for (const f of files) {
  const fp = path.join(root, f);
  const html = fs.readFileSync(fp, "utf8");
  const issues = [];

  // Basic doc structure
  if (!has(/<!doctype html>/i, html)) issues.push("Missing <!DOCTYPE html>");
  if (!has(/<html[^>]*lang="/i, html)) issues.push("Missing <html lang=\"...\">");
  if (!has(/<meta[^>]*charset=/i, html)) issues.push("Missing charset meta");
  if (!has(/<meta[^>]*name=["']viewport["']/i, html)) issues.push("Missing viewport meta");

  // Title + meta description
  if (!has(/<title>[^<]{4,}<\/title>/i, html)) issues.push("Missing or too-short <title>");
  if (!has(/<meta[^>]*name=["']description["'][^>]*content=["'][^"']{30,}["']/i, html))
    issues.push("Missing or too-short meta description (min ~30 chars)");

  // One H1
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count === 0) issues.push("Missing <h1>");
  if (h1Count > 1) issues.push(`Multiple <h1> tags found (${h1Count})`);

  // Canonical (optional but recommended)
  if (!has(/<link[^>]*rel=["']canonical["']/i, html)) {
    issues.push("Missing canonical link (recommended)");
  }

  // OpenGraph (recommended)
  if (!has(/<meta[^>]*property=["']og:title["']/i, html)) issues.push("Missing og:title (recommended)");
  if (!has(/<meta[^>]*property=["']og:description["']/i, html)) issues.push("Missing og:description (recommended)");

  // Favicon
  if (!has(/<link[^>]*rel=["']icon["']/i, html)) issues.push("Missing favicon link");

  if (report(f, issues)) failed = true;
}

if (failed) process.exit(1);
console.log(`✅ SEO validation passed (${files.length} files)`);