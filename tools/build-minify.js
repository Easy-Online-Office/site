const fs = require("fs");
const path = require("path");
const { minify: minifyHtml } = require("html-minifier-terser");
const CleanCSS = require("clean-css");
const terser = require("terser");

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

const HTML_MINIFY_OPTS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeEmptyAttributes: true,
  minifyCSS: true,
  minifyJS: true,
  sortAttributes: true,
  sortClassName: false,
  keepClosingSlash: true
};

function rimraf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith("_backup_") || e.name === ".git") continue;
      copyDir(s, d);
    } else if (e.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile()) out.push(p);
  }
  return out;
}

async function main() {
  rimraf(DIST);
  copyDir(ROOT, DIST);

  const files = walk(DIST);
  let htmlCount = 0, cssCount = 0, jsCount = 0;

  for (const f of files) {
    const lower = f.toLowerCase();

    if (lower.endsWith(".html")) {
      const orig = fs.readFileSync(f, "utf8");
      const out = await minifyHtml(orig, HTML_MINIFY_OPTS);
      fs.writeFileSync(f, out, "utf8");
      htmlCount++;
      continue;
    }

    if (lower.endsWith(".css") && !lower.endsWith(".min.css")) {
      const orig = fs.readFileSync(f, "utf8");
      const out = new CleanCSS({}).minify(orig);
      if (out.errors && out.errors.length) {
        console.error("CSS minify error:", f, out.errors);
        process.exit(1);
      }
      fs.writeFileSync(f, out.styles, "utf8");
      cssCount++;
      continue;
    }

    if (lower.endsWith(".js") && !lower.endsWith(".min.js")) {
      const orig = fs.readFileSync(f, "utf8");
      const out = await terser.minify(orig, { compress: true, mangle: true });
      if (out.error) {
        console.error("JS minify error:", f, out.error);
        process.exit(1);
      }
      fs.writeFileSync(f, out.code, "utf8");
      jsCount++;
      continue;
    }
  }

  console.log(`Build complete: dist/ created. Minified HTML:${htmlCount} CSS:${cssCount} JS:${jsCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
