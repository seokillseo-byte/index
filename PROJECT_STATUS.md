# Index Assist — Project Status

Updated: 2026-11-29

## Current implementation state

- Product target: multi-tenant backlink URL discovery and indexing-workflow SaaS with Google and Bing provider integrations.
- Capacity target: 32 vCPU / 64 GB RAM / 2 TB NVMe / 1 Gbps; this is a target specification, not a measured throughput result.
- Main baseline: `568e00af228c64249f5da6e4ec22f29e6cbe10be`.
- Active implementation branch: `feature/provider-job-engine`.
- Latest fully passing CI checkpoint is `f25e94108f7648ecca8a90b6689615c85e391ad0` (CI #346). CI #340 passed on `e8775af48a90e4a9772ad676c1ae2899a20f753f` for secure Redpanda source/provisioning tests; CI #341 and #346 passed subsequent documentation checkpoints. CI #306 previously validated multi-recipient age encryption/decryption with two independent identities. All three jobs passed at each latest checkpoint. The storage client is lifecycle-managed, readiness checks PostgreSQL and Redis, and Compose avoids interpolating the Redis password into command arguments.
- Review PR #6 remains open and unmerged.
- GitHub reports the branch remains diverged from main by one main-only commit that overlaps provider-engine files; PR mergeable=false. Ahead count changes as this long-running feature branch receives incremental commits. Do not rebase or merge automatically; review the effective diff before integration.
- No local working-tree status is available in this workflow; this status reflects GitHub branch/PR data only.

## Authentication and tenant isolation

- Email verification is single-use, expires after 30 minutes, and is required before login/refresh can issue sessions.
- MFA/TOTP enrollment and login, hashed single-use recovery codes, MFA challenge lockout after five failed attempts, password recovery, and server-side session management are implemented.
- Password reset and MFA disable revoke existing sessions.
- Tenant/session isolation tests cover JWT session binding, tenant-switch rejection, and session revocation ownership.
- MFA enrollment, disable, and single-active challenge issuance are transactionally serialized.
- API Jest tests and database regression tests cover MFA lockout, auth-token replay, recovery-code replay, and tenant RLS.

## Provider job engine

- Tenant-aware project/backlink verification and verified-property binding; URL-prefix matching enforces path-segment boundaries.
- Google Search Console and Bing Webmaster integrations with AES-256-GCM encrypted credentials.
- Provider job persistence, transactional outbox, Kafka `provider.jobs` topic, and isolated provider worker.
- Google URL Inspection queue admission and worker execution enforce per-property daily/minute limits; worker reservations are serialized in PostgreSQL across worker instances.
- Bing URL submission checks live DailyQuota/MonthlyQuota.
- Retry/backoff, dead-letter handling, lease recovery, batch draining, idempotency, provider job history, attempt timestamps, and provider-job indexes are implemented.
- Provider acceptance and Google inspection evidence are not treated as proof of indexing.

## CI validation

- CI #184 passed on commit `1a9be1d87fa541866777475f28d0a6c3fe682bb4`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46107552896).
- CI #276 passed on commit `6f2abb0263cd52618f16add28c371f0d4045ddbc`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46110245705). CI #277 passed on `f61dc7ffb1605e32c93b2b623277f5d70bfb40f6`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46110358016), including Redis reconnect/recovery. CI #286 passed on `da76342e9d0e295e565c45e3e541778f59565f5d`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46110473131), all three jobs successful. CI #306 passed on `bd152d3b6c324720cfdf3047cd73510f54390def`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46111164620). It verifies YAML syntax for both Compose files and Redpanda templates, Node typecheck/build/Jest, mocked backup safety, real age encryption/decryption using two independent recipients (both identities can restore), invalid/duplicate/empty recipient rejection, Go race/vet, and database regressions.
- CI #340, #341 and #346 passed all three jobs. Validation includes database migrations plus tenant RLS/MFA/auth-token/recovery-code regression SQL; crawler Go race tests and vet; Node dependency install, typecheck, build, Jest, worker syntax checks, backup/restore safety, Redpanda YAML and merged Compose validation, secure provisioning mock tests and age encryption regression tests.
- Earlier backup security checkpoints also passed: CI #180 validates real age encryption/decryption and wrong-identity rejection; CI #183 validates owner-only age identity permissions.
- CI coverage does not replace a live PostgreSQL restore drill, provider-account E2E, or production-like capacity benchmark.
- Any later source change requires its own CI run. CI #306 passed the multi-recipient age backup source/tests. CI #340 passed the latest Redpanda secure Compose/provisioning changes and mock tests; CI #341 passed the documentation checkpoint.

## Backup and recovery

- PostgreSQL custom-format backups are created in a private temporary directory, validated, age-encrypted before final storage, checksummed and manifested; plaintext temporary dumps are removed.
- Restore verifies checksum, enforces owner-only age identity file permissions, decrypts to a private temporary directory, validates the archive and requires explicit non-production/empty-target operator confirmations.
- CI tests use mocked PostgreSQL utilities; age cryptography is exercised with ephemeral test identities.
- Backup encryption now supports multiple independent age recipients and records public recipients in the manifest; a runbook documents off-site replication, retention and recovery-key custody requirements. No remote object-storage destination, retention lifecycle, PITR, protected identity custody or independent recovery-key retrieval test has been configured or completed. No live PostgreSQL restore drill has been completed.

## Benchmark checkpoint

- A dedicated non-production PostgreSQL queue benchmark harness and runbook exist.
- Harness measures PostgreSQL queue claim/update throughput only; it does not call Google/Bing and cannot prove end-to-end provider submission throughput.
- No benchmark has yet been run against dedicated non-production hardware.
- No evidence currently establishes 1,000,000 URLs/day.

## Shared API rate limiting

- Replaced process-local Nest throttler storage with a Redis-backed storage adapter using one atomic Lua operation for counters/block windows.
- Redis URL is required; the API does not silently fall back to per-process counters. Redis connection/command failure returns HTTP 503 for rate-limited requests.
- API Compose startup waits for Redis health; API readiness now checks both PostgreSQL and Redis; Redis uses `noeviction` so memory pressure cannot silently discard throttle counters; `.env.api.example` documents `REDIS_URL` using the same password configured by infrastructure Redis. Client retry backoff now continues reconnect attempts after transient outages while rate-limited requests remain fail-closed during reconnect.
- Unit tests cover atomic command arguments, lazy connection, missing configuration and fail-closed outage behavior. A Redis-backed integration test uses two independent storage instances to verify shared counters/block state; CI now provisions Redis for the Node job. The integration test and reconnect/recovery regression passed in CI #276/#277/#286. A deployed Redis outage drill remains outstanding.

## Kafka / Redpanda transport security

- Added shared KafkaJS TLS/SCRAM-SHA-512 configuration for outbox relay and provider worker, and a Go kafka-go TLS/SCRAM-SHA-512 dialer for crawler.
- Production worker/crawler containers set `NODE_ENV=production`; both client implementations reject plaintext Kafka configuration in production and require a CA file plus dedicated SCRAM identity.
- Added unit tests, environment examples, read-only CA mounts, a Redpanda TLS/SASL listener example and `docs/deployment/kafka-security.md` with least-privilege ACL plan and negative test gates.
- The base development Compose service still pins EOL `v24.3.7` and remains plaintext. Added a separate secure non-production overlay targeting `v26.3.1` on a new `redpanda_data_secure` volume, mounting Kafka/Admin TLS material and first-start bootstrap. Static review caught and corrected a missing `redpanda.enable_sasl: true` setting in the broker template; the secure-config test now asserts SASL activation, Kafka ACL authorization, Kafka TLS and loopback Admin API TLS/binding. The broker and provisioner now fail early if their required certificate/password files are unreadable; the runbook explains how to align private-file ownership with the exact image's unprivileged UID/GID. The `redpanda-init` sidecar now shares the broker network namespace; secure mode reads the bootstrap admin password and three service SCRAM passwords from Docker secret files, creates the existing topics, provisions the outbox/crawler/provider principals and applies the least-privilege topic/group/idempotent-write ACL matrix. Provisioning scripts include repeat-safe checks and mock tests; CI #340 passed YAML and merged Compose validation, Node typecheck/build/Jest, shell syntax, topic provisioning mock tests, secure SCRAM user/ACL repeat-safety tests, Go race/vet and database regressions: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46119413495). CI #341 passed the current documentation checkpoint: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46119449767). No live broker, certificate or credential has been used. The old v24.3.7 volume is deliberately untouched and no data-format upgrade has been rehearsed. Live SCRAM/TLS handshake, positive/negative ACL tests and service restart/recovery remain release gates. Do not deploy production workloads until all gates pass.

## Remaining release gates

1. Execute queue benchmark on dedicated non-production database/hardware; record jobs/sec, p50/p95/p99 queue latency, DB CPU/IO, connections and saturation.
2. Execute sustained queue/backpressure and worker failure/recovery protocols; retain metrics and evidence.
3. Run real Google/Bing end-to-end tests with non-production provider accounts.
4. [x] Implement shared Redis-backed API throttling with atomic Lua counters and fail-closed 503 behavior; two-client integration and reconnect/recovery tests passed in CI #276/#277/#286. Live outage drill remains pending.
5. [x] Prepare an isolated v26.3.1 secure non-production Compose overlay and authenticated provisioning scripts; live broker upgrade/TLS/SCRAM/ACL validation and denied-access tests remain pending.
6. Configure protected off-site encrypted backups, retention, age identity recovery/key escrow and execute a non-production restore drill.
7. Implement metrics/logging/alerting, define thresholds/owners and test alert delivery in non-production.
8. Complete independent security/dependency review and resolve findings.
9. Complete production VPS, HTTPS and DNS validation only after prior gates and explicit release approval.
10. Assess the 1,000,000 URL/day target only from measured end-to-end capacity; no current claim is made.

## Immediate next step

Next: provision actual non-production certificates and secret files, bring up the isolated v26.3.1 overlay on its separate volume, verify TLS/SCRAM and positive/negative ACL behavior, then rehearse the v24.3.7 data-volume upgrade on a separate cold copy with a rollback plan. Off-site object storage, key custody, restore drills and benchmark execution require external non-production infrastructure and operator-controlled credentials. Do not use production credentials/data, merge into `main`, deploy production, or add unrelated features.


## 2026-11-28 — Secure Redpanda configuration checkpoint

- CI #351 passed on branch head `651aa595da71c1c70e6ed6bee31ac3ca25b5d6c1`: [workflow run](https://github.com/seokillseo-byte/index/actions/runs/46167799041). All three jobs passed: database migrations/security regressions, Node typecheck/build/Jest plus Compose/Redpanda YAML, shell syntax and backup/Redpanda mock tests, and crawler Go race/vet.
- Static review corrections validated by this run: explicitly enable `redpanda.enable_sasl: true`; assert Kafka ACL/TLS and loopback Admin API TLS settings; check secret/certificate readability for the non-root image; escape container-shell variables from Compose interpolation.
- CI is static/mock validation only. It does not start a Redpanda broker or prove TLS/SCRAM handshakes, ACL allow/deny, restart recovery, volume upgrade or rollback.
- The Kafka security runbook UID/GID `printf` example was checked for newline escaping; no runtime behavior is changed by that example.
- PR #6 remains open, unmerged and mergeable=false. No merge, rebase, production deployment, secret change or destructive operation was performed.


## 2026-11-29 — Redpanda Compose secret expansion guard

- Follow-up review found the one-shot `redpanda-init` command substitution for the Admin password was not explicitly escaped for Docker Compose interpolation. Updated it to `$$(cat ...)` so the container shell, not Compose, performs the secret-file read.
- Added a regression assertion to `infra/redpanda/tests/compose-secure-config-mock.sh` that requires the escaped form.
- Current branch head: `98c9527242933868675a1e357e3d04003ba4238d`. No CI run for this latest checkpoint was visible through the available PR-run/status lookup at review time; treat the change as pending CI until a run is confirmed.
- PR #6 remains open, unmerged and `mergeable=false`; branch comparison reports 361 commits ahead and 1 behind `main`. No merge/rebase/deployment or live broker action was performed.


## 2026-11-29 — Secure Redpanda Compose topology regression guard

- Extended `infra/redpanda/tests/compose-secure-config-mock.sh` to inspect the fully merged Compose model, not just YAML syntax. The test now asserts that the secure overlay keeps both broker and provisioner on Redpanda v26.3.1, preserves the provisioner's shared broker network namespace and healthy-broker dependency, uses only the isolated `redpanda_data_secure` volume, and does not publish the Admin API port.
- Latest implementation checkpoint: `11ae3cd1b9c8e2bf222475ee1602fc783061b139`. The available GitHub PR-run/status lookup returned no run/status entries for this SHA; CI is therefore pending/unconfirmed, not passed.
- This validates the merged Compose topology statically in CI when the test runs. It does not start Redpanda or verify TLS/SCRAM/ACL behavior against a live broker.
- PR #6 remains open and unmerged; no merge/rebase, deployment, secret change, volume migration or destructive action was performed.


## 2026-11-29 — Secure Redpanda provisioner negative-path coverage

- Expanded `infra/redpanda/tests/provision-secure-cluster-mock.sh` to assert fail-closed behavior for plaintext Kafka, Admin API without TLS, a non-SCRAM mechanism, missing bootstrap Admin password, a too-short service SCRAM password and an unreadable CA file.
- The short-password case temporarily removes the outbox principal from the mock state so the provisioner must validate the supplied password instead of taking the idempotent existing-user path. The test then restores the fixture and asserts rejected configurations did not mutate topic/user/ACL counts.
- Latest code checkpoint: `dca6ddaeba566a3f2d40b4c7ef7f8b992b9f1e66`. These tests are wired into the Node CI job, but this workflow cannot execute repository shell commands; latest CI run/status remains unconfirmed through the available GitHub Actions lookup.
- No live broker, VPS, credentials, certificates or persistent data volume was accessed.


## 2026-11-29 — Redpanda CA negative-path coverage follow-up
- Extended secure provisioner mock rejection coverage to include missing Kafka CA, missing Admin API CA and an empty Admin API CA file.
- These are source-level regression cases wired into the Node CI job; execution on the current branch head is not confirmed by the available workflow/status lookup.
- Live broker TLS/SCRAM/ACL, credential/CA handshake, restart/recovery and cold-copy volume migration remain unverified release gates.


## 2026-11-29 — Complete empty-CA rejection coverage
- Added an explicit mock case for an empty Kafka CA file, alongside the missing Kafka CA, missing Admin API CA and empty Admin API CA cases.
- Secure provisioner mock coverage now checks missing, empty and unreadable CA inputs; all invalid-input cases are followed by resource-count assertions to detect unintended topic/user/ACL mutation.
- These are CI-wired regression tests only. CI execution on the current branch head and live Redpanda validation remain unconfirmed.


## 2026-11-29 — Redpanda service-secret negative paths
- Added mock rejection cases for a missing service SCRAM password file and an empty service SCRAM password file. Each case temporarily removes the outbox principal from mock state to exercise the new-user validation path, then restores the fixture.
- Invalid-input resource-count assertions remain in place for topics, SCRAM principals and ACLs. These are mock regressions wired into CI; latest CI execution and live broker validation are not confirmed.


## 2026-11-29 — Full service-secret mapping coverage
- Expanded the missing/empty SCRAM password-file mock cases from the outbox principal to crawler and provider principals. The test now exercises all three `*_PASSWORD_FILE` environment mappings on the new-user path, with each mock principal restored after its rejection cases.
- The existing final no-mutation assertions still check topic, user and ACL counts. This is CI-wired test source only; CI execution and live broker behavior remain unverified.
