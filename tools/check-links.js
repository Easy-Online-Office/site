const { LinkChecker } = require("linkinator");

(async () => {
  const checker = new LinkChecker();

  // Crawl locally-served pages
  const url = process.env.SITE_URL || "http://localhost:8080/index.html";

  const result = await checker.check({
    path: url,
    recurse: true,
    concurrency: 50,
    timeout: 20000,
    // Check external links too (set false if you want internal-only)
    linksToSkip: [
      /^mailto:/i,
      /^tel:/i,
      /^javascript:/i
    ]
  });

  const broken = result.links.filter((l) => l.state === "BROKEN");

  if (broken.length) {
    console.error("\n❌ Broken links found:\n");
    broken.slice(0, 200).forEach((l) => {
      console.error(`- ${l.url}  (from: ${l.parent || "unknown"})  status: ${l.status || "n/a"}`);
    });
    console.error(`\nTotal broken: ${broken.length}`);
    process.exit(1);
  }

  console.log(`✅ Link check passed. Checked: ${result.links.length} links`);
})();