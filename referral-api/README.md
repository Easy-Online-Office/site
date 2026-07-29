# EasyFile Referral Access API

This Azure Functions API provides the authoritative entitlement state for the EasyFile referral scheme.

## Access rule

1. A user identifies themselves with an email address.
2. The user receives one free qualifying use across the entire EasyFile module suite.
3. After that use, all EasyFile modules are locked for that user.
4. The user shares a unique referral link.
5. Three different referred users must enter through that link and complete a qualifying module action.
6. The original user's access is then unlocked for continued use across all modules.

Qualifying actions include Save Draft, Preview, Print and supported export actions. Opening a page without completing an action does not qualify.

## Privacy and identity

The API normalises the email address and stores only its SHA-256 hash as the participant identifier. The plain email address is not written to Azure Table Storage.

This implementation prevents:

- self-referrals using the same email address;
- repeat qualification by the same referred email address;
- one referral being credited to multiple referrers;
- access being unlocked before three qualifying referral records exist.

Email ownership is not verified in this first implementation. Add passwordless sign-in or Microsoft Entra External ID before treating the scheme as fraud-resistant.

## Azure resources

Create or select:

- an Azure Function App using the Node.js v4 programming model;
- an Azure Storage account available to the Function App;
- an Application Insights resource for operational monitoring.

The function creates the `EasyFileReferrals` table automatically when the configured identity or connection string has permission.

## Function App settings

Set these application settings:

| Setting | Required | Example |
| --- | --- | --- |
| `EASYFILE_REFERRALS_STORAGE` | Yes | Azure Storage connection string |
| `EASYFILE_REFERRALS_TABLE` | No | `EasyFileReferrals` |
| `EASYFILE_REFERRALS_REQUIRED` | No | `3` |
| `EASYFILE_ALLOWED_ORIGINS` | Yes | `https://easy-online-office.github.io,https://your-custom-domain.example` |
| `FUNCTIONS_WORKER_RUNTIME` | Yes | `node` |

`AzureWebJobsStorage` is used when `EASYFILE_REFERRALS_STORAGE` is not set.

## GitHub deployment

Configure the repository:

1. Add repository variable `AZURE_FUNCTIONAPP_NAME` containing the Function App name.
2. Add repository secret `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` containing the Function App publish profile XML.
3. Run **Deploy EasyFile Referral API** from GitHub Actions, or merge changes under `referral-api/` into `main`.
4. Bind `api-easyfile.skunkworks.africa` to the Function App or change `assets/js/easyfile-referral-config.js` to the deployed API URL.

## Local development

```bash
cd referral-api
cp local.settings.example.json local.settings.json
npm install
npm start
```

Use Azurite when `UseDevelopmentStorage=true` is configured.

## Endpoints

### `POST /api/referrals/session`

Creates or retrieves a participant, attaches an optional referral code and returns current access status.

```json
{
  "email": "user@example.com",
  "referralCode": "ABC234DE"
}
```

### `POST /api/referrals/use`

Consumes the once-off use and qualifies the referring user when applicable.

```json
{
  "email": "user@example.com",
  "moduleId": "invoice",
  "event": "export pdf"
}
```

### `GET /api/referrals/health`

Returns service health and the configured referral requirement.

## Access states

- `trial`: one qualifying module use remains.
- `locked`: the trial is consumed and fewer than three referrals have qualified.
- `unlocked`: at least three referrals have qualified; continued module use is permitted.
