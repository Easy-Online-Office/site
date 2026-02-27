# normalize-easy-suite.ps1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# -----------------------------
# Regex helpers (safe overloads)
# -----------------------------
function Rx-ReplaceAll(
  [string]$text,
  [string]$pattern,
  [string]$replacement,
  [System.Text.RegularExpressions.RegexOptions]$options = (
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
) {
  if ($null -eq $text) { return "" }
  $rx = [System.Text.RegularExpressions.Regex]::new($pattern, $options)
  return $rx.Replace($text, $replacement)
}

function Rx-ReplaceOnce(
  [string]$text,
  [string]$pattern,
  [string]$replacement,
  [System.Text.RegularExpressions.RegexOptions]$options = (
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )
) {
  if ($null -eq $text) { return "" }
  $rx = [System.Text.RegularExpressions.Regex]::new($pattern, $options)
  $m  = $rx.Match($text)
  if (-not $m.Success) { return $text }

  $before = $text.Substring(0, $m.Index)
  $after  = $text.Substring($m.Index + $m.Length)

  # Replace within match only
  $repl = $rx.Replace($m.Value, $replacement)
  return $before + $repl + $after
}

function Ensure-Dir([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

# -----------------------------
# Paths / assets
# -----------------------------
$root = Get-Location
$encoding = [System.Text.UTF8Encoding]::new($false)

Ensure-Dir (Join-Path $root "assets")
Ensure-Dir (Join-Path $root "assets\js")
Ensure-Dir (Join-Path $root "assets\css")
Ensure-Dir (Join-Path $root "partials")

$coreJsPath        = Join-Path $root "assets\js\easy-suite-core.js"
$printCssPath      = Join-Path $root "assets\css\easy-print.css"
$navPartialPath    = Join-Path $root "partials\easy-nav.html"
$headerPartialPath = Join-Path $root "partials\easy-header.html"

# -----------------------------
# Normalized head snippets
# -----------------------------
$metaBlock = @'
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
'@

$faviconBlock = @'
  <!-- Favicon -->
  <link rel="icon" href="icon.png" type="image/png">
  <link rel="apple-touch-icon" href="icon.png">
'@

$coreCssLink = '  <link rel="stylesheet" href="assets/css/easy-print.css" />'
$coreJsLink  = '  <script defer src="assets/js/easy-suite-core.js"></script>'

$mountBlock = @'
  <!-- Easy Suite mounts (injected) -->
  <div id="easyNavMount" class="no-print"></div>
  <div id="easyHeaderMount" class="no-print"></div>
'@

# -----------------------------
# Regex patterns to remove
# -----------------------------
$rmEasySuiteHeader = '(?is)\s*<div\s+class="bg-gray-100\s+border-b\s+px-6\s+py-4\s+flex\s+justify-between\s+items-center">\s*<div>\s*<h1\s+class="text-2xl\s+font-bold\s+text-blue-600">Easy\s*Suite</h1>\s*<p\s+class="text-sm\s+text-gray-600">Feature-Rich\s+Document\s+Generator</p>\s*</div>\s*<div\s+class="flex\s+items-center\s+gap-3">.*?</div>\s*</div>\s*'

$rmExistingMounts = '(?is)\s*<!--\s*Easy Suite mounts \(injected\)\s*-->\s*<div\s+id="easyNavMount"[^>]*>\s*</div>\s*<div\s+id="easyHeaderMount"[^>]*>\s*</div>\s*'

# Conservative remove of existing suite nav (blue bar) so shared nav can be injected
$rmOldNav = '(?is)\s*<nav[^>]*class="[^"]*bg-blue-600[^"]*"[^>]*>.*?</nav>\s*'

# Remove any module header blocks (white border-b no-print) that may already exist to prevent stacking
$rmOldModuleHeader = '(?is)\s*<div\s+class="bg-white\s+border-b[^"]*no-print"[^>]*>.*?</div>\s*'

# -----------------------------
# Ensure shared assets exist
# -----------------------------
if (-not (Test-Path -LiteralPath $printCssPath)) {
@'
/* Easy Suite print normalization */
@media print {
  .no-print { display: none !important; }
  .print-only { display: block !important; }
  body { background: #fff !important; }
  a[href]:after { content: ""; }
}

/* Screen defaults */
.print-only { display: none; }
'@ | Set-Content -LiteralPath $printCssPath -Encoding UTF8
  Write-Host "Created: assets/css/easy-print.css"
}

if (-not (Test-Path -LiteralPath $navPartialPath)) {
@'
<nav class="bg-blue-600 text-white py-4 no-print">
  <div class="container mx-auto px-4 flex flex-wrap items-center gap-4">
    <a data-safe-link href="index.html" class="font-black text-xl mr-4">Easy&nbsp;Suite</a>
    <a data-safe-link href="easy-quote.html" class="hover:underline">Quote</a>
    <a data-safe-link href="easy-invoice.html" class="hover:underline">Invoice</a>
    <a data-safe-link href="easy-purchase-order.html" class="hover:underline">Purchase&nbsp;Order</a>
    <a data-safe-link href="easy-sales-order.html" class="hover:underline">Sales&nbsp;Order</a>
    <a data-safe-link href="easy-receipt.html" class="hover:underline">Receipt</a>
    <a data-safe-link href="easy-statement.html" class="hover:underline">Statement</a>
    <a data-safe-link href="easy-job-card.html" class="hover:underline">Job&nbsp;Card</a>
    <a data-safe-link href="easy-payroll.html" class="hover:underline">Payroll</a>
    <a data-safe-link href="easy-inventory.html" class="hover:underline">Inventory</a>
    <a data-safe-link href="easy-crm.html" class="hover:underline">CRM</a>
  </div>
</nav>
'@ | Set-Content -LiteralPath $navPartialPath -Encoding UTF8
  Write-Host "Created: partials/easy-nav.html"
}

if (-not (Test-Path -LiteralPath $headerPartialPath)) {
@'
<div class="bg-white border-b border-gray-200 no-print">
  <div class="container mx-auto px-4 py-4 flex flex-col sm:flex-row gap-4 sm:gap-0 items-start sm:items-center justify-between">
    <div class="flex items-center gap-3">
      <div id="easyBadge" class="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">ES</div>
      <div>
        <h1 id="easyTitle" class="text-2xl font-extrabold text-blue-700">Easy Suite</h1>
        <p id="easySubtitle" class="text-sm text-gray-500">Feature-Rich Document Generator</p>
      </div>
    </div>
  </div>
</div>
'@ | Set-Content -LiteralPath $headerPartialPath -Encoding UTF8
  Write-Host "Created: partials/easy-header.html"
}

if (-not (Test-Path -LiteralPath $coreJsPath)) {
@'
/* Easy Suite core (shared) */
(function () {
  const navMount = document.getElementById("easyNavMount");
  const headerMount = document.getElementById("easyHeaderMount");

  function deriveModule() {
    if (window.EASY && typeof window.EASY === "object") return window.EASY;

    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    const map = [
      { k: "easy-quote",           badge: "Q",  title: "EasyQUOTE", subtitle: "Quote Generator" },
      { k: "easy-invoice",         badge: "I",  title: "EasyINV",   subtitle: "Invoice Generator" },
      { k: "easy-purchase-order",  badge: "PO", title: "EasyPO",    subtitle: "Purchase Order Generator" },
      { k: "easy-sales-order",     badge: "SO", title: "EasySO",    subtitle: "Sales Order Generator" },
      { k: "easy-receipt",         badge: "R",  title: "EasyREC",   subtitle: "Receipt Generator" },
      { k: "easy-statement",       badge: "S",  title: "EasySTAT",  subtitle: "Statement Generator" },
      { k: "easy-job-card",        badge: "JC", title: "EasyJC",    subtitle: "Job Card Manager" },
      { k: "easy-payroll",         badge: "P",  title: "EasyPAY",   subtitle: "Payroll Manager" },
      { k: "easy-inventory",       badge: "IV", title: "EasyINVTR", subtitle: "Inventory Manager" },
      { k: "easy-crm",             badge: "C",  title: "EasyCRM",   subtitle: "CRM Manager" },
      { k: "index",                badge: "ES", title: "Easy Suite",subtitle: "Dashboard" }
    ];
    for (const m of map) if (file.includes(m.k)) return m;
    return { badge:"ES", title:"Easy Suite", subtitle:"Feature-Rich Document Generator" };
  }

  async function injectPartial(mount, url) {
    if (!mount) return;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    mount.innerHTML = await res.text();
  }

  async function boot() {
    try {
      await injectPartial(navMount, "partials/easy-nav.html");
      await injectPartial(headerMount, "partials/easy-header.html");

      const cfg = deriveModule();
      const badge = document.getElementById("easyBadge");
      const title = document.getElementById("easyTitle");
      const sub = document.getElementById("easySubtitle");
      if (badge) badge.textContent = cfg.badge || "ES";
      if (title) title.textContent = cfg.title || "Easy Suite";
      if (sub) sub.textContent = cfg.subtitle || "Feature-Rich Document Generator";
    } catch (e) {
      console.warn("Easy Suite core warning:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
'@ | Set-Content -LiteralPath $coreJsPath -Encoding UTF8
  Write-Host "Created: assets/js/easy-suite-core.js"
}

# -----------------------------
# Normalizers
# -----------------------------
function Ensure-In-Head([string]$html) {
  $h = $html

  if ($h -notmatch '(?is)<head\b') { return $h }

  # Ensure meta charset + viewport near start of head
  if ($h -notmatch '(?is)<meta\s+charset=') {
    $h = Rx-ReplaceOnce $h '(?is)<head\b[^>]*>\s*' "`$0`r`n$metaBlock`r`n"
  } elseif ($h -notmatch '(?is)<meta\s+name="viewport"') {
    $h = Rx-ReplaceOnce $h '(?is)<meta\s+charset=[^>]*>\s*' "`$0`r`n  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />`r`n"
  }

  # Remove any existing favicon tags, then insert normalized block after </title>
  $h = Rx-ReplaceAll $h '(?is)\s*<link\s+rel="icon"[^>]*>\s*' ''
  $h = Rx-ReplaceAll $h '(?is)\s*<link\s+rel="shortcut icon"[^>]*>\s*' ''
  $h = Rx-ReplaceAll $h '(?is)\s*<link\s+rel="apple-touch-icon"[^>]*>\s*' ''

  if ($h -match '(?is)</title>') {
    $h = Rx-ReplaceOnce $h '(?is)</title>\s*' "`$0`r`n`r`n$faviconBlock`r`n"
  } else {
    # fallback: insert at end of head start
    $h = Rx-ReplaceOnce $h '(?is)<head\b[^>]*>\s*' "`$0`r`n$faviconBlock`r`n"
  }

  # Ensure print css link before </head>
  if ($h -notmatch '(?is)assets/css/easy-print\.css') {
    $h = Rx-ReplaceOnce $h '(?is)</head>' "$coreCssLink`r`n</head>"
  }

  # Ensure core js reference (also in head for simplicity)
  if ($h -notmatch '(?is)assets/js/easy-suite-core\.js') {
    $h = Rx-ReplaceOnce $h '(?is)</head>' "$coreJsLink`r`n</head>"
  }

  return $h
}

function Normalize-Body([string]$html) {
  $b = $html

  # Remove old headers/nav/mounts to prevent duplicates
  $b = Rx-ReplaceAll $b $rmEasySuiteHeader ''
  $b = Rx-ReplaceAll $b $rmExistingMounts ''
  $b = Rx-ReplaceAll $b $rmOldNav ''
  $b = Rx-ReplaceAll $b $rmOldModuleHeader ''

  # Inject mounts right after <body ...>
  if ($b -notmatch '(?is)<div\s+id="easyNavMount"') {
    $b = Rx-ReplaceOnce $b '(?is)<body\b[^>]*>\s*' "`$0`r`n$mountBlock`r`n"
  }

  return $b
}

# -----------------------------
# Process HTML files
# -----------------------------
$files = Get-ChildItem -LiteralPath $root -Filter *.html -File
if ($files.Count -eq 0) {
  Write-Host "No HTML files found in $root" -ForegroundColor Yellow
  exit 0
}

foreach ($f in $files) {
  $path = $f.FullName
  $raw  = Get-Content -LiteralPath $path -Raw

  Copy-Item -LiteralPath $path -Destination ($path + ".bak") -Force

  $out = $raw
  $out = Ensure-In-Head $out
  $out = Normalize-Body $out

  [System.IO.File]::WriteAllText($path, $out, $encoding)
  Write-Host ("Normalized: " + $f.Name)
}

Write-Host "Done. Backups created as *.html.bak" -ForegroundColor Green
Write-Host "Shared assets ensured: assets/js/easy-suite-core.js, assets/css/easy-print.css, partials/easy-nav.html, partials/easy-header.html" -ForegroundColor Green