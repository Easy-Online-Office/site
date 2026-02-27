$jsPath = "assets\easy-suite-ui.js"
$js = @"
// Browser-safe UI helpers for Easy Suite pages.
// (Put real UI logic here later.)
console.log("Easy Suite UI loaded");
"@
New-Item -Force -ItemType File -Path $jsPath | Out-Null
Set-Content -Path $jsPath -Value $js -Encoding UTF8
Write-Host "Created $jsPath"