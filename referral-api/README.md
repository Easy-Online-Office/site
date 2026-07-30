# EasyFile Referral Access API

This Azure Functions API provides the server-authoritative entitlement state for the EasyFile referral scheme.

## Access rule

1. A user establishes a referral identity with an email address.
2. The user receives one free qualifying use across the entire EasyFile module suite.
3. After that use, all EasyFile modules are locked for that identity.
4. The user shares a unique referral link.
5. Three different referred identities must enter through that link and complete one qualifying module action.
6. The original user's access is unlocked for continued use across all modules.

Qualifying actions include Save Draft, Preview, Print and supported export actions. Opening a page without completing an action does not qualify.

## Security model

The v2 API adds the following controls:

- keyed HMAC-SHA-256 participant identifiers through `EASYFILE_EMAIL_HMAC_SECRET`;
- legacy SHA-256 participant lookup so existing referral accounts remain usable during migration;
- atomic trial consumption and idempotency-marker creation in one Azure Table transaction;
- optimistic ETag concurrency checks to prevent concurrent requests consuming the same free use twice;
- one referral-qualification entity per referred participant;
- self-referral prevention and one-referrer binding;
- strict referral-code, module, action and payload validation;
- request-size limits, no-store response headers and restrictive CORS defaults;
- readiness diagnostics through the health endpoint;
- optional verified-email enforcement through Azure App Service Authentication claims or a signed verification token.

Plain email addresses are not written to Azure Table Storage. New participant IDs are produced with HMAC-SHA-256. A secret of at least 32 random characters is required for production readiness.

### Identity-verification boundary

Email ownership verification is disabled by default for backward compatibility. This means the scheme remains vulnerable to users entering email addresses they do not control until production email delivery is configured and enforcement is enabled.

The API includes an Azure Communication Services Email OTP flow:

1. `POST /verification-request` sends a six-digit code from `referrals@easyfile.co.za`.
2. Only a salted HMAC of the code is stored; the code expires after 10 minutes.
3. `POST /verification-confirm` enforces a limited number of attempts and returns a signed, short-lived verification token.
4. The browser supplies that token to `/session`, `/use` and `/invite`.
5. `/invite` requires a verified sender, rate-limits email invitations and never stores the recipient email in plaintext.

Microsoft Entra External ID or App Service Authentication remains supported through an authenticated `x-ms-client-principal`.

Before setting `EASYFILE_REQUIRE_EMAIL_VERIFICATION=true`:

- create an Azure Email Communication Services resource;
- verify `easyfile.co.za` ownership and configure SPF and DKIM;
- connect the verified domain to an Azure Communication Services resource;
- add `referrals@easyfile.co.za` as a MailFrom address;
- store the Communication Services connection string only as a Function App secret setting;
- send a verification email successfully from production.

The health endpoint reports `email-verification-disabled` until enforcement is enabled. When enforcement is enabled, missing email settings are also reported as readiness failures.

## Azure resources

Create or select:

- an Azure Function App using the Node.js v4 programming model;
- an Azure Storage account available to the Function App;
- an Application Insights resource for operational monitoring;
- Azure Front Door, API Management or an equivalent edge control for distributed rate limiting and abuse protection.

The function creates the configured Azure Table automatically when the configured identity or connection string has permission.

## Function App settings

| Setting | Required | Production guidance |
| --- | --- | --- |
| `EASYFILE_REFERRALS_STORAGE` | Yes | Azure Storage connection string or use `AzureWebJobsStorage` |
| `EASYFILE_REFERRALS_TABLE` | No | `EasyFileReferrals` |
| `EASYFILE_REFERRALS_REQUIRED` | No | `3` |
| `EASYFILE_EMAIL_HMAC_SECRET` | Yes | At least 32 cryptographically random characters |
| `EASYFILE_EMAIL_CONNECTION_STRING` | Yes for OTP/invitations | Store as a Function App secret; never commit the real value |
| `EASYFILE_EMAIL_SENDER` | Yes for OTP/invitations | `referrals@easyfile.co.za` after the custom domain and MailFrom address are verified |
| `EASYFILE_REQUIRE_IDEMPOTENCY` | Yes | `true` |
| `EASYFILE_REQUIRE_EMAIL_VERIFICATION` | Yes for fraud resistance | `true` after the identity flow is configured |
| `EASYFILE_VERIFICATION_CODE_TTL_SECONDS` | No | `600` |
| `EASYFILE_VERIFICATION_TOKEN_TTL_SECONDS` | No | `86400` maximum |
| `EASYFILE_VERIFICATION_RESEND_SECONDS` | No | `60` |
| `EASYFILE_VERIFICATION_MAX_ATTEMPTS` | No | `5` |
| `EASYFILE_INVITE_COOLDOWN_SECONDS` | No | `86400` per sender/recipient pair |
| `EASYFILE_INVITE_DAILY_LIMIT` | No | `25` per verified sender |
| `EASYFILE_MAX_BODY_BYTES` | No | `8192` |
| `EASYFILE_ALLOWED_ORIGINS` | Yes | Exact HTTPS origins; do not use `*` |
| `FUNCTIONS_WORKER_RUNTIME` | Yes | `node` |

`AzureWebJobsStorage` is used when `EASYFILE_REFERRALS_STORAGE` is not set.

## GitHub deployment

Configure the repository:

1. Add repository variable `AZURE_FUNCTIONAPP_NAME` containing the Function App name.
2. Add repository secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` containing the Function App publish profile XML.
3. Add repository variable `EASYFILE_REFERRAL_HEALTH_URL` with the deployed `/api/referrals/health` URL for post-deployment verification.
4. Configure all Function App settings listed above.
5. Run **Deploy EasyFile Referral API**, or merge changes under `referral-api/` into `main`.
6. Bind `api-easyfile.skunkworks.africa` to the Function App or change the frontend API configuration.

The deployment workflow does not create the Function App or inject application settings. Those infrastructure settings must exist before deployment.

## Local development

```bash
cd referral-api
cp local.settings.example.json local.settings.json
npm install
npm run check
npm start
```

Use Azurite when `UseDevelopmentStorage=true` is configured.

## Endpoints

### `POST /api/referrals/session`

Creates or retrieves a participant, attaches an optional referral code and returns current access status.

```json
{
  "email": "user@example.com",
  "referralCode": "ABC234DE",
  "requestId": "f5e19e74-746a-4372-a64d-cf2b2407cc3f",
  "clientVersion": "2.0.0"
}
```

### `POST /api/referrals/use`

Consumes the once-off use exactly once and qualifies the referring user when applicable.

```json
{
  "email": "user@example.com",
  "moduleId": "invoice",
  "event": "export pdf",
  "idempotencyKey": "71b2c0ec-575a-4c71-bfce-d3800783ec2a",
  "occurredAt": "2026-07-30T03:00:00.000Z",
  "clientVersion": "2.0.0"
}
```

Repeating the same `idempotencyKey` returns the existing consumption result and does not qualify the referral twice.

### `POST /api/referrals/verification-request`

Sends a time-limited six-digit OTP to the supplied email through Azure Communication Services Email. Requests are throttled per HMAC-derived email identity.

```json
{
  "email": "user@example.com",
  "requestId": "f5e19e74-746a-4372-a64d-cf2b2407cc3f",
  "clientVersion": "2.1.0"
}
```

### `POST /api/referrals/verification-confirm`

Confirms the OTP and returns `emailVerificationToken` plus `emailVerificationExpiresAt`. The browser must send both fields with protected referral requests.

```json
{
  "email": "user@example.com",
  "code": "123456",
  "clientVersion": "2.1.0"
}
```

### `POST /api/referrals/invite`

Sends a referral invitation from `referrals@easyfile.co.za`. The sender must provide a valid verification token, and the referral code must belong to that sender.

```json
{
  "email": "verified-sender@example.com",
  "recipientEmail": "person@example.com",
  "referralCode": "2345ABCD",
  "emailVerificationToken": "signed-token",
  "emailVerificationExpiresAt": 2000000000000,
  "clientVersion": "2.1.0"
}
```

### `GET /api/referrals/health`

Checks storage connectivity and reports security/readiness issues. Production monitoring should require HTTP 200 and an empty `issues` array.

## Access states

- `trial`: one qualifying module use remains.
- `locked`: the trial is consumed and fewer than three referrals have qualified.
- `unlocked`: at least three referrals have qualified; continued module use is permitted.

## Required production acceptance tests

- New verified account returns `trial`.
- The first qualifying use changes the account to `locked` exactly once.
- Concurrent use requests cannot double-consume the trial.
- Repeating an idempotency key does not create a second qualification.
- Self-referrals and invalid codes are rejected.
- A referred account can qualify only one referrer.
- The referrer unlocks after exactly three distinct qualifications.
- Verification codes expire, are attempt-limited and cannot be recovered from storage.
- Unverified users cannot create a session or qualifying use when enforcement is enabled.
- Email invitations require a verified sender and enforce recipient cooldown and daily limits.
- Unapproved browser origins are rejected.
- The health endpoint returns 200 only when required security settings are present.
