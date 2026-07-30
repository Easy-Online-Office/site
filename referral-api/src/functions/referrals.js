"use strict";

const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { TableClient, TableTransaction } = require("@azure/data-tables");

const REQUIRED_REFERRALS = boundedInt(process.env.EASYFILE_REFERRALS_REQUIRED, 3, 1, 100);
const TABLE_NAME = safeTableName(process.env.EASYFILE_REFERRALS_TABLE || "EasyFileReferrals");
const EMAIL_HMAC_SECRET = String(process.env.EASYFILE_EMAIL_HMAC_SECRET || "").trim();
const REQUIRE_IDEMPOTENCY = envBoolean("EASYFILE_REQUIRE_IDEMPOTENCY", true);
const REQUIRE_VERIFIED_EMAIL = envBoolean("EASYFILE_REQUIRE_EMAIL_VERIFICATION", false);
const MAX_BODY_BYTES = boundedInt(process.env.EASYFILE_MAX_BODY_BYTES, 8192, 1024, 65536);
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

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return "";
  return email;
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

function verifiedEmail(body, request) {
  if (!REQUIRE_VERIFIED_EMAIL) return true;

  const principal = request.headers.get("x-ms-client-principal");
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

async function attachReferral(client, participant, referralCode) {
  const normalizedCode = normalizeReferralCode(referralCode);
  if (!normalizedCode) return { accepted: false, reason: referralCode ? "invalid" : "missing" };
  if (participant.referredBy || participant.trialUsed === true) {
    return { accepted: false, reason: "already-bound" };
  }

  const index = await getEntity(client, "code", normalizedCode);
  if (!index?.ownerId) return { accepted: false, reason: "invalid" };
  if (index.ownerId === participant.rowKey) return { accepted: false, reason: "self-referral" };

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
  if (existing) return { duplicate: true, consumed: false };

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

  try {
    await client.submitTransaction(transaction.actions);
    participant.trialUsed = true;
    participant.firstUseAt = participant.firstUseAt || usedAt;
    participant.firstUseModule = participant.firstUseModule || moduleId;
    participant.firstUseEvent = participant.firstUseEvent || eventName;
    return { duplicate: false, consumed: true };
  } catch (error) {
    if (![409, 412].includes(error.statusCode)) throw error;
    const [fresh, marker] = await Promise.all([
      client.getEntity("participant", participant.rowKey),
      getEntity(client, "participant", markerRowKey)
    ]);
    Object.assign(participant, fresh);
    if (marker) return { duplicate: true, consumed: false };
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
    qualified = await refreshUnlock(client, participant);
    return { status: 200, body: summary(participant, qualified, { duplicate: true, trialConsumed: false }) };
  }

  const referralResult = await qualifyReferrer(client, participant, moduleId, eventName);
  qualified = await refreshUnlock(client, participant);
  return {
    status: 200,
    body: summary(participant, qualified, {
      trialConsumed: true,
      referralQualified: referralResult.qualified,
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

  try {
    const body = await readJson(request);
    const result = action === "session"
      ? await sessionHandler(body, request)
      : action === "use"
        ? await useHandler(body, request)
        : { status: 404, body: { error: "Referral endpoint not found." } };
    return response(request, result.status, result.body);
  } catch (error) {
    if ([400, 413].includes(error.statusCode)) return response(request, error.statusCode, { error: error.message });
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

module.exports.__test = Object.freeze({
  normalizeEmail,
  normalizeReferralCode,
  accessState,
  safeText,
  participantId,
  legacyParticipantId,
  verificationToken,
  useMarkerRowKey,
  configuredOrigins,
  readiness
});
