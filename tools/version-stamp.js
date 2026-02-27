const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.cwd();

function gitSha() {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return String(Date.now());
  }
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith("_backup_")) continue;
      out.push(...walk(p));
    } else if (e.isFile() && p.toLowerCase().endsWith(".html")) {
      out.push(p);
    }
  }
  return out;
}

function stamp(html, v) {
  // Stamp icon.png and apple-touch-icon
  html = html.replace(/(href="icon\.png)(\?v=[^"]*)?(")/g, `$1?v=${v}$3`);

  // Stamp local css/js under assets/
  html = html.replace(/(href="assets\/css\/[^"]+?\.css)(\?v=[^"]*)?(")/g, `$1?v=${v}$3`);
  html = html.replace(/(src="assets\/js\/[^"]+?\.js)(\?v=[^"]*)?(")/g, `$1?v=${v}$3`);

  return html;
}

function main() {
  const v = gitSha();
  const files = walk(ROOT);

  let changed = 0;
  for (const f of files) {
    const orig = fs.readFileSync(f, "utf8");
    const next = stamp(orig, v);
    if (next !== orig) {
      fs.writeFileSync(f, next, "utf8");
      changed++;
    }
  }

  console.log(`Version stamp applied (?v=${v}) to ${changed}/${files.length} HTML file(s).`);
}

main();
