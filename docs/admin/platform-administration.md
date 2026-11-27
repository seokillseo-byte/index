# Platform administration

## Provision the first platform administrator

1. Temporarily set PUBLIC_SIGNUP_ENABLED=true in `.env.api`, restart the API, and register the trusted operator account through the customer registration page or POST /api/v1/auth/register.
2. Immediately set PUBLIC_SIGNUP_ENABLED=false and restart the API. Public signup remains closed until email verification is implemented.
3. Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_ROLE=super_admin in the host-side `.env` file.
4. After migrations are applied, run:

```bash
set -a
. ./.env
set +a
bash infra/postgres/bootstrap-platform-admin.sh
```

The bootstrap script uses MIGRATION_DATABASE_URL and must only be run by the database migration owner. It does not expose a public admin-claim endpoint. Do not commit .env or share credentials in chat.

## Platform roles

- super_admin: all platform operations.
- admin: customer, order, CMS and ad operations.
- support: customer and order read access.
- content_editor: CMS page/post operations.
- ad_manager: campaign, advertiser inquiry and ad-slot operations.

All admin requests require an authenticated user session and an active row in app.platform_admins. Platform-wide data access uses a dedicated database transaction context and the app.is_platform_admin() RLS policy. Admin mutations write to app.platform_admin_audit_logs.

## API routes

- GET /api/v1/admin/overview
- GET /api/v1/admin/customers and GET /api/v1/admin/customers/:tenantId
- PATCH /api/v1/admin/customers/:tenantId/status
- GET /api/v1/admin/orders and PATCH /api/v1/admin/orders/:id/status
- GET/POST /api/v1/admin/cms/pages
- GET/POST /api/v1/admin/cms/posts
- GET /api/v1/admin/ads/campaigns and PATCH /api/v1/admin/ads/campaigns/:id/status
- GET /api/v1/admin/ads/inquiries and PATCH /api/v1/admin/ads/inquiries/:id/status
- GET /api/v1/admin/ads/slots and PATCH /api/v1/admin/ads/slots/:id
- GET /api/v1/admin/audit

Paid orders cannot be marked fulfilled until their status is paid. Refunds and payment success must be confirmed by payment-provider webhooks, not by editing payment rows manually.

## Security release gates

Platform-admin MFA/WebAuthn, email verification and account recovery delivery are not yet implemented. Keep admin access restricted to a trusted network until MFA and recovery controls are enabled. The UI/API foundation is not a production security certification.
