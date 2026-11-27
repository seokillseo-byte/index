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

Registration creates a user, an owner membership, a Free plan subscription and a starter project. The response includes short-lived bearer and rotating refresh tokens plus the starter project ID.

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
- The public registration flow currently lacks email verification, MFA and account recovery. Keep public signup closed until those modules and their delivery providers are completed and tested.
- Search Console and Bing integrations are not yet connected to this API.


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

The OAuth connection alone does not authorize arbitrary third-party backlink submissions. The project must be associated with a verified site/property belonging to the connected account. Provider site selection, refresh-token rotation, property verification, URL Inspection jobs and Bing JSON/HTTP submission jobs are subsequent integration stages.
