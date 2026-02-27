const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "dist.zip");

async function main() {
  if (!fs.existsSync(DIST)) {
    console.error("dist/ not found. Run: npm run build");
    process.exit(1);
  }

  if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

  const output = fs.createWriteStream(OUT);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", err => { throw err; });

  archive.pipe(output);
  archive.directory(DIST, false);
  await archive.finalize();

  output.on("close", () => {
    console.log(`Pack complete: ${path.basename(OUT)} (${archive.pointer()} bytes)`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
