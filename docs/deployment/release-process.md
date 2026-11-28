# Index Assist — Release and deployment process

## Branching model

Use the existing feature branch for implementation work. Do not create a new branch for every small fix.

- `main`: production/release baseline after review and CI.
- `feature/*`: implementation and hardening work.
- Optional short-lived `fix/*`: only when a focused urgent fix must be isolated from a larger feature.

For the current provider/auth work, continue on `feature/provider-job-engine`. Do not rebase it onto `main` automatically while the historical one-commit divergence is still being reviewed.

## What gets deployed

The repository is designed to be deployed from a clean Git checkout. Do not copy secrets into Git.

Production configuration stays outside the repository in:

- `.env`
- `.env.api`
- `.env.worker`
- `.env.crawler`
- `.env.provider-worker`

Use the corresponding `*.example` files as configuration templates.

## Recommended release flow

1. Finish implementation on the feature branch.
2. Let the pull-request CI pass.
3. Review the effective PR diff against `main`.
4. Merge the reviewed PR into `main`.
5. On the VPS, fetch the approved `main` revision.
6. Verify the working tree is clean before deployment.
7. Apply database migrations using the migration owner.
8. Build/restart the workload compose stack.
9. Verify readiness and inspect service logs.
10. Run the post-deployment smoke checks.
11. Keep the previous image/build available for rollback.

The deployment procedure must never copy production secrets from the repository or bake them into Docker images.

## VPS update

From the repository checkout on the VPS, the intended update pattern is:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main

bash infra/postgres/migrate.sh

docker compose --env-file .env \
  -f infra/docker/compose.infrastructure.yml \
  -f infra/docker/compose.workloads.yml \
  up -d --build
```

Then verify:

```bash
curl -fsS http://127.0.0.1:4000/api/v1/health/ready
docker compose --env-file .env \
  -f infra/docker/compose.infrastructure.yml \
  -f infra/docker/compose.workloads.yml \
  ps
```

Do not run these commands against production until the release gates in `PROJECT_STATUS.md` are complete.

## Exporting code for deployment

A deployment archive is not required. Git is the preferred transport because it preserves the exact release revision and makes rollback auditable.

If an offline source archive is ever needed, create it from the approved release tag/revision rather than from an arbitrary working tree. Never include `.env` or real credentials in that archive.

## Rollback principle

Rollback application code to the last approved Git revision/image first. Database migrations must be backward-compatible with the running application before a release is considered rollback-safe. Do not blindly downgrade migrations in production.

## Current release blocker

The project is not yet production-release-ready. Current blockers are CI validation for the latest branch head, focused authentication security tests, non-production capacity/recovery benchmarks, real provider end-to-end validation, backup/restore, observability/security review, and the remaining production infrastructure gates.
