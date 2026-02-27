const fs = require("fs");
const path = require("path");
const glob = require("glob");

const siteUrl = process.env.PUBLIC_SITE_URL || "https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO";
const root = process.cwd();

// Exclude patterns (adjust)
const exclude = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.github/**",
  "**/*.bak.html",
  "**/*.bak",
  "**/tools/**"
];

const files = glob.sync("**/*.html", { cwd: root, ignore: exclude });

const urls = files
  .filter((f) => !f.toLowerCase().includes("404"))
  .map((f) => `${siteUrl}/${f.replace(/\\/g, "/")}`);

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n` +
        `    <loc>${u}</loc>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>0.7</priority>\n` +
        `  </url>\n`
    )
    .join("") +
  `</urlset>\n`;

fs.writeFileSync(path.join(root, "sitemap.xml"), sitemap, "utf8");

// robots.txt
const robots =
  `User-agent: *\n` +
  `Allow: /\n\n` +
  `Sitemap: ${siteUrl}/sitemap.xml\n`;

fs.writeFileSync(path.join(root, "robots.txt"), robots, "utf8");

console.log(`✅ Generated sitemap.xml (${urls.length} URLs) + robots.txt`);