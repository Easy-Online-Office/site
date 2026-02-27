const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const NAV_MARKER = "<!-- NAV_SYNC -->";
const SYNC_SCRIPT = '<script src="scripts/sync-nav.js"></script>';

const HEADER = `
<!-- NAV_SYNC -->
<nav class="bg-blue-600 text-white py-4 no-print">
  <div class="container mx-auto px-4 flex flex-wrap items-center gap-4">
    <a href="index.html" class="font-black text-xl mr-4">Easy&nbsp;Suite</a>
    <a href="easy-quote.html">Quote</a>
    <a href="easy-invoice.html">Invoice</a>
    <a href="easy-purchase-order.html">Purchase Order</a>
    <a href="easy-sales-order.html">Sales Order</a>
    <a href="easy-receipt.html">Receipt</a>
    <a href="easy-statement.html">Statement</a>
    <a href="easy-job-card.html">Job Card</a>
    <a href="easy-payroll.html">Payroll</a>
    <a href="easy-inventory.html">Inventory</a>
    <a href="easy-crm.html">CRM</a>
    <a href="easy-addons.html">Add-ons</a>
  </div>
</nav>
`;

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  // Remove existing NAV block
  const navRegex = /<!-- NAV_SYNC -->[\s\S]*?<\/nav>/g;
  content = content.replace(navRegex, "");

  // Inject after <body>
  content = content.replace(/<body.*?>/, (match) => {
    return `${match}\n${HEADER}`;
  });

  // Inject sync-nav.js before </body>
  if (!content.includes("sync-nav.js")) {
    content = content.replace("</body>", `${SYNC_SCRIPT}\n</body>`);
  }

  fs.writeFileSync(filePath, content, "utf8");
}

function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith(".html")) {
      processFile(fullPath);
    }
  });
}

walk(ROOT);
console.log("Navigation enforcement complete.");