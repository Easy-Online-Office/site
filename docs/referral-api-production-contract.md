# EasyFile referral production-readiness contract

## Current access model

1. A verified user receives one qualifying use across all `easy-*.html` modules.
2. A qualifying action is recorded once with a unique idempotency key.
3. After the trial use, access becomes `locked`.
4. Three distinct, verified referred users must each complete one qualifying use.
5. The referrer then receives `unlocked` access.

The browser is a user-experience gate only. The referral API is the authoritative entitlement boundary. Any future server-side document storage, paid export, account data or protected operation must enforce the entitlement again on the server.

## Required API endpoints

### `POST /api/referrals/session`

Request fields:

- `email`: normalised verified email address.
- `referralCode`: optional incoming code.
- `page`: current page filename.
- `moduleId`: current module identifier or `null`.
- `refresh`: boolean.
- `requestId`: unique request identifier.
- `clientVersion`: frontend contract version.

Response fields:

- `access`: `trial`, `locked` or `unlocked`.
- `referralCode`: stable code matching `^[A-Z0-9][A-Z0-9_-]{5,31}$`.
- `referralsQualified`: integer.
- `referralsRequired`: integer, currently `3`.
- `entitlementToken`: optional signed token for explicitly enabled offline access.
- `entitlementExpiresAt`: optional ISO timestamp paired with the signed token.

### `POST /api/referrals/use`

Request fields:

- `email`.
- `moduleId`.
- `event`.
- `idempotencyKey`.
- `occurredAt`.
- `page`.
- `clientVersion`.

The endpoint must process `idempotencyKey` exactly once and return the updated session shape.

## Server-side controls required before enabling production access

- Verify email ownership with a one-time link or OTP before allowing a referral to qualify.
- Hash normalised email addresses with HMAC-SHA-256 and a server-held secret; do not use unsalted plain SHA-256.
- Reject self-referrals and referral loops.
- Count one qualification per referred account, regardless of repeated module actions.
- Use a database transaction when consuming the free use and incrementing the referrer.
- Enforce a unique constraint on each referred account and each use `idempotency_key`.
- Rate-limit by account, IP prefix and device-risk signal without treating IP address alone as identity.
- Apply strict CORS allowlisting for `https://www.easyfile.co.za` and approved preview origins.
- Return `Cache-Control: no-store` on all referral responses.
- Emit structured audit events without logging plain email addresses or referral tokens.
- Sign any offline entitlement token and keep offline access disabled until token verification is implemented.
- Provide `/health` and dependency-readiness checks for deployment monitoring.
- Define retention, deletion and privacy procedures compliant with POPIA.

## Recommended data model

- `accounts`: `id`, `email_hmac`, `email_verified_at`, `referral_code`, `access_state`, `trial_used_at`, timestamps.
- `referral_attributions`: `referrer_account_id`, `referred_account_id`, `captured_at`, `qualified_at`, status, fraud reason.
- `qualifying_uses`: `account_id`, `module_id`, `event`, `idempotency_key`, `occurred_at`, server timestamp.
- `entitlement_audit`: immutable state transitions with actor and reason.

## Deployment acceptance tests

- New verified account receives `trial`.
- First successful qualifying use changes that account to `locked` exactly once.
- Repeating the same idempotency key does not create another use.
- A referred account can qualify only one referrer.
- Self-referral and repeated-referral attempts are rejected.
- The referrer unlocks after exactly three distinct verified qualifications.
- API outage fails closed unless a valid signed and unexpired entitlement token is present.
- Invalid referral codes, malformed email addresses and oversized payloads return deterministic 4xx responses.
- CORS rejects unapproved origins.
- Concurrent use requests cannot double-consume the trial or double-increment referral totals.
