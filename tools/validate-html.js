const fs = require("fs");
const path = require("path");
const { HTMLHint } = require("htmlhint");

const ROOT = process.cwd();

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith("_backup_")) continue;
      out.push(...walk(p));
    } else if (entry.isFile() && p.toLowerCase().endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const files = walk(ROOT);
  if (!files.length) {
    console.log("No HTML files found.");
    return;
  }

  const rulesPath = path.join(ROOT, ".htmlhintrc");
  const rules = fs.existsSync(rulesPath)
    ? JSON.parse(fs.readFileSync(rulesPath, "utf8"))
    : {};

  let errorCount = 0;

  for (const f of files) {
    const html = fs.readFileSync(f, "utf8");
    const results = HTMLHint.verify(html, rules);

    const errs = results.filter(r => r.type === "error");
    const warns = results.filter(r => r.type === "warning");

    if (errs.length || warns.length) {
      console.log(`\n${path.relative(ROOT, f)}`);
      for (const r of results) {
        const tag = r.type.toUpperCase().padEnd(7);
        console.log(`  ${tag} L${r.line}:C${r.col}  ${r.message}  (${r.rule.id})`);
      }
    }
    errorCount += errs.length;
  }

  if (errorCount > 0) {
    console.error(`\nHTML validation failed: ${errorCount} error(s).`);
    process.exit(1);
  }

  console.log(`\nHTML validation OK (${files.length} file(s)).`);
}

main();
