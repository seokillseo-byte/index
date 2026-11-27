# Search-engine integrations: supported capabilities and policy boundaries

Last reviewed: 2026-11-28.

## Product principle

Index Assist reports distinct states and never equates a crawler HTTP response, an accepted submission, a search-engine crawl, and confirmed index inclusion.

A customer may only inspect or submit URLs for properties that the connected account is authorized to manage. Third-party backlink source pages are not customer-owned merely because they link to a customer's target page. We must not submit third-party URLs through a customer's Google Search Console or Bing Webmaster property.

## Google Search Console

### OAuth and property access

- Use Google's OAuth 2.0 authorization-code flow.
- Request the minimum scope by feature: `https://www.googleapis.com/auth/webmasters.readonly` for read-only URL inspection and site data; request `https://www.googleapis.com/auth/webmasters` only for features that actually write, such as sitemap management.
- Enumerate Search Console sites after connection and require sufficient property permission before associating a property with a project.
- Bind a project to a verified Search Console property and verify URL prefix/domain membership before scheduling inspections.

Official docs:
- https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- https://developers.google.com/webmaster-tools/v1/api_reference_index
- https://developers.google.com/webmaster-tools/limits

### URL Inspection

- Endpoint: `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`.
- Inspect only URLs belonging to the connected Search Console property.
- Persist fields such as `indexStatusResult.verdict`, `coverageState`, `robotsTxtState`, `indexingState`, `lastCrawlTime`, `pageFetchState`, `googleCanonical`, and `userCanonical` when returned.
- The documented URL Inspection quota is 2,000 requests/day per site and 600 requests/minute per site. Quotas must be tracked per Google property, not only per tenant.
- The URL Inspection API is a read/inspection API. It does not provide a general-purpose programmatic "Request indexing" endpoint for arbitrary URLs.

### Discovery at scale

For pages a customer owns, prefer a sitemap that the customer publishes on their own domain and submit that sitemap through Search Console. A sitemap is a discovery signal, not an indexing guarantee. Do not create or host a sitemap on Index Assist's domain and imply that it can make Google index arbitrary third-party backlink pages.

Google's guidance:
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
- https://support.google.com/webmasters/answer/9012289/

The Google Indexing API is not a general URL submission mechanism; its eligibility is limited to supported structured-data use cases such as job postings and livestream pages. It must not be used for ordinary backlink URLs.

## Bing Webmaster Tools

### Supported transport

Microsoft's documentation states that legacy SOAP and POX/HTTP API protocols were retired on 2026-08-31. Implement the supported JSON/HTTP REST protocol only; do not ship integrations that call SOAP or POX endpoints.

- API overview: https://learn.microsoft.com/en-us/bingwebmaster/
- OAuth guide: https://learn.microsoft.com/en-us/bingwebmaster/oauth2
- Protocol migration: https://learn.microsoft.com/en-us/bingwebmaster/api-protocols

The Bing OAuth guide documents delegated scopes `Webmaster.read` and `Webmaster.manage`. Credentials and refresh tokens must be encrypted at rest. The JSON API must be verified against current Microsoft API reference and live account behavior before enabling automatic submissions.

### URL submission

- Use the supported JSON/HTTP URL submission operation only after confirming the project URL is part of a site verified in the connected Bing Webmaster account.
- The public Bing help page documents up to 500 URLs per batch and a 10,000 URL/day per-domain quota; actual quota can vary and must be fetched from the account API before dispatch.
- Record an HTTP/API acknowledgement as `accepted_by_bing`, never as `indexed`.
- Bing recommends IndexNow for publisher-controlled URL changes. IndexNow requires the publisher to prove control of the host by publishing the key file; it is not a mechanism for notifying Bing about arbitrary third-party backlink pages.

Official docs:
- https://www.bing.com/webmasters/help/url-submission-62f2860b
- https://www.bing.com/indexnow

## Unified data model and workflow

Each submission or inspection must record:
- tenant, project, provider, property/site URL and URL;
- action (`inspect`, `submit_url`, `submit_sitemap`, `indexnow_notify`);
- attempt number, idempotency key, quota bucket, request/response code;
- provider request ID or response summary, timestamps and next retry;
- provider result as a separate observation, with confidence and source.

Use per-property quota reservations, a provider-specific rate limiter, exponential backoff for transient errors, dead-letter handling for permanent authorization/property errors, and a circuit breaker for provider outages. Never retry a permanent permission or unsupported-URL error indefinitely.

## UI wording

Allowed statuses:
- `queued_for_provider`
- `accepted_by_provider`
- `inspection_complete`
- `crawled_observed`
- `indexed_confirmed`
- `not_indexed`
- `blocked_or_not_eligible`
- `provider_error`

Do not show "Google indexed" based solely on an accepted API submission or a 200 response from an unrelated crawler.
