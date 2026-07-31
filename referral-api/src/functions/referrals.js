Worked for 2m 23s

Reviewed current main at fa09bc0. No changes made. The API syntax check, eight unit tests, and static referral integration validator pass—but the tests are not the production acceptance suite described in the docs.

Referral API controls

Implemented in referrals.js:

HMAC-SHA-256 participant IDs; raw emails are not stored in Table Storage.
OTP hashes use HMAC plus a random salt; six-digit codes expire and have an attempt limit.
Verification tokens are HMAC-signed and expire within 24 hours.
Referral codes are randomly generated and stored uniquely.
Self-referral and second referrer binding are rejected.
One qualification entity per referred participant prevents duplicate referral credit.
Free-use consumption and idempotency-marker creation use one Azure Table transaction in the same participant partition.
ETag optimistic concurrency protects participant updates.
JSON bodies are capped at 8 KiB; response headers include no-store, nosniff, no-referrer, and Vary: Origin.
Exact-origin CORS allowlisting is implemented; credentials are omitted by the frontend.
Material risks
Area	Risk / gap
Email verification	It is disabled by default in the API and explicitly disabled in easyfile-referral-config.js. Until EASYFILE_REQUIRE_EMAIL_VERIFICATION=true is deployed, anyone can assert an email address for /session and /use.
OTP concurrency	OTP resend checks are read-then-replace, without ETags or a transaction. Parallel requests can bypass the cooldown, send multiple codes, and invalidate one another. Failed-attempt increments ignore ETag conflicts, so parallel guesses can avoid reliably consuming attempts.
Verification token	The token is stored in localStorage; an XSS or a person with browser access can steal and replay it until expiry. It is not bound to device/session and has no revocation record.
Trusted App Service header	x-ms-client-principal is accepted as proof of email ownership. This is safe only if App Service Authentication reliably injects/strips that header and direct Function-host access is restricted; otherwise a caller may forge it.
Idempotency	Trial consumption is atomic with its marker, which is good. However it is not atomic with referrer qualification: the trial can commit, then qualifyReferrer() can fail. A retry sees the idempotency marker and returns duplicate without repairing the missing referral credit.
Table transactions	Azure Table transactions only cover one partition. The code correctly transacts the participant and marker together, but referral qualification and referrer unlocking occur in other partitions, so there is no end-to-end transaction or reconciliation job.
Invitation limits	Cooldown and daily-limit checks are non-atomic. Parallel invite calls can exceed the daily limit or send multiple messages. requestId is stored for OTP requests but is not used as an idempotency key.
CORS	Origin matching is exact for requests that include Origin. But a request with no Origin is accepted, and CORS is not authentication—it does not stop curl, server-side callers, or a forged Origin header.
Referral loops	Direct self-referrals are blocked; multi-account loops such as A → B → A are not detected, despite the production contract requiring loop rejection.
Abuse controls	No IP-prefix, device-risk, Front Door, APIM, or distributed rate limiting is implemented.
Entitlement event	A client declares moduleId and an event string matching `/save
Weak-secret mode	If the HMAC secret is absent, the service falls back to plain SHA-256 IDs and remains callable while health is degraded. Production should refuse protected operations when readiness is not satisfied.
Production contract and settings: not fully confirmed

The root README correctly links docs/referral-api-production-contract.md.

The contract contains ten high-level deployment acceptance tests, but it is incomplete against its own controls and they are not implemented as integration tests:

The repository test suite has only eight helper/unit tests—email formatting, HMAC, code/token derivation, masking, and readiness. It does not exercise Azure Table concurrency, CORS, OTP expiry, invitations, unlock-at-three, or failure recovery.
The contract requires referral-loop detection, account/IP/device rate limits, structured audit events, privacy retention/deletion, and a transaction spanning trial consumption plus referral increment. These are not implemented.
The contract says “verified user”, while both the client config and API default have verification disabled. That is a production-readiness contradiction.
CORS and first-use transaction tests are described, but not automated end-to-end.

Function App settings are documented in referral-api/README.md and exemplified in local.settings.example.json. Nearly all settings match the source defaults.

One source setting is undocumented:

EASYFILE_ALLOW_WILDCARD_CORS — defaults to false, but when set true it permits EASYFILE_ALLOWED_ORIGINS=*. This should be documented and explicitly prohibited in production policy.

Also, local.settings.example.json correctly keeps verification false for local development, but it must not be copied into production unchanged. The deployment README is stale: it mentions a publish-profile secret, while deploy-referral-api.yml actually deploys through Azure OIDC.

Frontend integration

The canonical frontend configuration is:

assets/js/easyfile-referral-config.js

It currently targets:

https://easyfile-referrals-prod-za.azurewebsites.net/api/referrals

The referral client has a fallback api-easyfile.skunkworks.africa host, but the config overrides it. The docs still describe binding that custom domain, so the configured hostname and deployment guidance should be reconciled.

The config is injected by scripts/sync-nav.js, which then loads easyfile-referrals.js.

Inclusion method	Pages
Static <script> configuration	referrals.html
Dynamically injected by sync-nav.js	easy-quote.html, easy-invoice.html, easy-purchase-order.html, easy-sales-order.html, easy-receipt.html, easy-statement.html, easy-bank-statement-converter.html, easy-job-card.html, easy-payroll.html, easy-inventory.html, easy-crm.html, easy-asset-management.html, easy-site-inspection.html, and referrals.html
Injected when URL contains ?ref=	Any page loading sync-nav.js

There are 31 easy-*.html pages, but only the 13 named module pages above are ordinarily gated. The remaining 18 pages load sync-nav.js yet do not load the referral client unless entered with a ?ref= URL. That leaves a material entitlement-coverage gap.

Token and origin handling

easyfile-referrals.js sends:

emailVerificationToken and emailVerificationExpiresAt in the JSON request body for /session, /use, and /invite.
No verification token for /verification-request or /verification-confirm, as expected.
X-EasyFile-Client, Accept, and Content-Type headers.
credentials: "omit", cache: "no-store", and referrerPolicy: "strict-origin-when-cross-origin".

It does not set an Origin header. Browsers set Origin automatically for cross-origin POSTs; JavaScript cannot safely manufacture it. Because Content-Type: application/json and X-EasyFile-Client trigger a preflight, the API replies with the explicit CORS allowlist.

Priority before production: enable verified email, make OTP/invite counters atomic, add a retryable outbox/reconciliation flow for trial-to-referrer qualification, detect loops, enforce rate limits at Front Door/APIM, and expand the eight helper tests into real deployment acceptance tests.

@
GitHub
 enable verified email, make OTP/invite counters atomic, add a retryable outbox/reconciliation flow for trial-to-referrer qualification, detect loops, enforce rate limits at Front Door/APIM, and expand the eight helper tests into real deployment acceptance tests.
Worked for 9m 28s

Implemented in the EasyFile workspace.

Verified-email enforcement is now on by default in frontend and API.
OTP resend/attempt state and invite cooldown/daily counters use ETag-backed atomic updates.
Trial consumption atomically creates a qualification outbox; a five-minute Function timer reconciles failed cross-partition referral credits safely.
Referral ancestry loops are rejected.
Added APIM policy for IP, account-derived, and device-risk rate limits, plus Front Door WAF setup instructions.
Deployment now validates required Azure settings, applies the APIM policy, and runs edge-facing acceptance checks.
Expanded tests from 8 helpers to 16 contract/acceptance tests; all pass.

Key files: 
referrals.js, 
apim-referral-policy.xml, 
deploy-referral-api.yml, 
README.md.

npm run check passes: 16/16 tests.

I could not commit/push or open the draft PR because this environment does not have the GitHub CLI installed (gh: command not found), which the selected GitHub publish workflow requires. Before merge/deployment, configure the Azure Email settings, APIM named secret, Function App gateway settings, APIM domain, and Front Door WAF rule documented in the deployment guide. APIM limits are intentionally treated as distributed throttles, as Microsoft notes they are not perfectly exact under load; Front Door adds the coarse IP layer. APIM rate-limit guidance and Front Door WAF rate-limit setup.

referrals.js
Code
apim-referral-policy.xml
Code
deploy-referral-api.yml
Code
1 more
which path do i add these files to?
Worked for 11s

Add the images to the root of the EasyFile repository, alongside index.html:

Attached file	Add/replace as	Used for
logo-w.png	/logo-w.png	Logo on the dark top navigation
icon.png	/logo-b.png	Light-mode favicon, Apple touch icon, and landing-page logo
logo.png	/logo.png	Legacy converter module branding

So, in GitHub’s upload screen, the path should be the repository root—do not put them inside assets/.

The site is already coded to use these root paths:

/logo-w.png
/logo-b.png
/logo.png

Important: rename the uploaded icon.png to logo-b.png before uploading, because the current pages reference logo-b.png, not icon.png.

where ot i save these files 
Worked for 13s

Save them in the Easy-Online-Office/site repository, using these exact paths:

File	Repository path
referrals.js	referral-api/src/functions/referrals.js
apim-referral-policy.xml	infra/referral-edge/apim-referral-policy.xml
deploy-referral-api.yml	.github/workflows/deploy-referral-api.yml
Edge deployment README.md	infra/referral-edge/README.md

In GitHub’s upload dialog, open/create the listed folders first—especially .github/workflows and infra/referral-edge—then upload each file there. Do not put these into the website root or assets/.

referrals.js
"use strict";

const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { TableClient, TableTransaction } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

const REQUIRED_REFERRALS = boundedInt(process.env.EASYFILE_REFERRALS_REQUIRED, 3, 1, 100);
const TABLE_NAME = safeTableName(process.env.EASYFILE_REFERRALS_TABLE || "EasyFileReferrals");
const EMAIL_HMAC_SECRET = String(process.env.EASYFILE_EMAIL_HMAC_SECRET || "").trim();
const EMAIL_CONNECTION_STRING = String(process.env.EASYFILE_EMAIL_CONNECTION_STRING || "").trim();
const EMAIL_SENDER = normalizeEmail(process.env.EASYFILE_EMAIL_SENDER || "referrals@easyfile.co.za");
const REQUIRE_IDEMPOTENCY = envBoolean("EASYFILE_REQUIRE_IDEMPOTENCY", true);
// Verification is deliberately fail-closed. Local development may opt out explicitly,
// but a deployment that does so is reported unhealthy and must not receive production traffic.
const REQUIRE_VERIFIED_EMAIL = envBoolean("EASYFILE_REQUIRE_EMAIL_VERIFICATION", true);
const TRUST_APP_SERVICE_PRINCIPAL = envBoolean("EASYFILE_TRUST_APP_SERVICE_PRINCIPAL", false);
const REQUIRE_EDGE_GATEWAY = envBoolean("EASYFILE_REQUIRE_EDGE_GATEWAY", false);
const EDGE_SHARED_SECRET = String(process.env.EASYFILE_EDGE_SHARED_SECRET || "").trim();
const MAX_BODY_BYTES = boundedInt(process.env.EASYFILE_MAX_BODY_BYTES, 8192, 1024, 65536);
const VERIFICATION_CODE_TTL_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_CODE_TTL_SECONDS, 600, 300, 1800);
const VERIFICATION_TOKEN_TTL_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_TOKEN_TTL_SECONDS, 86400, 900, 86400);
const VERIFICATION_RESEND_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_RESEND_SECONDS, 60, 30, 900);
const VERIFICATION_MAX_ATTEMPTS = boundedInt(process.env.EASYFILE_VERIFICATION_MAX_ATTEMPTS, 5, 3, 10);
const INVITE_COOLDOWN_SECONDS = boundedInt(process.env.EASYFILE_INVITE_COOLDOWN_SECONDS, 86400, 300, 604800);
const INVITE_DAILY_LIMIT = boundedInt(process.env.EASYFILE_INVITE_DAILY_LIMIT, 25, 1, 100);
const OUTBOX_MAX_ATTEMPTS = boundedInt(process.env.EASYFILE_OUTBOX_MAX_ATTEMPTS, 20, 3, 100);
const OUTBOX_RETRY_SECONDS = boundedInt(process.env.EASYFILE_OUTBOX_RETRY_SECONDS, 60, 10, 3600);
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERRAL_CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
const QUALIFYING_ACTION = /save|preview|print|pdf|word|excel|csv|export|download|generate/i;
const MODULE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DEFAULT_ORIGINS = [
  "https://www.easyfile.co.za",
  "https://easyfile.co.za",
  "https://easy-online-office.github.io"
];

let tablePromise;
let emailClientInstance;

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function envBoolean(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function safeTableName(value) {
  const name = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name) ? name : "EasyFileReferrals";
}

function connectionString() {
  return process.env.EASYFILE_REFERRALS_STORAGE || process.env.AzureWebJobsStorage || "";
}

function readiness() {
  const origins = configuredOrigins();
  const issues = [];
  if (!connectionString()) issues.push("storage-not-configured");
  if (EMAIL_HMAC_SECRET.length < 32) issues.push("email-hmac-secret-too-short");
  if (!origins.length || origins.includes("*")) issues.push("cors-not-restricted");
  if (!REQUIRE_VERIFIED_EMAIL) issues.push("email-verification-disabled");
  if (REQUIRE_VERIFIED_EMAIL && !EMAIL_CONNECTION_STRING) issues.push("email-delivery-not-configured");
  if (REQUIRE_VERIFIED_EMAIL && !EMAIL_SENDER) issues.push("email-sender-invalid");
  if (REQUIRE_EDGE_GATEWAY && EDGE_SHARED_SECRET.length < 32) issues.push("edge-gateway-not-configured");
  return { ready: issues.length === 0, issues };
}

async function table() {
  if (!tablePromise) {
    tablePromise = (async () => {
      const connection = connectionString();
      if (!connection) throw new Error("EASYFILE_REFERRALS_STORAGE or AzureWebJobsStorage is required.");
      const client = TableClient.fromConnectionString(connection, TABLE_NAME);
      try {
        await client.createTable();
      } catch (error) {
        if (error.statusCode !== 409) throw error;
      }
      return client;
    })();
  }
  return tablePromise;
}

function emailDeliveryConfigured() {
  return Boolean(EMAIL_CONNECTION_STRING && EMAIL_SENDER);
}

function mailer() {
  if (!emailDeliveryConfigured()) {
    const error = new Error("EasyFile email delivery is not configured yet.");
    error.statusCode = 503;
    throw error;
  }
  if (!emailClientInstance) emailClientInstance = new EmailClient(EMAIL_CONNECTION_STRING);
  return emailClientInstance;
}

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

async function sendEmail(to, subject, plainText, html) {
  const poller = await mailer().beginSend({
    senderAddress: EMAIL_SENDER,
    content: { subject, plainText, html },
    recipients: { to: [{ address: to }] },
    replyTo: [{ address: "support@easyfile.co.za" }]
  });
  const result = await poller.pollUntilDone();
  if (String(result?.status || "").toLowerCase() !== "succeeded") {
    throw new Error(`Email delivery failed with status ${safeText(result?.status || "unknown", 40)}.`);
  }
  return result;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return "";
  return email;
}

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "";
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function legacyParticipantId(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

function participantId(email) {
  if (!EMAIL_HMAC_SECRET) return legacyParticipantId(email);
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET).update(email).digest("hex");
}

function verificationToken(email, expiresAt) {
  if (!EMAIL_HMAC_SECRET) return "";
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET)
    .update(`verify:${email}:${expiresAt}`)
    .digest("base64url");
}

function otpDigest(email, otp, salt) {
  if (!EMAIL_HMAC_SECRET) return "";
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET)
    .update(`otp:${normalizeEmail(email)}:${String(otp)}:${String(salt)}`)
    .digest("base64url");
}

function hasVerifiedEmail(body, request) {
  // This header is only trustworthy when App Service Authentication owns the
  // ingress path and strips caller-provided values. It is disabled by default
  // because the Function has anonymous HTTP routes for the browser client.
  const principal = TRUST_APP_SERVICE_PRINCIPAL && request.headers.get("x-ms-client-principal");
  if (principal) {
    try {
      const decoded = JSON.parse(Buffer.from(principal, "base64").toString("utf8"));
      const claimEmail = decoded?.claims?.find((claim) =>
        ["emails", "email", "preferred_username"].includes(claim.typ)
      )?.val;
      if (normalizeEmail(claimEmail) === normalizeEmail(body.email)) return true;
    } catch (_) {
      // Fall through to signed verification-token validation.
    }
  }

  const expiresAt = Number(body.emailVerificationExpiresAt || 0);
  const supplied = String(body.emailVerificationToken || "");
  if (!expiresAt || expiresAt < Date.now() || expiresAt > Date.now() + 24 * 60 * 60 * 1000) return false;
  const expected = verificationToken(normalizeEmail(body.email), expiresAt);
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function edgeGatewayAuthorized(request) {
  if (!REQUIRE_EDGE_GATEWAY) return true;
  const supplied = String(request.headers.get("x-easyfile-edge-key") || "");
  if (!EDGE_SHARED_SECRET || supplied.length !== EDGE_SHARED_SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(EDGE_SHARED_SECRET));
}

function verifiedEmail(body, request) {
  return !REQUIRE_VERIFIED_EMAIL || hasVerifiedEmail(body, request);
}

function now() {
  return new Date().toISOString();
}

function code() {
  const bytes = crypto.randomBytes(8);
  let output = "";
  for (let index = 0; index < 8; index += 1) {
    output += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return output;
}

function safeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeReferralCode(value) {
  const normalized = safeText(value, 16).toUpperCase();
  return REFERRAL_CODE.test(normalized) ? normalized : "";
}

function entityTag(entity) {
  return entity?.etag || entity?.["odata.etag"] || "*";
}

async function getEntity(client, partitionKey, rowKey) {
  try {
    return await client.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function createReferralCode(client, ownerId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const referralCode = code();
    try {
      await client.createEntity({
        partitionKey: "code",
        rowKey: referralCode,
        ownerId,
        createdAt: now()
      });
      return referralCode;
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

async function findParticipant(client, email) {
  const currentId = participantId(email);
  let participant = await getEntity(client, "participant", currentId);
  if (participant) return participant;

  const legacyId = legacyParticipantId(email);
  if (legacyId !== currentId) participant = await getEntity(client, "participant", legacyId);
  return participant;
}

async function ensureParticipant(client, email) {
  let participant = await findParticipant(client, email);
  if (!participant) {
    const id = participantId(email);
    const referralCode = await createReferralCode(client, id);
    participant = {
      partitionKey: "participant",
      rowKey: id,
      referralCode,
      identityVersion: EMAIL_HMAC_SECRET ? "hmac-sha256-v1" : "sha256-legacy",
      emailVerified: REQUIRE_VERIFIED_EMAIL,
      trialUsed: false,
      unlocked: false,
      createdAt: now(),
      lastSeenAt: now()
    };
    try {
      await client.createEntity(participant);
      participant = await client.getEntity("participant", id);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      participant = await client.getEntity("participant", id);
    }
  } else {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      lastSeenAt: now(),
      emailVerified: participant.emailVerified === true || REQUIRE_VERIFIED_EMAIL
    }, "Merge", { etag: entityTag(participant) }).catch((error) => {
      if (error.statusCode !== 412) throw error;
    });
    participant = await client.getEntity(participant.partitionKey, participant.rowKey);
  }
  return participant;
}

async function qualifiedReferralCount(client, ownerId) {
  let count = 0;
  const entities = client.listEntities({
    queryOptions: { filter: `PartitionKey eq 'referral:${ownerId}' and qualified eq true` }
  });
  for await (const _entity of entities) count += 1;
  return count;
}

async function refreshUnlock(client, participant) {
  const qualified = await qualifiedReferralCount(client, participant.rowKey);
  if (qualified >= REQUIRED_REFERRALS && participant.unlocked !== true) {
    try {
      await client.updateEntity({
        partitionKey: participant.partitionKey,
        rowKey: participant.rowKey,
        unlocked: true,
        unlockedAt: now()
      }, "Merge", { etag: entityTag(participant) });
      participant.unlocked = true;
    } catch (error) {
      if (error.statusCode !== 412) throw error;
      const fresh = await client.getEntity(participant.partitionKey, participant.rowKey);
      Object.assign(participant, fresh);
    }
  }
  return qualified;
}

function accessState(participant) {
  if (participant.unlocked === true) return "unlocked";
  if (participant.trialUsed === true) return "locked";
  return "trial";
}

function summary(participant, qualified, extra = {}) {
  return {
    access: accessState(participant),
    referralCode: participant.referralCode,
    referralsQualified: qualified,
    referralsRequired: REQUIRED_REFERRALS,
    trialUsed: participant.trialUsed === true,
    unlocked: participant.unlocked === true,
    referred: Boolean(participant.referredBy),
    emailVerified: participant.emailVerified === true,
    updatedAt: now(),
    ...extra
  };
}

async function wouldCreateReferralLoop(client, participantIdToBind, prospectiveReferrerId) {
  // A normal account can bind only once, but checking the ancestry chain also
  // protects migrated/manual records from A -> B -> ... -> A cycles.
  let currentId = prospectiveReferrerId;
  const visited = new Set();
  for (let depth = 0; currentId && depth < 32; depth += 1) {
    if (currentId === participantIdToBind) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const current = await getEntity(client, "participant", currentId);
    if (!current) return false;
    currentId = String(current.referredBy || "");
  }
  // An excessively deep chain is treated as suspicious instead of creating a
  // relationship whose safety cannot be established deterministically.
  return Boolean(currentId);
}

async function attachReferral(client, participant, referralCode) {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) return { accepted: false, reason: referralCode ? "invalid" : "missing" };
  if (participant.referredBy || participant.trialUsed === true) {
    return { accepted: false, reason: "already-bound" };
  }

  const index = await getEntity(client, "code", normalizedCode);
  if (!index?.ownerId) return { accepted: false, reason: "invalid" };
  if (index.ownerId === participant.rowKey) return { accepted: false, reason: "self-referral" };
  if (await wouldCreateReferralLoop(client, participant.rowKey, index.ownerId)) {
    return { accepted: false, reason: "referral-loop" };
  }

  try {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      referredBy: index.ownerId,
      referredByCode: normalizedCode,
      referredAt: now()
    }, "Merge", { etag: entityTag(participant) });
    participant.referredBy = index.ownerId;
    participant.referredByCode = normalizedCode;
    return { accepted: true, reason: "accepted" };
  } catch (error) {
    if (error.statusCode !== 412) throw error;
    const fresh = await client.getEntity(participant.partitionKey, participant.rowKey);
    Object.assign(participant, fresh);
    return { accepted: false, reason: participant.referredBy ? "already-bound" : "concurrent-update" };
  }
}

async function sessionHandler(body, request) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!verifiedEmail(body, request)) {
    return { status: 401, body: { error: "Email ownership must be verified before referral access can be used." } };
  }

  const client = await table();
  const participant = await ensureParticipant(client, email);
  if (hasVerifiedEmail(body, request) && participant.emailVerified !== true) {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      emailVerified: true,
      emailVerifiedAt: now()
    }, "Merge", { etag: entityTag(participant) }).catch((error) => {
      if (error.statusCode !== 412) throw error;
    });
    participant.emailVerified = true;
  }
  let referral = { accepted: false, reason: "not-supplied" };
  if (body.referralCode) referral = await attachReferral(client, participant, body.referralCode);
  const qualified = await refreshUnlock(client, participant);
  return {
    status: 200,
    body: summary(participant, qualified, {
      referralAccepted: referral.accepted,
      referralReason: referral.reason
    })
  };
}

async function sendVerificationMessage(email, otp) {
  const safeOtp = htmlEscape(otp);
  const subject = "Your EasyFile verification code";
  const plainText = `Your EasyFile verification code is ${otp}. It expires in ${Math.round(VERIFICATION_CODE_TTL_SECONDS / 60)} minutes. If you did not request this code, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
        <p style="margin:0 0 18px;color:#2563eb;font-weight:800">EasyFile · Email verification</p>
        <h1 style="margin:0 0 12px;font-size:26px">Verify your email</h1>
        <p style="line-height:1.6;color:#475569">Enter this six-digit code in EasyFile. It expires in ${Math.round(VERIFICATION_CODE_TTL_SECONDS / 60)} minutes.</p>
        <p style="margin:26px 0;padding:18px;border-radius:12px;background:#eff6ff;color:#1d4ed8;text-align:center;font-size:32px;font-weight:900;letter-spacing:8px">${safeOtp}</p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">If you did not request this code, you can safely ignore this email. Never share this code with anyone.</p>
      </div>
    </div></body></html>`;
  return sendEmail(email, subject, plainText, html);
}

async function verificationRequestHandler(body) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!emailDeliveryConfigured()) {
    return { status: 503, body: { error: "EasyFile email verification is not configured yet." } };
  }
  if (EMAIL_HMAC_SECRET.length < 32) {
    return { status: 503, body: { error: "EasyFile email verification is not ready." } };
  }

  const client = await table();
  const rowKey = participantId(email);
  const requestIdHash = crypto.createHash("sha256").update(safeText(body.requestId, 128)).digest("hex");
  let prepared;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await getEntity(client, "verification", rowKey);
    const currentTime = Date.now();
    const previousSentAt = Date.parse(existing?.sentAt || "") || 0;
    const retryAfterSeconds = Math.max(0, VERIFICATION_RESEND_SECONDS - Math.floor((currentTime - previousSentAt) / 1000));
    if (existing && existing.requestIdHash === requestIdHash && retryAfterSeconds > 0) {
      return { status: 202, body: { verificationRequired: true, emailMasked: maskEmail(email), expiresAt: existing.expiresAt, resendAfterSeconds: retryAfterSeconds, duplicate: true } };
    }
    if (existing && retryAfterSeconds > 0) {
      return { status: 429, headers: { "Retry-After": String(retryAfterSeconds) }, body: { error: `Wait ${retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds } };
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const salt = crypto.randomBytes(18).toString("base64url");
    const next = {
      partitionKey: "verification", rowKey, otpHash: otpDigest(email, otp, salt), salt,
      expiresAt: currentTime + VERIFICATION_CODE_TTL_SECONDS * 1000, attempts: 0,
      sentAt: now(), requestIdHash, status: "sending"
    };
    try {
      if (existing) await client.updateEntity(next, "Replace", { etag: entityTag(existing) });
      else await client.createEntity(next);
      prepared = { otp, expiresAt: next.expiresAt };
      break;
    } catch (error) {
      if (![409, 412].includes(error.statusCode)) throw error;
    }
  }
  if (!prepared) return { status: 409, body: { error: "A verification request is already being processed. Please retry." } };

  try {
    await sendVerificationMessage(email, prepared.otp);
    const current = await getEntity(client, "verification", rowKey);
    if (current?.requestIdHash === requestIdHash) {
      await client.updateEntity({ partitionKey: "verification", rowKey, status: "sent", deliveredAt: now() }, "Merge", { etag: entityTag(current) }).catch((error) => { if (error.statusCode !== 412) throw error; });
    }
  } catch (error) {
    const current = await getEntity(client, "verification", rowKey);
    if (current?.requestIdHash === requestIdHash) {
      await client.updateEntity({ partitionKey: "verification", rowKey, status: "delivery-failed", deliveryFailedAt: now() }, "Merge", { etag: entityTag(current) }).catch(() => {});
    }
    throw error;
  }

  return {
    status: 202,
    body: {
      verificationRequired: true,
      emailMasked: maskEmail(email),
      expiresAt: prepared.expiresAt,
      resendAfterSeconds: VERIFICATION_RESEND_SECONDS
    }
  };
}

async function verificationConfirmHandler(body) {
  const email = normalizeEmail(body.email);
  const suppliedCode = String(body.code || "").replace(/\D/g, "");
  if (!email || !/^\d{6}$/.test(suppliedCode)) {
    return { status: 400, body: { error: "A valid email and six-digit verification code are required." } };
  }

  const client = await table();
  const rowKey = participantId(email);
  for (let contention = 0; contention < 6; contention += 1) {
    const verification = await getEntity(client, "verification", rowKey);
    if (!verification) return { status: 410, body: { error: "The verification code is missing or expired. Request a new code." } };
    if (Number(verification.expiresAt || 0) <= Date.now()) {
      await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) }).catch(() => {});
      return { status: 410, body: { error: "The verification code expired. Request a new code." } };
    }
    const attempts = Number(verification.attempts || 0);
    if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
      await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) }).catch(() => {});
      return { status: 429, body: { error: "Too many incorrect attempts. Request a new verification code." } };
    }
    const expected = String(verification.otpHash || "");
    const supplied = otpDigest(email, suppliedCode, verification.salt);
    const matches = supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    try {
      if (matches) {
        await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) });
        const emailVerificationExpiresAt = Date.now() + VERIFICATION_TOKEN_TTL_SECONDS * 1000;
        return { status: 200, body: { emailVerified: true, emailMasked: maskEmail(email), emailVerificationToken: verificationToken(email, emailVerificationExpiresAt), emailVerificationExpiresAt } };
      }
      const nextAttempts = attempts + 1;
      await client.updateEntity({ partitionKey: "verification", rowKey, attempts: nextAttempts, lastAttemptAt: now() }, "Merge", { etag: entityTag(verification) });
      const remaining = Math.max(0, VERIFICATION_MAX_ATTEMPTS - nextAttempts);
      return { status: remaining ? 401 : 429, body: { error: remaining ? `The verification code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Request a new verification code." } };
    } catch (error) {
      if (![404, 409, 412].includes(error.statusCode)) throw error;
    }
  }
  return { status: 409, body: { error: "Verification state changed concurrently. Please retry." } };
}

async function reserveInvitation(client, partitionKey, recipientId) {
  const day = new Date().toISOString().slice(0, 10);
  const counterRowKey = `daily:${day}`;
  for (let contention = 0; contention < 6; contention += 1) {
    const [existing, counter] = await Promise.all([
      getEntity(client, partitionKey, recipientId),
      getEntity(client, partitionKey, counterRowKey)
    ]);
    const elapsedSeconds = Math.floor((Date.now() - (Date.parse(existing?.sentAt || "") || 0)) / 1000);
    if (existing && elapsedSeconds < INVITE_COOLDOWN_SECONDS) {
      return { status: 429, retryAfterSeconds: INVITE_COOLDOWN_SECONDS - elapsedSeconds };
    }
    const sentCount = Number(counter?.sentCount || 0);
    if (sentCount >= INVITE_DAILY_LIMIT) return { status: 429, dailyLimit: true };

    const transaction = new TableTransaction();
    const invite = {
      partitionKey, rowKey: recipientId, day, sentAt: now(), status: "sending",
      recipientIdentityVersion: EMAIL_HMAC_SECRET ? "hmac-sha256-v1" : "sha256-legacy"
    };
    if (existing) transaction.updateEntity(invite, "Replace", { etag: entityTag(existing) });
    else transaction.createEntity(invite);
    const nextCounter = { partitionKey, rowKey: counterRowKey, entityType: "invite-daily-counter", day, sentCount: sentCount + 1, updatedAt: now() };
    if (counter) transaction.updateEntity(nextCounter, "Replace", { etag: entityTag(counter) });
    else transaction.createEntity(nextCounter);
    try {
      await client.submitTransaction(transaction.actions);
      return { status: 202, invitation: invite };
    } catch (error) {
      if (![409, 412].includes(error.statusCode)) throw error;
    }
  }
  return { status: 409 };
}

async function sendInvitationMessage(recipientEmail, referralCode) {
  const referralUrl = new URL("https://www.easyfile.co.za/index.html");
  referralUrl.searchParams.set("ref", referralCode);
  referralUrl.searchParams.set("utm_source", "easyfile-referral-email");
  referralUrl.searchParams.set("utm_medium", "email");
  const url = referralUrl.toString();
  const subject = "You have been invited to try EasyFile";
  const plainText = `You have been invited to try EasyFile. Create your first business document free, then verify your email before your use can qualify the referral. Open: ${url}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
        <p style="margin:0 0 18px;color:#2563eb;font-weight:800">EasyFile · Referral invitation</p>
        <h1 style="margin:0 0 12px;font-size:26px">Create your first business document free</h1>
        <p style="line-height:1.6;color:#475569">You have been invited to try EasyFile. Open the secure referral link, verify your email, and complete one qualifying Save, Preview, Print or Export action.</p>
        <p style="margin:28px 0"><a href="${htmlEscape(url)}" style="display:inline-block;border-radius:10px;padding:14px 22px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800">Open EasyFile</a></p>
        <p style="color:#64748b;font-size:13px;line-height:1.5">Referral code: <strong>${htmlEscape(referralCode)}</strong>. Opening the link does not award referral credit; a verified qualifying use is required.</p>
      </div>
    </div></body></html>`;
  return sendEmail(recipientEmail, subject, plainText, html);
}

async function inviteHandler(body, request) {
  const email = normalizeEmail(body.email);
  const recipientEmail = normalizeEmail(body.recipientEmail);
  const referralCode = normalizeReferralCode(body.referralCode);
  if (!email || !recipientEmail || !referralCode) {
    return { status: 400, body: { error: "A verified sender, recipient email and referral code are required." } };
  }
  if (email === recipientEmail) return { status: 400, body: { error: "Self-referral invitations are not allowed." } };
  if (!hasVerifiedEmail(body, request)) {
    return { status: 401, body: { error: "Verify your email before EasyFile sends a referral invitation." } };
  }
  if (!emailDeliveryConfigured()) {
    return { status: 503, body: { error: "EasyFile referral email delivery is not configured yet." } };
  }

  const client = await table();
  const participant = await findParticipant(client, email);
  if (!participant || participant.referralCode !== referralCode) {
    return { status: 403, body: { error: "The referral code does not belong to the verified sender." } };
  }

  const partitionKey = `invite:${participant.rowKey}`;
  const recipientId = participantId(recipientEmail);
  const reservation = await reserveInvitation(client, partitionKey, recipientId);
  if (reservation.status === 429) {
    if (reservation.dailyLimit) return { status: 429, body: { error: `The daily invitation limit of ${INVITE_DAILY_LIMIT} has been reached.` } };
    return { status: 429, headers: { "Retry-After": String(reservation.retryAfterSeconds) }, body: { error: "An invitation was already sent to this address recently.", retryAfterSeconds: reservation.retryAfterSeconds } };
  }
  if (reservation.status !== 202) return { status: 409, body: { error: "Invitation state changed concurrently. Please retry." } };
  try {
    await sendInvitationMessage(recipientEmail, referralCode);
    const current = await getEntity(client, partitionKey, recipientId);
    if (current) await client.updateEntity({ partitionKey, rowKey: recipientId, status: "sent", deliveredAt: now() }, "Merge", { etag: entityTag(current) });
  } catch (error) {
    const current = await getEntity(client, partitionKey, recipientId);
    if (current) await client.updateEntity({ partitionKey, rowKey: recipientId, status: "delivery-failed", deliveryFailedAt: now() }, "Merge", { etag: entityTag(current) }).catch(() => {});
    throw error;
  }

  return {
    status: 202,
    body: {
      sent: true,
      recipientMasked: maskEmail(recipientEmail),
      sender: EMAIL_SENDER
    }
  };
}

async function qualifyReferrer(client, participant, moduleId, eventName) {
  if (!participant.referredBy) return { qualified: false, referrerUnlocked: false };

  const partitionKey = `referral:${participant.referredBy}`;
  const existing = await getEntity(client, partitionKey, participant.rowKey);
  let firstQualification = !existing?.qualified;

  if (firstQualification) {
    try {
      await client.createEntity({
        partitionKey,
        rowKey: participant.rowKey,
        qualified: true,
        qualifiedAt: now(),
        lastQualifiedAt: now(),
        moduleId,
        eventName
      });
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      firstQualification = false;
    }
  } else {
    await client.updateEntity({
      partitionKey,
      rowKey: participant.rowKey,
      lastQualifiedAt: now(),
      moduleId,
      eventName
    }, "Merge");
  }

  const owner = await getEntity(client, "participant", participant.referredBy);
  if (!owner) return { qualified: firstQualification, referrerUnlocked: false };
  const count = await refreshUnlock(client, owner);
  return {
    qualified: firstQualification,
    referrerUnlocked: owner.unlocked === true,
    referrerQualifiedCount: count
  };
}

function qualificationOutboxRowKey(markerRowKey) {
  return `qualification-${crypto.createHash("sha256").update(markerRowKey).digest("hex").slice(0, 40)}`;
}

async function completeQualificationJob(client, job, result) {
  try {
    await client.updateEntity({
      partitionKey: job.partitionKey, rowKey: job.rowKey, status: "completed", completedAt: now(),
      referrerUnlocked: result.referrerUnlocked === true,
      referrerQualifiedCount: Number(result.referrerQualifiedCount || 0),
      qualified: result.qualified === true
    }, "Merge", { etag: entityTag(job) });
  } catch (error) {
    if (error.statusCode !== 412) throw error;
  }
}

async function deferQualificationJob(client, job, error) {
  const attempts = Number(job.attempts || 0) + 1;
  const delaySeconds = Math.min(3600, OUTBOX_RETRY_SECONDS * (2 ** Math.min(6, attempts - 1)));
  try {
    await client.updateEntity({
      partitionKey: job.partitionKey, rowKey: job.rowKey,
      status: attempts >= OUTBOX_MAX_ATTEMPTS ? "manual-review" : "pending",
      attempts, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lastError: safeText(error?.message || "qualification-failed", 120), lastAttemptAt: now()
    }, "Merge", { etag: entityTag(job) });
  } catch (updateError) {
    if (updateError.statusCode !== 412) throw updateError;
  }
}

async function reconcileQualificationJob(client, job) {
  if (!job?.referrerId || job.status === "completed" || job.status === "manual-review") return { pending: false, qualified: job?.qualified === true };
  try {
    const participant = { rowKey: job.participantId, referredBy: job.referrerId };
    const result = await qualifyReferrer(client, participant, job.moduleId, job.eventName);
    await completeQualificationJob(client, job, result);
    return { pending: false, ...result };
  } catch (error) {
    await deferQualificationJob(client, job, error);
    return { pending: true, qualified: false, referrerUnlocked: false };
  }
}

async function reconcileQualificationOutbox() {
  const client = await table();
  const jobs = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'participant' and entityType eq 'qualification-outbox'" } });
  let processed = 0;
  for await (const job of jobs) {
    if (processed >= 100) break;
    if (job.status === "completed" || job.status === "manual-review") continue;
    if (Date.parse(job.nextAttemptAt || "") > Date.now()) continue;
    await reconcileQualificationJob(client, job);
    processed += 1;
  }
  return processed;
}

function useMarkerRowKey(participant, idempotencyKey) {
  const digest = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
  return `use-${participant.rowKey.slice(0, 24)}-${digest.slice(0, 32)}`;
}

async function consumeTrial(client, participant, body, moduleId, eventName) {
  const suppliedKey = safeText(body.idempotencyKey, 128);
  if (REQUIRE_IDEMPOTENCY && !IDEMPOTENCY_KEY.test(suppliedKey)) {
    return { status: 400, error: "A valid idempotencyKey is required." };
  }
  const idempotencyKey = suppliedKey || `legacy-${crypto.randomUUID()}`;
  const markerRowKey = useMarkerRowKey(participant, idempotencyKey);
  const existing = await getEntity(client, "participant", markerRowKey);
  if (existing) return { duplicate: true, consumed: false, markerRowKey, outboxRowKey: qualificationOutboxRowKey(markerRowKey) };

  const usedAt = now();
  const transaction = new TableTransaction();
  transaction.updateEntity({
    partitionKey: "participant",
    rowKey: participant.rowKey,
    trialUsed: true,
    firstUseAt: participant.firstUseAt || usedAt,
    firstUseModule: participant.firstUseModule || moduleId,
    firstUseEvent: participant.firstUseEvent || eventName,
    lastUseAt: usedAt,
    lastUseModule: moduleId,
    lastUseEvent: eventName
  }, "Merge", { etag: entityTag(participant) });
  transaction.createEntity({
    partitionKey: "participant",
    rowKey: markerRowKey,
    entityType: "qualifying-use",
    participantId: participant.rowKey,
    idempotencyHash: crypto.createHash("sha256").update(idempotencyKey).digest("hex"),
    moduleId,
    eventName,
    occurredAt: safeText(body.occurredAt, 40) || usedAt,
    createdAt: usedAt
  });
  const outboxRowKey = qualificationOutboxRowKey(markerRowKey);
  if (participant.referredBy) {
    transaction.createEntity({
      partitionKey: "participant", rowKey: outboxRowKey, entityType: "qualification-outbox",
      status: "pending", attempts: 0, nextAttemptAt: usedAt, createdAt: usedAt,
      participantId: participant.rowKey, referrerId: participant.referredBy,
      moduleId, eventName, useMarkerRowKey: markerRowKey
    });
  }

  try {
    await client.submitTransaction(transaction.actions);
    participant.trialUsed = true;
    participant.firstUseAt = participant.firstUseAt || usedAt;
    participant.firstUseModule = participant.firstUseModule || moduleId;
    participant.firstUseEvent = participant.firstUseEvent || eventName;
    return { duplicate: false, consumed: true, markerRowKey, outboxRowKey: participant.referredBy ? outboxRowKey : "" };
  } catch (error) {
    if (![409, 412].includes(error.statusCode)) throw error;
    const [fresh, marker] = await Promise.all([
      client.getEntity("participant", participant.rowKey),
      getEntity(client, "participant", markerRowKey)
    ]);
    Object.assign(participant, fresh);
    if (marker) return { duplicate: true, consumed: false, markerRowKey, outboxRowKey: qualificationOutboxRowKey(markerRowKey) };
    return { duplicate: false, consumed: false, concurrent: true };
  }
}

async function useHandler(body, request) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!verifiedEmail(body, request)) {
    return { status: 401, body: { error: "Email ownership must be verified before referral access can be used." } };
  }

  const moduleId = safeText(body.moduleId, 64).toLowerCase();
  const eventName = safeText(body.event, 160).toLowerCase();
  if (!MODULE_ID.test(moduleId)) return { status: 400, body: { error: "A valid moduleId is required." } };
  if (!QUALIFYING_ACTION.test(eventName)) {
    return { status: 400, body: { error: "The event is not a qualifying EasyFile use." } };
  }

  const client = await table();
  const participant = await ensureParticipant(client, email);
  let qualified = await refreshUnlock(client, participant);

  if (participant.unlocked === true) {
    return { status: 200, body: summary(participant, qualified, { alreadyUnlocked: true }) };
  }

  if (participant.trialUsed === true) {
    const suppliedKey = safeText(body.idempotencyKey, 128);
    if (suppliedKey) {
      const marker = await getEntity(client, "participant", useMarkerRowKey(participant, suppliedKey));
      if (marker) {
        const job = await getEntity(client, "participant", qualificationOutboxRowKey(useMarkerRowKey(participant, suppliedKey)));
        await reconcileQualificationJob(client, job);
        qualified = await refreshUnlock(client, participant);
        return { status: 200, body: summary(participant, qualified, { duplicate: true, trialConsumed: false }) };
      }
    }
    return {
      status: 403,
      body: summary(participant, qualified, { error: "Referral access is required before another EasyFile use." })
    };
  }

  const consumption = await consumeTrial(client, participant, body, moduleId, eventName);
  if (consumption.status) return { status: consumption.status, body: { error: consumption.error } };
  if (consumption.concurrent && participant.trialUsed === true) {
    qualified = await refreshUnlock(client, participant);
    return {
      status: 409,
      body: summary(participant, qualified, { error: "Another qualifying-use request was processed concurrently. Refresh access status." })
    };
  }
  if (consumption.duplicate) {
    const job = consumption.outboxRowKey && await getEntity(client, "participant", consumption.outboxRowKey);
    await reconcileQualificationJob(client, job);
    qualified = await refreshUnlock(client, participant);
    return { status: 200, body: summary(participant, qualified, { duplicate: true, trialConsumed: false }) };
  }

  const job = consumption.outboxRowKey && await getEntity(client, "participant", consumption.outboxRowKey);
  const referralResult = await reconcileQualificationJob(client, job);
  qualified = await refreshUnlock(client, participant);
  return {
    status: 200,
    body: summary(participant, qualified, {
      trialConsumed: true,
      referralQualified: referralResult.qualified,
      referralQualificationPending: referralResult.pending === true,
      referrerUnlocked: referralResult.referrerUnlocked,
      referrerQualifiedCount: referralResult.referrerQualifiedCount || 0
    })
  };
}

function configuredOrigins() {
  const raw = String(process.env.EASYFILE_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","));
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
}

function allowedOrigin(request) {
  const configured = configuredOrigins();
  const origin = request.headers.get("origin") || "";
  if (!origin) return "";
  if (configured.includes("*") && envBoolean("EASYFILE_ALLOW_WILDCARD_CORS", false)) return "*";
  return configured.includes(origin) ? origin : "";
}

function baseHeaders(request) {
  const origin = allowedOrigin(request);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(request, status, body, extraHeaders = {}) {
  return { status, headers: { ...baseHeaders(request), ...extraHeaders }, body: JSON.stringify(body) };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    const error = new Error("Request payload is too large.");
    error.statusCode = 413;
    throw error;
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Request payload is too large.");
    error.statusCode = 413;
    throw error;
  }
  try { return JSON.parse(text || "{}"); }
  catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function referralApi(request, context) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigin(request);
  if (origin && !allowed) return response(request, 403, { error: "Origin is not allowed." });

  if (request.method === "OPTIONS") {
    if (!origin || !allowed) return response(request, 403, { error: "Origin is not allowed." });
    return {
      status: 204,
      headers: {
        ...baseHeaders(request),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-EasyFile-Client",
        "Access-Control-Max-Age": "600"
      }
    };
  }

  const action = safeText(request.params.action || "health", 32).toLowerCase();
  if (request.method === "GET" && action === "health") {
    const status = readiness();
    try {
      await table();
      const code = status.ready ? 200 : 503;
      return response(request, code, {
        status: status.ready ? "ok" : "degraded",
        service: "easyfile-referrals",
        referralsRequired: REQUIRED_REFERRALS,
        requireIdempotency: REQUIRE_IDEMPOTENCY,
        requireVerifiedEmail: REQUIRE_VERIFIED_EMAIL,
        issues: status.issues
      });
    } catch (error) {
      context.error(error);
      return response(request, 503, { status: "error", error: "Referral storage is unavailable.", issues: status.issues });
    }
  }

  if (request.method !== "POST") return response(request, 405, { error: "Method not allowed." }, { Allow: "GET,POST,OPTIONS" });
  if (!origin) return response(request, 403, { error: "A browser origin is required." });
  if (!edgeGatewayAuthorized(request)) return response(request, 403, { error: "Referral traffic must use the configured API gateway." });

  try {
    const body = await readJson(request);
    const result = action === "session"
      ? await sessionHandler(body, request)
      : action === "use"
        ? await useHandler(body, request)
        : action === "verification-request"
          ? await verificationRequestHandler(body)
          : action === "verification-confirm"
            ? await verificationConfirmHandler(body)
            : action === "invite"
              ? await inviteHandler(body, request)
              : { status: 404, body: { error: "Referral endpoint not found." } };
    return response(request, result.status, result.body, result.headers || {});
  } catch (error) {
    if ([400, 401, 413, 429, 503].includes(error.statusCode)) {
      return response(request, error.statusCode, { error: error.message });
    }
    context.error(error);
    return response(request, 500, { error: "The referral service could not process the request." });
  }
}

app.http("easyfileReferrals", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "referrals/{action?}",
  handler: referralApi
});

app.timer("easyfileReferralReconciler", {
  schedule: "0 */5 * * * *",
  handler: async (_timer, context) => {
    try {
      const processed = await reconcileQualificationOutbox();
      context.log(`EasyFile referral reconciliation processed ${processed} job(s).`);
    } catch (error) {
      context.error("EasyFile referral reconciliation failed.", error);
      throw error;
    }
  }
});

module.exports.__test = Object.freeze({
  normalizeEmail,
  normalizeReferralCode,
  accessState,
  safeText,
  participantId,
  legacyParticipantId,
  verificationToken,
  otpDigest,
  maskEmail,
  emailDeliveryConfigured,
  useMarkerRowKey,
  configuredOrigins,
  readiness,
  hasVerifiedEmail,
  wouldCreateReferralLoop,
  verificationRequestHandler,
  verificationConfirmHandler,
  inviteHandler,
  sessionHandler,
  useHandler,
  referralApi,
  reconcileQualificationJob,
  qualificationOutboxRowKey,
  reserveInvitation,
  setTableClient(client) { tablePromise = Promise.resolve(client); },
  resetTableClient() { tablePromise = undefined; }
});

referrals.js
"use strict";

const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { TableClient, TableTransaction } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

const REQUIRED_REFERRALS = boundedInt(process.env.EASYFILE_REFERRALS_REQUIRED, 3, 1, 100);
const TABLE_NAME = safeTableName(process.env.EASYFILE_REFERRALS_TABLE || "EasyFileReferrals");
const EMAIL_HMAC_SECRET = String(process.env.EASYFILE_EMAIL_HMAC_SECRET || "").trim();
const EMAIL_CONNECTION_STRING = String(process.env.EASYFILE_EMAIL_CONNECTION_STRING || "").trim();
const EMAIL_SENDER = normalizeEmail(process.env.EASYFILE_EMAIL_SENDER || "referrals@easyfile.co.za");
const REQUIRE_IDEMPOTENCY = envBoolean("EASYFILE_REQUIRE_IDEMPOTENCY", true);
// Verification is deliberately fail-closed. Local development may opt out explicitly,
// but a deployment that does so is reported unhealthy and must not receive production traffic.
const REQUIRE_VERIFIED_EMAIL = envBoolean("EASYFILE_REQUIRE_EMAIL_VERIFICATION", true);
const TRUST_APP_SERVICE_PRINCIPAL = envBoolean("EASYFILE_TRUST_APP_SERVICE_PRINCIPAL", false);
const REQUIRE_EDGE_GATEWAY = envBoolean("EASYFILE_REQUIRE_EDGE_GATEWAY", false);
const EDGE_SHARED_SECRET = String(process.env.EASYFILE_EDGE_SHARED_SECRET || "").trim();
const MAX_BODY_BYTES = boundedInt(process.env.EASYFILE_MAX_BODY_BYTES, 8192, 1024, 65536);
const VERIFICATION_CODE_TTL_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_CODE_TTL_SECONDS, 600, 300, 1800);
const VERIFICATION_TOKEN_TTL_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_TOKEN_TTL_SECONDS, 86400, 900, 86400);
const VERIFICATION_RESEND_SECONDS = boundedInt(process.env.EASYFILE_VERIFICATION_RESEND_SECONDS, 60, 30, 900);
const VERIFICATION_MAX_ATTEMPTS = boundedInt(process.env.EASYFILE_VERIFICATION_MAX_ATTEMPTS, 5, 3, 10);
const INVITE_COOLDOWN_SECONDS = boundedInt(process.env.EASYFILE_INVITE_COOLDOWN_SECONDS, 86400, 300, 604800);
const INVITE_DAILY_LIMIT = boundedInt(process.env.EASYFILE_INVITE_DAILY_LIMIT, 25, 1, 100);
const OUTBOX_MAX_ATTEMPTS = boundedInt(process.env.EASYFILE_OUTBOX_MAX_ATTEMPTS, 20, 3, 100);
const OUTBOX_RETRY_SECONDS = boundedInt(process.env.EASYFILE_OUTBOX_RETRY_SECONDS, 60, 10, 3600);
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const REFERRAL_CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;
const QUALIFYING_ACTION = /save|preview|print|pdf|word|excel|csv|export|download|generate/i;
const MODULE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const DEFAULT_ORIGINS = [
  "https://www.easyfile.co.za",
  "https://easyfile.co.za",
  "https://easy-online-office.github.io"
];

let tablePromise;
let emailClientInstance;

function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function envBoolean(name, fallback) {
  const value = String(process.env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function safeTableName(value) {
  const name = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name) ? name : "EasyFileReferrals";
}

function connectionString() {
  return process.env.EASYFILE_REFERRALS_STORAGE || process.env.AzureWebJobsStorage || "";
}

function readiness() {
  const origins = configuredOrigins();
  const issues = [];
  if (!connectionString()) issues.push("storage-not-configured");
  if (EMAIL_HMAC_SECRET.length < 32) issues.push("email-hmac-secret-too-short");
  if (!origins.length || origins.includes("*")) issues.push("cors-not-restricted");
  if (!REQUIRE_VERIFIED_EMAIL) issues.push("email-verification-disabled");
  if (REQUIRE_VERIFIED_EMAIL && !EMAIL_CONNECTION_STRING) issues.push("email-delivery-not-configured");
  if (REQUIRE_VERIFIED_EMAIL && !EMAIL_SENDER) issues.push("email-sender-invalid");
  if (REQUIRE_EDGE_GATEWAY && EDGE_SHARED_SECRET.length < 32) issues.push("edge-gateway-not-configured");
  return { ready: issues.length === 0, issues };
}

async function table() {
  if (!tablePromise) {
    tablePromise = (async () => {
      const connection = connectionString();
      if (!connection) throw new Error("EASYFILE_REFERRALS_STORAGE or AzureWebJobsStorage is required.");
      const client = TableClient.fromConnectionString(connection, TABLE_NAME);
      try {
        await client.createTable();
      } catch (error) {
        if (error.statusCode !== 409) throw error;
      }
      return client;
    })();
  }
  return tablePromise;
}

function emailDeliveryConfigured() {
  return Boolean(EMAIL_CONNECTION_STRING && EMAIL_SENDER);
}

function mailer() {
  if (!emailDeliveryConfigured()) {
    const error = new Error("EasyFile email delivery is not configured yet.");
    error.statusCode = 503;
    throw error;
  }
  if (!emailClientInstance) emailClientInstance = new EmailClient(EMAIL_CONNECTION_STRING);
  return emailClientInstance;
}

function htmlEscape(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

async function sendEmail(to, subject, plainText, html) {
  const poller = await mailer().beginSend({
    senderAddress: EMAIL_SENDER,
    content: { subject, plainText, html },
    recipients: { to: [{ address: to }] },
    replyTo: [{ address: "support@easyfile.co.za" }]
  });
  const result = await poller.pollUntilDone();
  if (String(result?.status || "").toLowerCase() !== "succeeded") {
    throw new Error(`Email delivery failed with status ${safeText(result?.status || "unknown", 40)}.`);
  }
  return result;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return "";
  return email;
}

function maskEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return "";
  const [local, domain] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function legacyParticipantId(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

function participantId(email) {
  if (!EMAIL_HMAC_SECRET) return legacyParticipantId(email);
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET).update(email).digest("hex");
}

function verificationToken(email, expiresAt) {
  if (!EMAIL_HMAC_SECRET) return "";
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET)
    .update(`verify:${email}:${expiresAt}`)
    .digest("base64url");
}

function otpDigest(email, otp, salt) {
  if (!EMAIL_HMAC_SECRET) return "";
  return crypto.createHmac("sha256", EMAIL_HMAC_SECRET)
    .update(`otp:${normalizeEmail(email)}:${String(otp)}:${String(salt)}`)
    .digest("base64url");
}

function hasVerifiedEmail(body, request) {
  // This header is only trustworthy when App Service Authentication owns the
  // ingress path and strips caller-provided values. It is disabled by default
  // because the Function has anonymous HTTP routes for the browser client.
  const principal = TRUST_APP_SERVICE_PRINCIPAL && request.headers.get("x-ms-client-principal");
  if (principal) {
    try {
      const decoded = JSON.parse(Buffer.from(principal, "base64").toString("utf8"));
      const claimEmail = decoded?.claims?.find((claim) =>
        ["emails", "email", "preferred_username"].includes(claim.typ)
      )?.val;
      if (normalizeEmail(claimEmail) === normalizeEmail(body.email)) return true;
    } catch (_) {
      // Fall through to signed verification-token validation.
    }
  }

  const expiresAt = Number(body.emailVerificationExpiresAt || 0);
  const supplied = String(body.emailVerificationToken || "");
  if (!expiresAt || expiresAt < Date.now() || expiresAt > Date.now() + 24 * 60 * 60 * 1000) return false;
  const expected = verificationToken(normalizeEmail(body.email), expiresAt);
  if (!supplied || supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function edgeGatewayAuthorized(request) {
  if (!REQUIRE_EDGE_GATEWAY) return true;
  const supplied = String(request.headers.get("x-easyfile-edge-key") || "");
  if (!EDGE_SHARED_SECRET || supplied.length !== EDGE_SHARED_SECRET.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(EDGE_SHARED_SECRET));
}

function verifiedEmail(body, request) {
  return !REQUIRE_VERIFIED_EMAIL || hasVerifiedEmail(body, request);
}

function now() {
  return new Date().toISOString();
}

function code() {
  const bytes = crypto.randomBytes(8);
  let output = "";
  for (let index = 0; index < 8; index += 1) {
    output += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return output;
}

function safeText(value, maxLength = 120) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeReferralCode(value) {
  const normalized = safeText(value, 16).toUpperCase();
  return REFERRAL_CODE.test(normalized) ? normalized : "";
}

function entityTag(entity) {
  return entity?.etag || entity?.["odata.etag"] || "*";
}

async function getEntity(client, partitionKey, rowKey) {
  try {
    return await client.getEntity(partitionKey, rowKey);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function createReferralCode(client, ownerId) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const referralCode = code();
    try {
      await client.createEntity({
        partitionKey: "code",
        rowKey: referralCode,
        ownerId,
        createdAt: now()
      });
      return referralCode;
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

async function findParticipant(client, email) {
  const currentId = participantId(email);
  let participant = await getEntity(client, "participant", currentId);
  if (participant) return participant;

  const legacyId = legacyParticipantId(email);
  if (legacyId !== currentId) participant = await getEntity(client, "participant", legacyId);
  return participant;
}

async function ensureParticipant(client, email) {
  let participant = await findParticipant(client, email);
  if (!participant) {
    const id = participantId(email);
    const referralCode = await createReferralCode(client, id);
    participant = {
      partitionKey: "participant",
      rowKey: id,
      referralCode,
      identityVersion: EMAIL_HMAC_SECRET ? "hmac-sha256-v1" : "sha256-legacy",
      emailVerified: REQUIRE_VERIFIED_EMAIL,
      trialUsed: false,
      unlocked: false,
      createdAt: now(),
      lastSeenAt: now()
    };
    try {
      await client.createEntity(participant);
      participant = await client.getEntity("participant", id);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      participant = await client.getEntity("participant", id);
    }
  } else {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      lastSeenAt: now(),
      emailVerified: participant.emailVerified === true || REQUIRE_VERIFIED_EMAIL
    }, "Merge", { etag: entityTag(participant) }).catch((error) => {
      if (error.statusCode !== 412) throw error;
    });
    participant = await client.getEntity(participant.partitionKey, participant.rowKey);
  }
  return participant;
}

async function qualifiedReferralCount(client, ownerId) {
  let count = 0;
  const entities = client.listEntities({
    queryOptions: { filter: `PartitionKey eq 'referral:${ownerId}' and qualified eq true` }
  });
  for await (const _entity of entities) count += 1;
  return count;
}

async function refreshUnlock(client, participant) {
  const qualified = await qualifiedReferralCount(client, participant.rowKey);
  if (qualified >= REQUIRED_REFERRALS && participant.unlocked !== true) {
    try {
      await client.updateEntity({
        partitionKey: participant.partitionKey,
        rowKey: participant.rowKey,
        unlocked: true,
        unlockedAt: now()
      }, "Merge", { etag: entityTag(participant) });
      participant.unlocked = true;
    } catch (error) {
      if (error.statusCode !== 412) throw error;
      const fresh = await client.getEntity(participant.partitionKey, participant.rowKey);
      Object.assign(participant, fresh);
    }
  }
  return qualified;
}

function accessState(participant) {
  if (participant.unlocked === true) return "unlocked";
  if (participant.trialUsed === true) return "locked";
  return "trial";
}

function summary(participant, qualified, extra = {}) {
  return {
    access: accessState(participant),
    referralCode: participant.referralCode,
    referralsQualified: qualified,
    referralsRequired: REQUIRED_REFERRALS,
    trialUsed: participant.trialUsed === true,
    unlocked: participant.unlocked === true,
    referred: Boolean(participant.referredBy),
    emailVerified: participant.emailVerified === true,
    updatedAt: now(),
    ...extra
  };
}

async function wouldCreateReferralLoop(client, participantIdToBind, prospectiveReferrerId) {
  // A normal account can bind only once, but checking the ancestry chain also
  // protects migrated/manual records from A -> B -> ... -> A cycles.
  let currentId = prospectiveReferrerId;
  const visited = new Set();
  for (let depth = 0; currentId && depth < 32; depth += 1) {
    if (currentId === participantIdToBind) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const current = await getEntity(client, "participant", currentId);
    if (!current) return false;
    currentId = String(current.referredBy || "");
  }
  // An excessively deep chain is treated as suspicious instead of creating a
  // relationship whose safety cannot be established deterministically.
  return Boolean(currentId);
}

async function attachReferral(client, participant, referralCode) {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) return { accepted: false, reason: referralCode ? "invalid" : "missing" };
  if (participant.referredBy || participant.trialUsed === true) {
    return { accepted: false, reason: "already-bound" };
  }

  const index = await getEntity(client, "code", normalizedCode);
  if (!index?.ownerId) return { accepted: false, reason: "invalid" };
  if (index.ownerId === participant.rowKey) return { accepted: false, reason: "self-referral" };
  if (await wouldCreateReferralLoop(client, participant.rowKey, index.ownerId)) {
    return { accepted: false, reason: "referral-loop" };
  }

  try {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      referredBy: index.ownerId,
      referredByCode: normalizedCode,
      referredAt: now()
    }, "Merge", { etag: entityTag(participant) });
    participant.referredBy = index.ownerId;
    participant.referredByCode = normalizedCode;
    return { accepted: true, reason: "accepted" };
  } catch (error) {
    if (error.statusCode !== 412) throw error;
    const fresh = await client.getEntity(participant.partitionKey, participant.rowKey);
    Object.assign(participant, fresh);
    return { accepted: false, reason: participant.referredBy ? "already-bound" : "concurrent-update" };
  }
}

async function sessionHandler(body, request) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!verifiedEmail(body, request)) {
    return { status: 401, body: { error: "Email ownership must be verified before referral access can be used." } };
  }

  const client = await table();
  const participant = await ensureParticipant(client, email);
  if (hasVerifiedEmail(body, request) && participant.emailVerified !== true) {
    await client.updateEntity({
      partitionKey: participant.partitionKey,
      rowKey: participant.rowKey,
      emailVerified: true,
      emailVerifiedAt: now()
    }, "Merge", { etag: entityTag(participant) }).catch((error) => {
      if (error.statusCode !== 412) throw error;
    });
    participant.emailVerified = true;
  }
  let referral = { accepted: false, reason: "not-supplied" };
  if (body.referralCode) referral = await attachReferral(client, participant, body.referralCode);
  const qualified = await refreshUnlock(client, participant);
  return {
    status: 200,
    body: summary(participant, qualified, {
      referralAccepted: referral.accepted,
      referralReason: referral.reason
    })
  };
}

async function sendVerificationMessage(email, otp) {
  const safeOtp = htmlEscape(otp);
  const subject = "Your EasyFile verification code";
  const plainText = `Your EasyFile verification code is ${otp}. It expires in ${Math.round(VERIFICATION_CODE_TTL_SECONDS / 60)} minutes. If you did not request this code, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
        <p style="margin:0 0 18px;color:#2563eb;font-weight:800">EasyFile · Email verification</p>
        <h1 style="margin:0 0 12px;font-size:26px">Verify your email</h1>
        <p style="line-height:1.6;color:#475569">Enter this six-digit code in EasyFile. It expires in ${Math.round(VERIFICATION_CODE_TTL_SECONDS / 60)} minutes.</p>
        <p style="margin:26px 0;padding:18px;border-radius:12px;background:#eff6ff;color:#1d4ed8;text-align:center;font-size:32px;font-weight:900;letter-spacing:8px">${safeOtp}</p>
        <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">If you did not request this code, you can safely ignore this email. Never share this code with anyone.</p>
      </div>
    </div></body></html>`;
  return sendEmail(email, subject, plainText, html);
}

async function verificationRequestHandler(body) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!emailDeliveryConfigured()) {
    return { status: 503, body: { error: "EasyFile email verification is not configured yet." } };
  }
  if (EMAIL_HMAC_SECRET.length < 32) {
    return { status: 503, body: { error: "EasyFile email verification is not ready." } };
  }

  const client = await table();
  const rowKey = participantId(email);
  const requestIdHash = crypto.createHash("sha256").update(safeText(body.requestId, 128)).digest("hex");
  let prepared;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const existing = await getEntity(client, "verification", rowKey);
    const currentTime = Date.now();
    const previousSentAt = Date.parse(existing?.sentAt || "") || 0;
    const retryAfterSeconds = Math.max(0, VERIFICATION_RESEND_SECONDS - Math.floor((currentTime - previousSentAt) / 1000));
    if (existing && existing.requestIdHash === requestIdHash && retryAfterSeconds > 0) {
      return { status: 202, body: { verificationRequired: true, emailMasked: maskEmail(email), expiresAt: existing.expiresAt, resendAfterSeconds: retryAfterSeconds, duplicate: true } };
    }
    if (existing && retryAfterSeconds > 0) {
      return { status: 429, headers: { "Retry-After": String(retryAfterSeconds) }, body: { error: `Wait ${retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds } };
    }

    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const salt = crypto.randomBytes(18).toString("base64url");
    const next = {
      partitionKey: "verification", rowKey, otpHash: otpDigest(email, otp, salt), salt,
      expiresAt: currentTime + VERIFICATION_CODE_TTL_SECONDS * 1000, attempts: 0,
      sentAt: now(), requestIdHash, status: "sending"
    };
    try {
      if (existing) await client.updateEntity(next, "Replace", { etag: entityTag(existing) });
      else await client.createEntity(next);
      prepared = { otp, expiresAt: next.expiresAt };
      break;
    } catch (error) {
      if (![409, 412].includes(error.statusCode)) throw error;
    }
  }
  if (!prepared) return { status: 409, body: { error: "A verification request is already being processed. Please retry." } };

  try {
    await sendVerificationMessage(email, prepared.otp);
    const current = await getEntity(client, "verification", rowKey);
    if (current?.requestIdHash === requestIdHash) {
      await client.updateEntity({ partitionKey: "verification", rowKey, status: "sent", deliveredAt: now() }, "Merge", { etag: entityTag(current) }).catch((error) => { if (error.statusCode !== 412) throw error; });
    }
  } catch (error) {
    const current = await getEntity(client, "verification", rowKey);
    if (current?.requestIdHash === requestIdHash) {
      await client.updateEntity({ partitionKey: "verification", rowKey, status: "delivery-failed", deliveryFailedAt: now() }, "Merge", { etag: entityTag(current) }).catch(() => {});
    }
    throw error;
  }

  return {
    status: 202,
    body: {
      verificationRequired: true,
      emailMasked: maskEmail(email),
      expiresAt: prepared.expiresAt,
      resendAfterSeconds: VERIFICATION_RESEND_SECONDS
    }
  };
}

async function verificationConfirmHandler(body) {
  const email = normalizeEmail(body.email);
  const suppliedCode = String(body.code || "").replace(/\D/g, "");
  if (!email || !/^\d{6}$/.test(suppliedCode)) {
    return { status: 400, body: { error: "A valid email and six-digit verification code are required." } };
  }

  const client = await table();
  const rowKey = participantId(email);
  for (let contention = 0; contention < 6; contention += 1) {
    const verification = await getEntity(client, "verification", rowKey);
    if (!verification) return { status: 410, body: { error: "The verification code is missing or expired. Request a new code." } };
    if (Number(verification.expiresAt || 0) <= Date.now()) {
      await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) }).catch(() => {});
      return { status: 410, body: { error: "The verification code expired. Request a new code." } };
    }
    const attempts = Number(verification.attempts || 0);
    if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
      await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) }).catch(() => {});
      return { status: 429, body: { error: "Too many incorrect attempts. Request a new verification code." } };
    }
    const expected = String(verification.otpHash || "");
    const supplied = otpDigest(email, suppliedCode, verification.salt);
    const matches = supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    try {
      if (matches) {
        await client.deleteEntity("verification", rowKey, { etag: entityTag(verification) });
        const emailVerificationExpiresAt = Date.now() + VERIFICATION_TOKEN_TTL_SECONDS * 1000;
        return { status: 200, body: { emailVerified: true, emailMasked: maskEmail(email), emailVerificationToken: verificationToken(email, emailVerificationExpiresAt), emailVerificationExpiresAt } };
      }
      const nextAttempts = attempts + 1;
      await client.updateEntity({ partitionKey: "verification", rowKey, attempts: nextAttempts, lastAttemptAt: now() }, "Merge", { etag: entityTag(verification) });
      const remaining = Math.max(0, VERIFICATION_MAX_ATTEMPTS - nextAttempts);
      return { status: remaining ? 401 : 429, body: { error: remaining ? `The verification code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Request a new verification code." } };
    } catch (error) {
      if (![404, 409, 412].includes(error.statusCode)) throw error;
    }
  }
  return { status: 409, body: { error: "Verification state changed concurrently. Please retry." } };
}

async function reserveInvitation(client, partitionKey, recipientId) {
  const day = new Date().toISOString().slice(0, 10);
  const counterRowKey = `daily:${day}`;
  for (let contention = 0; contention < 6; contention += 1) {
    const [existing, counter] = await Promise.all([
      getEntity(client, partitionKey, recipientId),
      getEntity(client, partitionKey, counterRowKey)
    ]);
    const elapsedSeconds = Math.floor((Date.now() - (Date.parse(existing?.sentAt || "") || 0)) / 1000);
    if (existing && elapsedSeconds < INVITE_COOLDOWN_SECONDS) {
      return { status: 429, retryAfterSeconds: INVITE_COOLDOWN_SECONDS - elapsedSeconds };
    }
    const sentCount = Number(counter?.sentCount || 0);
    if (sentCount >= INVITE_DAILY_LIMIT) return { status: 429, dailyLimit: true };

    const transaction = new TableTransaction();
    const invite = {
      partitionKey, rowKey: recipientId, day, sentAt: now(), status: "sending",
      recipientIdentityVersion: EMAIL_HMAC_SECRET ? "hmac-sha256-v1" : "sha256-legacy"
    };
    if (existing) transaction.updateEntity(invite, "Replace", { etag: entityTag(existing) });
    else transaction.createEntity(invite);
    const nextCounter = { partitionKey, rowKey: counterRowKey, entityType: "invite-daily-counter", day, sentCount: sentCount + 1, updatedAt: now() };
    if (counter) transaction.updateEntity(nextCounter, "Replace", { etag: entityTag(counter) });
    else transaction.createEntity(nextCounter);
    try {
      await client.submitTransaction(transaction.actions);
      return { status: 202, invitation: invite };
    } catch (error) {
      if (![409, 412].includes(error.statusCode)) throw error;
    }
  }
  return { status: 409 };
}

async function sendInvitationMessage(recipientEmail, referralCode) {
  const referralUrl = new URL("https://www.easyfile.co.za/index.html");
  referralUrl.searchParams.set("ref", referralCode);
  referralUrl.searchParams.set("utm_source", "easyfile-referral-email");
  referralUrl.searchParams.set("utm_medium", "email");
  const url = referralUrl.toString();
  const subject = "You have been invited to try EasyFile";
  const plainText = `You have been invited to try EasyFile. Create your first business document free, then verify your email before your use can qualify the referral. Open: ${url}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;padding:32px">
        <p style="margin:0 0 18px;color:#2563eb;font-weight:800">EasyFile · Referral invitation</p>
        <h1 style="margin:0 0 12px;font-size:26px">Create your first business document free</h1>
        <p style="line-height:1.6;color:#475569">You have been invited to try EasyFile. Open the secure referral link, verify your email, and complete one qualifying Save, Preview, Print or Export action.</p>
        <p style="margin:28px 0"><a href="${htmlEscape(url)}" style="display:inline-block;border-radius:10px;padding:14px 22px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:800">Open EasyFile</a></p>
        <p style="color:#64748b;font-size:13px;line-height:1.5">Referral code: <strong>${htmlEscape(referralCode)}</strong>. Opening the link does not award referral credit; a verified qualifying use is required.</p>
      </div>
    </div></body></html>`;
  return sendEmail(recipientEmail, subject, plainText, html);
}

async function inviteHandler(body, request) {
  const email = normalizeEmail(body.email);
  const recipientEmail = normalizeEmail(body.recipientEmail);
  const referralCode = normalizeReferralCode(body.referralCode);
  if (!email || !recipientEmail || !referralCode) {
    return { status: 400, body: { error: "A verified sender, recipient email and referral code are required." } };
  }
  if (email === recipientEmail) return { status: 400, body: { error: "Self-referral invitations are not allowed." } };
  if (!hasVerifiedEmail(body, request)) {
    return { status: 401, body: { error: "Verify your email before EasyFile sends a referral invitation." } };
  }
  if (!emailDeliveryConfigured()) {
    return { status: 503, body: { error: "EasyFile referral email delivery is not configured yet." } };
  }

  const client = await table();
  const participant = await findParticipant(client, email);
  if (!participant || participant.referralCode !== referralCode) {
    return { status: 403, body: { error: "The referral code does not belong to the verified sender." } };
  }

  const partitionKey = `invite:${participant.rowKey}`;
  const recipientId = participantId(recipientEmail);
  const reservation = await reserveInvitation(client, partitionKey, recipientId);
  if (reservation.status === 429) {
    if (reservation.dailyLimit) return { status: 429, body: { error: `The daily invitation limit of ${INVITE_DAILY_LIMIT} has been reached.` } };
    return { status: 429, headers: { "Retry-After": String(reservation.retryAfterSeconds) }, body: { error: "An invitation was already sent to this address recently.", retryAfterSeconds: reservation.retryAfterSeconds } };
  }
  if (reservation.status !== 202) return { status: 409, body: { error: "Invitation state changed concurrently. Please retry." } };
  try {
    await sendInvitationMessage(recipientEmail, referralCode);
    const current = await getEntity(client, partitionKey, recipientId);
    if (current) await client.updateEntity({ partitionKey, rowKey: recipientId, status: "sent", deliveredAt: now() }, "Merge", { etag: entityTag(current) });
  } catch (error) {
    const current = await getEntity(client, partitionKey, recipientId);
    if (current) await client.updateEntity({ partitionKey, rowKey: recipientId, status: "delivery-failed", deliveryFailedAt: now() }, "Merge", { etag: entityTag(current) }).catch(() => {});
    throw error;
  }

  return {
    status: 202,
    body: {
      sent: true,
      recipientMasked: maskEmail(recipientEmail),
      sender: EMAIL_SENDER
    }
  };
}

async function qualifyReferrer(client, participant, moduleId, eventName) {
  if (!participant.referredBy) return { qualified: false, referrerUnlocked: false };

  const partitionKey = `referral:${participant.referredBy}`;
  const existing = await getEntity(client, partitionKey, participant.rowKey);
  let firstQualification = !existing?.qualified;

  if (firstQualification) {
    try {
      await client.createEntity({
        partitionKey,
        rowKey: participant.rowKey,
        qualified: true,
        qualifiedAt: now(),
        lastQualifiedAt: now(),
        moduleId,
        eventName
      });
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      firstQualification = false;
    }
  } else {
    await client.updateEntity({
      partitionKey,
      rowKey: participant.rowKey,
      lastQualifiedAt: now(),
      moduleId,
      eventName
    }, "Merge");
  }

  const owner = await getEntity(client, "participant", participant.referredBy);
  if (!owner) return { qualified: firstQualification, referrerUnlocked: false };
  const count = await refreshUnlock(client, owner);
  return {
    qualified: firstQualification,
    referrerUnlocked: owner.unlocked === true,
    referrerQualifiedCount: count
  };
}

function qualificationOutboxRowKey(markerRowKey) {
  return `qualification-${crypto.createHash("sha256").update(markerRowKey).digest("hex").slice(0, 40)}`;
}

async function completeQualificationJob(client, job, result) {
  try {
    await client.updateEntity({
      partitionKey: job.partitionKey, rowKey: job.rowKey, status: "completed", completedAt: now(),
      referrerUnlocked: result.referrerUnlocked === true,
      referrerQualifiedCount: Number(result.referrerQualifiedCount || 0),
      qualified: result.qualified === true
    }, "Merge", { etag: entityTag(job) });
  } catch (error) {
    if (error.statusCode !== 412) throw error;
  }
}

async function deferQualificationJob(client, job, error) {
  const attempts = Number(job.attempts || 0) + 1;
  const delaySeconds = Math.min(3600, OUTBOX_RETRY_SECONDS * (2 ** Math.min(6, attempts - 1)));
  try {
    await client.updateEntity({
      partitionKey: job.partitionKey, rowKey: job.rowKey,
      status: attempts >= OUTBOX_MAX_ATTEMPTS ? "manual-review" : "pending",
      attempts, nextAttemptAt: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      lastError: safeText(error?.message || "qualification-failed", 120), lastAttemptAt: now()
    }, "Merge", { etag: entityTag(job) });
  } catch (updateError) {
    if (updateError.statusCode !== 412) throw updateError;
  }
}

async function reconcileQualificationJob(client, job) {
  if (!job?.referrerId || job.status === "completed" || job.status === "manual-review") return { pending: false, qualified: job?.qualified === true };
  try {
    const participant = { rowKey: job.participantId, referredBy: job.referrerId };
    const result = await qualifyReferrer(client, participant, job.moduleId, job.eventName);
    await completeQualificationJob(client, job, result);
    return { pending: false, ...result };
  } catch (error) {
    await deferQualificationJob(client, job, error);
    return { pending: true, qualified: false, referrerUnlocked: false };
  }
}

async function reconcileQualificationOutbox() {
  const client = await table();
  const jobs = client.listEntities({ queryOptions: { filter: "PartitionKey eq 'participant' and entityType eq 'qualification-outbox'" } });
  let processed = 0;
  for await (const job of jobs) {
    if (processed >= 100) break;
    if (job.status === "completed" || job.status === "manual-review") continue;
    if (Date.parse(job.nextAttemptAt || "") > Date.now()) continue;
    await reconcileQualificationJob(client, job);
    processed += 1;
  }
  return processed;
}

function useMarkerRowKey(participant, idempotencyKey) {
  const digest = crypto.createHash("sha256").update(idempotencyKey).digest("hex");
  return `use-${participant.rowKey.slice(0, 24)}-${digest.slice(0, 32)}`;
}

async function consumeTrial(client, participant, body, moduleId, eventName) {
  const suppliedKey = safeText(body.idempotencyKey, 128);
  if (REQUIRE_IDEMPOTENCY && !IDEMPOTENCY_KEY.test(suppliedKey)) {
    return { status: 400, error: "A valid idempotencyKey is required." };
  }
  const idempotencyKey = suppliedKey || `legacy-${crypto.randomUUID()}`;
  const markerRowKey = useMarkerRowKey(participant, idempotencyKey);
  const existing = await getEntity(client, "participant", markerRowKey);
  if (existing) return { duplicate: true, consumed: false, markerRowKey, outboxRowKey: qualificationOutboxRowKey(markerRowKey) };

  const usedAt = now();
  const transaction = new TableTransaction();
  transaction.updateEntity({
    partitionKey: "participant",
    rowKey: participant.rowKey,
    trialUsed: true,
    firstUseAt: participant.firstUseAt || usedAt,
    firstUseModule: participant.firstUseModule || moduleId,
    firstUseEvent: participant.firstUseEvent || eventName,
    lastUseAt: usedAt,
    lastUseModule: moduleId,
    lastUseEvent: eventName
  }, "Merge", { etag: entityTag(participant) });
  transaction.createEntity({
    partitionKey: "participant",
    rowKey: markerRowKey,
    entityType: "qualifying-use",
    participantId: participant.rowKey,
    idempotencyHash: crypto.createHash("sha256").update(idempotencyKey).digest("hex"),
    moduleId,
    eventName,
    occurredAt: safeText(body.occurredAt, 40) || usedAt,
    createdAt: usedAt
  });
  const outboxRowKey = qualificationOutboxRowKey(markerRowKey);
  if (participant.referredBy) {
    transaction.createEntity({
      partitionKey: "participant", rowKey: outboxRowKey, entityType: "qualification-outbox",
      status: "pending", attempts: 0, nextAttemptAt: usedAt, createdAt: usedAt,
      participantId: participant.rowKey, referrerId: participant.referredBy,
      moduleId, eventName, useMarkerRowKey: markerRowKey
    });
  }

  try {
    await client.submitTransaction(transaction.actions);
    participant.trialUsed = true;
    participant.firstUseAt = participant.firstUseAt || usedAt;
    participant.firstUseModule = participant.firstUseModule || moduleId;
    participant.firstUseEvent = participant.firstUseEvent || eventName;
    return { duplicate: false, consumed: true, markerRowKey, outboxRowKey: participant.referredBy ? outboxRowKey : "" };
  } catch (error) {
    if (![409, 412].includes(error.statusCode)) throw error;
    const [fresh, marker] = await Promise.all([
      client.getEntity("participant", participant.rowKey),
      getEntity(client, "participant", markerRowKey)
    ]);
    Object.assign(participant, fresh);
    if (marker) return { duplicate: true, consumed: false, markerRowKey, outboxRowKey: qualificationOutboxRowKey(markerRowKey) };
    return { duplicate: false, consumed: false, concurrent: true };
  }
}

async function useHandler(body, request) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };
  if (!verifiedEmail(body, request)) {
    return { status: 401, body: { error: "Email ownership must be verified before referral access can be used." } };
  }

  const moduleId = safeText(body.moduleId, 64).toLowerCase();
  const eventName = safeText(body.event, 160).toLowerCase();
  if (!MODULE_ID.test(moduleId)) return { status: 400, body: { error: "A valid moduleId is required." } };
  if (!QUALIFYING_ACTION.test(eventName)) {
    return { status: 400, body: { error: "The event is not a qualifying EasyFile use." } };
  }

  const client = await table();
  const participant = await ensureParticipant(client, email);
  let qualified = await refreshUnlock(client, participant);

  if (participant.unlocked === true) {
    return { status: 200, body: summary(participant, qualified, { alreadyUnlocked: true }) };
  }

  if (participant.trialUsed === true) {
    const suppliedKey = safeText(body.idempotencyKey, 128);
    if (suppliedKey) {
      const marker = await getEntity(client, "participant", useMarkerRowKey(participant, suppliedKey));
      if (marker) {
        const job = await getEntity(client, "participant", qualificationOutboxRowKey(useMarkerRowKey(participant, suppliedKey)));
        await reconcileQualificationJob(client, job);
        qualified = await refreshUnlock(client, participant);
        return { status: 200, body: summary(participant, qualified, { duplicate: true, trialConsumed: false }) };
      }
    }
    return {
      status: 403,
      body: summary(participant, qualified, { error: "Referral access is required before another EasyFile use." })
    };
  }

  const consumption = await consumeTrial(client, participant, body, moduleId, eventName);
  if (consumption.status) return { status: consumption.status, body: { error: consumption.error } };
  if (consumption.concurrent && participant.trialUsed === true) {
    qualified = await refreshUnlock(client, participant);
    return {
      status: 409,
      body: summary(participant, qualified, { error: "Another qualifying-use request was processed concurrently. Refresh access status." })
    };
  }
  if (consumption.duplicate) {
    const job = consumption.outboxRowKey && await getEntity(client, "participant", consumption.outboxRowKey);
    await reconcileQualificationJob(client, job);
    qualified = await refreshUnlock(client, participant);
    return { status: 200, body: summary(participant, qualified, { duplicate: true, trialConsumed: false }) };
  }

  const job = consumption.outboxRowKey && await getEntity(client, "participant", consumption.outboxRowKey);
  const referralResult = await reconcileQualificationJob(client, job);
  qualified = await refreshUnlock(client, participant);
  return {
    status: 200,
    body: summary(participant, qualified, {
      trialConsumed: true,
      referralQualified: referralResult.qualified,
      referralQualificationPending: referralResult.pending === true,
      referrerUnlocked: referralResult.referrerUnlocked,
      referrerQualifiedCount: referralResult.referrerQualifiedCount || 0
    })
  };
}

function configuredOrigins() {
  const raw = String(process.env.EASYFILE_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","));
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
}

function allowedOrigin(request) {
  const configured = configuredOrigins();
  const origin = request.headers.get("origin") || "";
  if (!origin) return "";
  if (configured.includes("*") && envBoolean("EASYFILE_ALLOW_WILDCARD_CORS", false)) return "*";
  return configured.includes(origin) ? origin : "";
}

function baseHeaders(request) {
  const origin = allowedOrigin(request);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function response(request, status, body, extraHeaders = {}) {
  return { status, headers: { ...baseHeaders(request), ...extraHeaders }, body: JSON.stringify(body) };
}

async function readJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    const error = new Error("Request payload is too large.");
    error.statusCode = 413;
    throw error;
  }
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    const error = new Error("Request payload is too large.");
    error.statusCode = 413;
    throw error;
  }
  try { return JSON.parse(text || "{}"); }
  catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function referralApi(request, context) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigin(request);
  if (origin && !allowed) return response(request, 403, { error: "Origin is not allowed." });

  if (request.method === "OPTIONS") {
    if (!origin || !allowed) return response(request, 403, { error: "Origin is not allowed." });
    return {
      status: 204,
      headers: {
        ...baseHeaders(request),
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-EasyFile-Client",
        "Access-Control-Max-Age": "600"
      }
    };
  }

  const action = safeText(request.params.action || "health", 32).toLowerCase();
  if (request.method === "GET" && action === "health") {
    const status = readiness();
    try {
      await table();
      const code = status.ready ? 200 : 503;
      return response(request, code, {
        status: status.ready ? "ok" : "degraded",
        service: "easyfile-referrals",
        referralsRequired: REQUIRED_REFERRALS,
        requireIdempotency: REQUIRE_IDEMPOTENCY,
        requireVerifiedEmail: REQUIRE_VERIFIED_EMAIL,
        issues: status.issues
      });
    } catch (error) {
      context.error(error);
      return response(request, 503, { status: "error", error: "Referral storage is unavailable.", issues: status.issues });
    }
  }

  if (request.method !== "POST") return response(request, 405, { error: "Method not allowed." }, { Allow: "GET,POST,OPTIONS" });
  if (!origin) return response(request, 403, { error: "A browser origin is required." });
  if (!edgeGatewayAuthorized(request)) return response(request, 403, { error: "Referral traffic must use the configured API gateway." });

  try {
    const body = await readJson(request);
    const result = action === "session"
      ? await sessionHandler(body, request)
      : action === "use"
        ? await useHandler(body, request)
        : action === "verification-request"
          ? await verificationRequestHandler(body)
          : action === "verification-confirm"
            ? await verificationConfirmHandler(body)
            : action === "invite"
              ? await inviteHandler(body, request)
              : { status: 404, body: { error: "Referral endpoint not found." } };
    return response(request, result.status, result.body, result.headers || {});
  } catch (error) {
    if ([400, 401, 413, 429, 503].includes(error.statusCode)) {
      return response(request, error.statusCode, { error: error.message });
    }
    context.error(error);
    return response(request, 500, { error: "The referral service could not process the request." });
  }
}

app.http("easyfileReferrals", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "referrals/{action?}",
  handler: referralApi
});

app.timer("easyfileReferralReconciler", {
  schedule: "0 */5 * * * *",
  handler: async (_timer, context) => {
    try {
      const processed = await reconcileQualificationOutbox();
      context.log(`EasyFile referral reconciliation processed ${processed} job(s).`);
    } catch (error) {
      context.error("EasyFile referral reconciliation failed.", error);
      throw error;
    }
  }
});

module.exports.__test = Object.freeze({
  normalizeEmail,
  normalizeReferralCode,
  accessState,
  safeText,
  participantId,
  legacyParticipantId,
  verificationToken,
  otpDigest,
  maskEmail,
  emailDeliveryConfigured,
  useMarkerRowKey,
  configuredOrigins,
  readiness,
  hasVerifiedEmail,
  wouldCreateReferralLoop,
  verificationRequestHandler,
  verificationConfirmHandler,
  inviteHandler,
  sessionHandler,
  useHandler,
  referralApi,
  reconcileQualificationJob,
  qualificationOutboxRowKey,
  reserveInvitation,
  setTableClient(client) { tablePromise = Promise.resolve(client); },
  resetTableClient() { tablePromise = undefined; }
});
