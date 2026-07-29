"use strict";

const crypto = require("node:crypto");
const { app } = require("@azure/functions");
const { TableClient } = require("@azure/data-tables");

const REQUIRED_REFERRALS = Math.max(1, Number.parseInt(process.env.EASYFILE_REFERRALS_REQUIRED || "3", 10));
const TABLE_NAME = process.env.EASYFILE_REFERRALS_TABLE || "EasyFileReferrals";
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const QUALIFYING_ACTION = /save|preview|print|pdf|word|excel|csv|export|download|generate/i;

let tablePromise;

function connectionString() {
  return process.env.EASYFILE_REFERRALS_STORAGE || process.env.AzureWebJobsStorage || "";
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

function participantId(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
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
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);
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
  for (let attempt = 0; attempt < 10; attempt += 1) {
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

async function ensureParticipant(client, email) {
  const id = participantId(email);
  let participant = await getEntity(client, "participant", id);

  if (!participant) {
    const referralCode = await createReferralCode(client, id);
    participant = {
      partitionKey: "participant",
      rowKey: id,
      referralCode,
      trialUsed: false,
      unlocked: false,
      createdAt: now(),
      lastSeenAt: now()
    };
    try {
      await client.createEntity(participant);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      participant = await client.getEntity("participant", id);
    }
  } else {
    participant.lastSeenAt = now();
    await client.upsertEntity(participant, "Merge");
  }

  return participant;
}

async function qualifiedReferralCount(client, ownerId) {
  let count = 0;
  const partitionKey = `referral:${ownerId}`;
  const entities = client.listEntities({
    queryOptions: { filter: `PartitionKey eq '${partitionKey}'` }
  });

  for await (const entity of entities) {
    if (entity.qualified === true) count += 1;
  }
  return count;
}

async function refreshUnlock(client, participant) {
  const qualified = await qualifiedReferralCount(client, participant.rowKey);
  if (qualified >= REQUIRED_REFERRALS && participant.unlocked !== true) {
    participant.unlocked = true;
    participant.unlockedAt = now();
    await client.upsertEntity(participant, "Merge");
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
    updatedAt: now(),
    ...extra
  };
}

async function attachReferral(client, participant, referralCode) {
  const normalizedCode = safeText(referralCode, 16).toUpperCase();
  if (!normalizedCode) return { accepted: false, reason: "missing" };
  if (participant.referredBy || participant.trialUsed === true) {
    return { accepted: false, reason: "already-bound" };
  }

  const index = await getEntity(client, "code", normalizedCode);
  if (!index?.ownerId) return { accepted: false, reason: "invalid" };
  if (index.ownerId === participant.rowKey) return { accepted: false, reason: "self-referral" };

  participant.referredBy = index.ownerId;
  participant.referredByCode = normalizedCode;
  participant.referredAt = now();
  await client.upsertEntity(participant, "Merge");
  return { accepted: true, reason: "accepted" };
}

async function sessionHandler(body) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };

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
  const firstQualification = !existing?.qualified;

  await client.upsertEntity({
    partitionKey,
    rowKey: participant.rowKey,
    qualified: true,
    qualifiedAt: existing?.qualifiedAt || now(),
    lastQualifiedAt: now(),
    moduleId,
    eventName
  }, "Merge");

  const owner = await getEntity(client, "participant", participant.referredBy);
  if (!owner) return { qualified: firstQualification, referrerUnlocked: false };

  const count = await refreshUnlock(client, owner);
  return {
    qualified: firstQualification,
    referrerUnlocked: owner.unlocked === true,
    referrerQualifiedCount: count
  };
}

async function useHandler(body) {
  const email = normalizeEmail(body.email);
  if (!email) return { status: 400, body: { error: "A valid email address is required." } };

  const moduleId = safeText(body.moduleId, 64).toLowerCase();
  const eventName = safeText(body.event, 160).toLowerCase();
  if (!moduleId) return { status: 400, body: { error: "moduleId is required." } };
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
    return {
      status: 403,
      body: summary(participant, qualified, { error: "Referral access is required before another EasyFile use." })
    };
  }

  participant.trialUsed = true;
  participant.firstUseAt = now();
  participant.firstUseModule = moduleId;
  participant.firstUseEvent = eventName;
  await client.upsertEntity(participant, "Merge");

  const referralResult = await qualifyReferrer(client, participant, moduleId, eventName);
  qualified = await refreshUnlock(client, participant);

  return {
    status: 200,
    body: summary(participant, qualified, {
      referralQualified: referralResult.qualified,
      referrerUnlocked: referralResult.referrerUnlocked,
      referrerQualifiedCount: referralResult.referrerQualifiedCount || 0
    })
  };
}

function allowedOrigin(request) {
  const configured = String(process.env.EASYFILE_ALLOWED_ORIGINS || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin") || "";
  if (configured.includes("*")) return "*";
  if (configured.includes(origin)) return origin;
  return "";
}

function response(request, status, body) {
  const origin = allowedOrigin(request);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return { status, headers, body: JSON.stringify(body) };
}

async function referralApi(request, context) {
  const origin = allowedOrigin(request);
  if (!origin && request.headers.get("origin")) {
    return response(request, 403, { error: "Origin is not allowed." });
  }

  if (request.method === "OPTIONS") {
    return {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin"
      }
    };
  }

  const action = safeText(request.params.action || "health", 32).toLowerCase();
  if (request.method === "GET" && action === "health") {
    try {
      await table();
      return response(request, 200, { status: "ok", service: "easyfile-referrals", referralsRequired: REQUIRED_REFERRALS });
    } catch (error) {
      context.error(error);
      return response(request, 503, { status: "error", error: "Referral storage is unavailable." });
    }
  }

  if (request.method !== "POST") return response(request, 405, { error: "Method not allowed." });

  try {
    const body = await request.json();
    const result = action === "session"
      ? await sessionHandler(body)
      : action === "use"
        ? await useHandler(body)
        : { status: 404, body: { error: "Referral endpoint not found." } };
    return response(request, result.status, result.body);
  } catch (error) {
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
