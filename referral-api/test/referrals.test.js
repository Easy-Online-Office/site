"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

process.env.EASYFILE_EMAIL_HMAC_SECRET = "test-secret-that-is-at-least-thirty-two-characters";
process.env.EASYFILE_ALLOWED_ORIGINS = "https://www.easyfile.co.za,https://easyfile.co.za";
process.env.EASYFILE_REQUIRE_IDEMPOTENCY = "true";
process.env.EASYFILE_REQUIRE_EMAIL_VERIFICATION = "true";
process.env.EASYFILE_EMAIL_CONNECTION_STRING = "endpoint=https://example.communication.azure.com/;accesskey=test";
process.env.EASYFILE_EMAIL_SENDER = "referrals@easyfile.co.za";

const originalLoad = Module._load;
Module._load = function mockedLoad(request, parent, isMain) {
  if (request === "@azure/functions") return { app: { http() {} } };
  if (request === "@azure/communication-email") {
    return { EmailClient: class EmailClient {} };
  }
  if (request === "@azure/data-tables") {
    return {
      TableClient: class TableClient {},
      TableTransaction: class TableTransaction {
        constructor() { this.actions = []; }
        updateEntity(entity, mode, options) { this.actions.push(["update", entity, mode, options]); }
        createEntity(entity) { this.actions.push(["create", entity]); }
      }
    };
  }
  return originalLoad(request, parent, isMain);
};

const { __test: helpers } = require("../src/functions/referrals.js");
Module._load = originalLoad;

test("normalises valid email addresses", () => {
  assert.equal(helpers.normalizeEmail("  USER@Example.COM "), "user@example.com");
  assert.equal(helpers.normalizeEmail("invalid"), "");
});

test("uses keyed HMAC identifiers and preserves legacy lookup helper", () => {
  const email = "user@example.com";
  assert.match(helpers.participantId(email), /^[a-f0-9]{64}$/);
  assert.match(helpers.legacyParticipantId(email), /^[a-f0-9]{64}$/);
  assert.notEqual(helpers.participantId(email), helpers.legacyParticipantId(email));
});

test("accepts only the EasyFile referral alphabet and length", () => {
  assert.equal(helpers.normalizeReferralCode(" 2345ABCD "), "2345ABCD");
  assert.equal(helpers.normalizeReferralCode("O0ILABCD"), "");
  assert.equal(helpers.normalizeReferralCode("SHORT"), "");
});

test("derives stable non-plaintext idempotency marker keys", () => {
  const participant = { rowKey: "a".repeat(64) };
  const first = helpers.useMarkerRowKey(participant, "request-12345678");
  const second = helpers.useMarkerRowKey(participant, "request-12345678");
  assert.equal(first, second);
  assert.match(first, /^use-[a-f0-9-]+$/);
  assert.equal(first.includes("request-12345678"), false);
});

test("produces deterministic verification tokens", () => {
  const token = helpers.verificationToken("user@example.com", 2000000000000);
  assert.ok(token.length >= 40);
  assert.equal(token, helpers.verificationToken("user@example.com", 2000000000000));
  assert.notEqual(token, helpers.verificationToken("other@example.com", 2000000000000));
});

test("hashes OTP values without retaining the plaintext code", () => {
  const digest = helpers.otpDigest("user@example.com", "123456", "salt-value");
  assert.match(digest, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(digest.includes("123456"), false);
  assert.equal(digest, helpers.otpDigest("user@example.com", "123456", "salt-value"));
  assert.notEqual(digest, helpers.otpDigest("user@example.com", "654321", "salt-value"));
});

test("masks email addresses for API responses", () => {
  assert.equal(helpers.maskEmail("raydo@easyfile.co.za"), "ra***@easyfile.co.za");
  assert.equal(helpers.maskEmail("a@example.com"), "a**@example.com");
});

test("reports only missing storage when other critical controls are enabled", () => {
  assert.deepEqual(helpers.configuredOrigins(), ["https://www.easyfile.co.za", "https://easyfile.co.za"]);
  assert.equal(helpers.emailDeliveryConfigured(), true);
  assert.deepEqual(helpers.readiness(), { ready: false, issues: ["storage-not-configured"] });
});
