# Authentication and URL ingestion API

Base path: `/api/v1`.

## Register a workspace

`POST /auth/register`

```json
{
  "email": "operator@example.com",
  "password": "replace-with-a-unique-12-plus-character-password",
  "displayName": "SEO Operator",
  "workspaceName": "Example SEO Workspace"
}
```

Registration creates a user, an owner membership, a Free plan subscription and a starter project. It sends an email verification link and does not issue access or refresh tokens until the address is verified.

## Sign in

`POST /auth/login`

```json
{
  "email": "operator@example.com",
  "password": "replace-with-a-unique-12-plus-character-password"
}
```

## Refresh a session

`POST /auth/refresh`

```json
{ "refreshToken": "the-opaque-refresh-token" }
```

A successful refresh revokes the previous refresh token and returns a replacement. Refresh sessions are bound to one tenant; a revoked membership invalidates the session on subsequent authenticated requests.

## Ingest URLs

`POST /ingestion/urls`

Headers:
- `Authorization: Bearer <accessToken>`
- `Idempotency-Key: <unique-client-generated-key>`

Body:

```json
{
  "projectId": "the-project-id-returned-at-registration",
  "tier": 1,
  "urls": [
    "https://example.org/article-a",
    "https://example.net/resource-b"
  ]
}
```

The API accepts up to 5,000 URL strings per request, normalizes HTTP(S) URLs, deduplicates within the project, stores HTTP-check tasks, reserves daily quota atomically, and writes a transactional outbox event. The outbox relay publishes the event to Kafka; crawler consumers then claim tenant-scoped tasks.

A response with `accepted: 2` means the URLs entered the Index Assist processing queue. It does not mean Google or Bing has crawled or indexed them. HTTP eligibility, robots policy, search-engine submission acknowledgements, crawl observations and verified index status are separate signals.

## Current limits and release caveats

- The seeded Free plan allows 500 accepted URLs/day; Growth 25,000/day; Scale 1,000,000/day. Pricing and entitlement changes must be managed through the billing/admin system before commercial launch.
- Registration now requires email verification before login/session issuance. Verification uses a 30-minute single-use token and transactional email delivery. MFA, password recovery and server-side session management are implemented; production signup should still remain closed until end-to-end security testing is completed.
- Google Search Console and Bing Webmaster integration endpoints and provider queues are implemented; live provider-account end-to-end validation remains a release gate.


## Projects

- `GET /api/v1/projects` — list projects in the authenticated workspace, including URL and discovered-backlink counts.
- `POST /api/v1/projects` — create a project, subject to the active plan's project limit.

```json
{
  "name": "Example domain",
  "targetUrl": "https://example.com/"
}
```

- `PATCH /api/v1/projects/{projectId}` — update the project name or target URL. The target URL is the destination that backlink verification compares against.

## Backlink verification

`GET /api/v1/projects/{projectId}/backlinks?page=1&limit=50`

Returns discovered source pages, target URLs, anchor text, rel attributes, link classification, first/last observation timestamps and occurrence counts. The Go crawler schedules HTML analysis after a successful HTML health check, fetches a bounded response, revalidates robots policy on redirects and compares resolved anchor destinations to the configured project target URL.

A discovered backlink is an observed HTML link, not proof that a search engine has crawled or indexed the source page. Search-engine index status is reported separately and requires an authorized Google Search Console or Bing Webmaster connection.


## Search-engine integrations

- `POST /api/v1/integrations/google_search_console/connect` with `{"projectId":"..." }` — returns a Google OAuth authorization URL.
- `POST /api/v1/integrations/bing_webmaster/connect` with `{"projectId":"..." }` — returns a Bing Webmaster OAuth authorization URL.
- `GET /api/v1/integrations/{provider}/callback` — provider callback. The callback state is signed, single-use, tenant-bound and expires after ten minutes.
- `GET /api/v1/integrations` — list connections in the authenticated workspace.
- `GET /api/v1/integrations/{connectionId}/sites` — list provider properties available to the connected account.
- `POST /api/v1/integrations/{connectionId}/sites` with `projectId` and `siteUrl` — bind a provider property to a project after checking domain/path coverage and provider permissions.
- `POST /api/v1/integrations/bing_webmaster/api-key` with `projectId` and `apiKey` — connect Bing using its account API key as a fallback to OAuth.
- `DELETE /api/v1/integrations/{connectionId}` — disconnect the connection and delete its locally stored encrypted token payload.

Configure provider client credentials and exact redirect URIs in `.env.api`. The API also requires a 32-byte hex `INTEGRATION_ENCRYPTION_KEY` for AES-256-GCM token encryption and an `OAUTH_STATE_SECRET` of at least 48 characters. Never commit real credentials.

The OAuth connection alone does not authorize arbitrary third-party backlink submissions. The project must be associated with a verified site/property belonging to the connected account. Google URL Inspection and Bing URL submission jobs are available only for URLs covered by that bound verified property. Provider responses are recorded as inspection evidence or submission acknowledgements, not as proof of indexing.


## Provider URL operations

All provider operations require a connected account and a verified property explicitly bound to the project.

- `POST /api/v1/integrations/{connectionId}/google-inspections`
- `POST /api/v1/integrations/{connectionId}/bing-submissions`
- `GET /api/v1/integrations/{connectionId}/jobs?projectId={projectId}&page=1&limit=50` — inspect provider job states and results.

Example body:

```json
{
  "projectId": "project-uuid",
  "siteUrl": "https://example.com/",
  "urls": [
    "https://example.com/page-a",
    "https://example.com/page-b"
  ]
}
```

Google URL Inspection is an inspection operation, not an indexing request. The queue enforces the documented per-property limit of 2,000 inspections/day and 600/minute. Bing URL submissions are limited to 500 URLs per batch and the API reads each site's live DailyQuota and MonthlyQuota before reserving jobs. Both operations accept only URLs covered by the bound verified property.

Jobs are persisted in app.provider_jobs and published through the transactional outbox to the provider.jobs Kafka topic. The provider worker records Google inspection results separately from Bing submission acknowledgements. A Bing acknowledgement means accepted by Bing, not indexed.


## Email verification

- `POST /api/v1/auth/register` creates the workspace and sends a verification email; it does not issue access/refresh tokens until the email is verified.
- `POST /api/v1/auth/verify-email` with `{ "token": "..." }` marks the address verified. Tokens are single-use and expire after 30 minutes.
- `POST /api/v1/auth/resend-verification` with `{ "email": "..." }` sends a new verification message for an unverified account.

The API uses the Resend REST API for transactional delivery. Configure `RESEND_API_KEY` and `EMAIL_FROM` in `.env.api`; no provider credential is committed to the repository. The verification URL is generated from `APP_BASE_URL`.

## MFA, password recovery and sessions

- POST /api/v1/auth/mfa/setup — authenticated user starts TOTP enrollment; returns the secret and otpauth:// URI. The secret is encrypted at rest.
- POST /api/v1/auth/mfa/verify with { "code": "123456" } — verifies enrollment, enables MFA and returns one-time recovery codes. Store recovery codes securely; they are hashed at rest and cannot be retrieved later.
- POST /api/v1/auth/mfa/disable with password + current TOTP code — disables MFA and revokes all active sessions.
- POST /api/v1/auth/mfa/login with { "challengeToken": "...", "code": "123456" } — completes an MFA-protected login challenge and only then issues a session.
- POST /api/v1/auth/mfa/recovery with { "challengeToken": "...", "recoveryCode": "..." } — consumes one recovery code for a login challenge.
- POST /api/v1/auth/password-reset/request with { "email": "..." } — sends a generic password reset response; the reset token expires after 30 minutes.
- POST /api/v1/auth/password-reset with { "token": "...", "password": "..." } — changes the password and revokes existing sessions; the response does not disclose the account identifier.
- GET /api/v1/auth/sessions — lists the authenticated user's server-side sessions.
- DELETE /api/v1/auth/sessions/{sessionId} — revokes one session.
- POST /api/v1/auth/sessions/revoke-all — revokes all sessions except the current access-token session.

MFA uses TOTP compatible with standard authenticator applications. MFA login/recovery and enrollment verification endpoints are rate-limited; a login challenge is invalidated after five failed TOTP or recovery-code attempts. Password reset and MFA disable have stricter limits. Recovery codes are single-use. Password-reset and MFA challenge tokens are stored only as SHA-256 hashes. MFA secrets are encrypted with the existing AES-256-GCM integration key.