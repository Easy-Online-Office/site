import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");

const [gate, config, nav, dashboard] = await Promise.all([
  read("assets/js/easyfile-referrals.js"),
  read("assets/js/easyfile-referral-config.js"),
  read("scripts/sync-nav.js"),
  read("referrals.html")
]);

assert.match(config, /apiBase:\s*"https:\/\//, "Referral API must use HTTPS.");
assert.match(config, /referralsRequired:\s*3\b/, "Referral requirement must remain three.");
assert.match(config, /requestTimeoutMs:\s*\d+/, "Referral requests need a timeout.");
assert.match(config, /allowOfflineUnlockedAccess:\s*false/, "Unsigned offline unlock must fail closed by default.");
assert.match(gate, /AbortController/, "Referral API requests must be abortable.");
assert.match(gate, /idempotencyKey/, "Qualifying-use requests must carry an idempotency key.");
assert.match(gate, /referralCodePattern/, "Incoming referral codes must be validated.");
assert.match(gate, /\^easy-\[a-z0-9\]/, "All easy-*.html module pages must be gated dynamically.");
assert.match(gate, /offlineAllowed/, "Offline entitlement handling must be explicit.");
assert.match(gate, /value\.entitlementToken/, "Offline access must require a signed token field.");
assert.match(gate, /document\.visibilityState === "visible"/, "Polling must pause for hidden tabs.");
assert.match(nav, /easyfile-referrals\.js/, "Global navigation must load the referral gate.");
assert.match(dashboard, /data-referral-access/, "Referral dashboard must expose live access state.");

const files = await readdir(root);
const modulePages = files.filter((name) => /^easy-[a-z0-9][a-z0-9-]*\.html$/.test(name));
assert.ok(modulePages.length >= 10, "Expected at least ten EasyFile module pages.");

const missingNav = [];
for (const file of modulePages) {
  const html = await read(file);
  if (!/scripts\/sync-nav\.js/.test(html)) missingNav.push(file);
}
assert.deepEqual(missingNav, [], `Module pages missing scripts/sync-nav.js: ${missingNav.join(", ")}`);

console.log(`Referral validation passed for ${modulePages.length} module pages.`);
