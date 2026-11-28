## 2026-11-28 — Multi-recipient backup recovery and Redpanda admin hardening templates

- Extended PostgreSQL backup encryption to accept comma-separated BACKUP_AGE_RECIPIENTS, retaining the legacy single-recipient variable as fallback; the manifest records public recipient values and count.
- Added tests for invalid/duplicate recipient rejection and real age encryption/decryption using two independent private identities. Each identity can recover the same encrypted artifact; this is not threshold cryptography.
- Documented off-site object-storage separation, object integrity verification, retention/RPO/RTO decisions and independent age-key custody. No remote storage, retention lifecycle or private identity was configured.
- Updated the Redpanda example toward supported v26.3.1 and added first-start Admin API bootstrap protection. Added explicit warning that current Compose v24.3.7 is EOL and its anonymous plaintext topic-init job cannot be reused after SASL activation.
- Added loopback-only Admin API TLS to the broker template and documented why Kafka SASL alone does not protect the Admin API.
- No broker image upgrade, persistent-volume modification, secret provisioning, production deployment or live infrastructure operation was performed.
- CI #306 passed on `bd152d3b6c324720cfdf3047cd73510f54390def`: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46111164620). The run verifies YAML syntax, Node typecheck/build/Jest, Bash syntax and backup safety, real age encryption/decryption with two independent recipients (each identity restored successfully), invalid/duplicate/empty recipient rejection, Go race/vet and database regressions.

## 2026-11-28 — Redis reconnect regression CI passed; Redpanda lifecycle gate

- CI #277 passed on `f61dc7ffb1605e32c93b2b623277f5d70bfb40f6`: Redis reconnect/recovery unit test, two-client Redis integration, Node typecheck/build/Jest, worker tests, crawler Go race/vet, database regressions and age backup/restore safety checks.
- Redis retry policy now continues reconnect attempts with bounded backoff after transient connection failures; rate-limited API requests remain fail-closed until Redis is ready.
- Static review found the infrastructure pins Redpanda `v24.3.7`, from the 24.3 release line which is end-of-support. This is now a production release gate: select a supported broker release and repeat TLS/SCRAM/ACL compatibility tests before deployment.
- Kafka Node/Go client TLS/SCRAM support and ACL runbook are implemented, but the active broker listener remains plaintext/development-only. Broker activation and real positive/negative ACL integration remain outstanding.
- No live Redpanda broker, credentials, certificates, non-production PostgreSQL host or production environment was accessed or modified.

## 2026-11-28 — Redis CI repair and reconnect recovery

- Inspected failed GitHub Actions logs and identified Redis throttler TypeScript errors: NestJS record type was not publicly exported and ioredis CommonJS import did not match package typings.
- Corrected the API adapter to use the NestJS storage interface, local compatible record shape and ioredis named class import.
- Corrected the test mock's ioredis type import.
- CI #276 passed on `6f2abb0263cd52618f16add28c371f0d4045ddbc`: database, crawler Go race/vet, Node typecheck/build/Jest, worker Kafka/quota tests, Redis two-client integration and age backup/restore safety tests.
- Changed Redis retry strategy to continue bounded reconnect attempts after transient outages; requests still fail closed while Redis is not ready.
- Added a Redis reconnect/recovery regression test in `f61dc7ffb1605e32c93b2b623277f5d70bfb40f6`; CI #277 is pending.
- No live non-production Redis outage drill or production deployment was performed.

## 2026-11-28 — Kafka TLS/SCRAM client support and rollout guardrails

- Added a shared KafkaJS client config for the outbox relay and provider worker with CA-verified TLS and SCRAM-SHA-512.
- Added a Go kafka-go dialer for the crawler with TLS 1.2+, CA verification and SCRAM-SHA-512.
- Production workloads now set `NODE_ENV=production`; Node and Go clients reject plaintext Kafka settings in production and reject incomplete SCRAM/CA configuration.
- Added unit tests for Node/Go config validation, environment examples, read-only CA mounts, CI syntax checks, a Redpanda TLS/SASL listener template and a least-privilege ACL rollout runbook.
- The existing Redpanda Compose listener remains plaintext and is explicitly marked development-only. Broker activation, admin bootstrap, per-service SCRAM users, ACL enforcement and live denied-access tests remain incomplete; do not deploy production workloads before those gates pass.
- No broker, credential, certificate or live infrastructure was accessed or modified. Fresh CI validation is pending.

## 2026-11-28 — Protect Redis rate-limit counters from eviction

- Changed the Redis max-memory policy from `allkeys-lru` to `noeviction` so memory pressure cannot silently evict active rate-limit counters and weaken shared abuse controls.
- If Redis reaches its memory limit and rejects writes, the throttler fails closed with HTTP 503 rather than bypassing limits.
- Monitor Redis memory/evictions and alert before the configured 2 GB limit is reached.

## 2026-11-28 — Keep Redis password out of Compose command expansion

- Redis server startup now reads its password from the container environment at runtime using shell command substitution, avoiding host-side Compose interpolation of the secret into the command definition.
- Redis health check uses the same environment-only approach via `REDISCLI_AUTH`.
- This is a configuration hardening change only; no live Redis service or password was accessed.

## 2026-11-28 — Redis infrastructure healthcheck correction

- Corrected Redis Compose healthcheck to pass the container's password through `REDISCLI_AUTH` using shell command substitution that avoids Compose interpolation, rather than expanding the secret in the host Compose parser.
- This ensures the API's new `depends_on: redis: service_healthy` gate can observe the authenticated Redis health check without putting the password in the redis-cli argument list.
- No Redis credential or running infrastructure was accessed or changed.

## 2026-11-28 — Shared Redis rate limiting implementation

- Added a Redis-backed Nest throttler storage adapter using an atomic Lua script for shared counters and block windows across API instances.
- API rate-limited requests fail closed with HTTP 503 when Redis is unavailable; there is no silent in-memory fallback. The Redis client is lifecycle-managed and disconnects on Nest shutdown.
- Added required `REDIS_URL` to the API environment example and made the API workload wait for the infrastructure Redis health check.
- Added unit tests for atomic Redis arguments, lazy connection, missing configuration and Redis outage behavior, plus an integration test with two independent storage clients against a real Redis service.
- Updated Node CI job to provision Redis 7.4 for that integration test. Fresh CI validation is pending; this is not yet marked as a CI-verified release control.
- No Redis production credentials or live infrastructure were accessed or changed.

## 2026-11-28 — CI #184 passed and release status reconciled

- CI run [#46107552896](https://github.com/seokillseo-byte/index/actions/runs/46107552896) passed on `1a9be1d87fa541866777475f28d0a6c3fe682bb4`; database, crawler and Node jobs all succeeded.
- Validation includes ordered migrations and tenant/auth/MFA replay regressions, Go race tests/vet, Node typecheck/build/Jest, worker syntax checks, backup/restore shell checks and real age cryptographic tests with ephemeral identities.
- Updated project status and implementation checklist. The CI result does not replace a live PostgreSQL restore drill, benchmark on dedicated hardware, provider-account E2E, or production monitoring/security validation.
- PR #6 remains open/unmerged; branch is 186 commits ahead and one behind main, and GitHub reports mergeable=false. No merge/rebase/deployment was performed.
- No new product features or unrelated scope were added.

## 2026-11-28 — Enforce private age identity file permissions

- Restore now checks the age identity file's Unix mode and refuses files accessible to group/other users.
- Added regression coverage for mode 0644 rejection; documented owner-only mode such as 0600.
- CI #182 passed on `af20d15714fb4865ba2e64d5b43aed7d7029d3c1`.
- CI #183 passed on `e956c903a2a1d1522e5dc716b2ac03437604160f`, including real age crypto round-trip, wrong-key rejection, identity permission guard, Node tests/build, crawler race/vet and database regressions.

## 2026-11-28 — Real age cryptographic CI validation

- CI #180 passed on `fa2b63ef0010f35b84138693591a0387d618974c`.
- CI installs the age CLI, generates ephemeral test identities, runs the backup script through authenticated encryption, restores through real age decryption, and confirms an unrelated identity cannot decrypt the artifact.
- PostgreSQL utilities remain mocked in this test; no live PostgreSQL backup/restore or off-site copy was performed.

## 2026-11-28 — Security documentation checkpoint validation

- CI #179 passed on `1d080708da8b952bdfa3881009f48cf2638b0b4a`; Node, crawler and database jobs all succeeded.
- Extended backup/restore CI coverage to install age and exercise real key generation, authenticated encryption/decryption, and rejection of an unrelated private identity, in addition to mocked database tools.
- The real age interoperability test is pending CI validation on the next commit; this still does not constitute a PostgreSQL recovery drill.

## 2026-11-28 — Encrypted backup test correction and CI validation

- CI #177 exposed a false-positive tamper test fixture: the copied checksum still referenced the original filename, so the test did not exercise checksum mismatch on the tampered artifact.
- Corrected the fixture to bind the original digest to the tampered artifact's filename, ensuring checksum verification rejects modified ciphertext before restore.
- CI #178 passed on `025020b3b90fe40d32507be779ce4e02bd6343f3`; Node build/tests, crawler race/vet, database migrations/regressions and encrypted backup/restore mock tests all passed.
- CI #175 passed on `cf35d791fdaef5bbb165b67d18ab9d4fb780ddb3`; CI #176 passed on `0feeff260d95f997842bdf477326401752533423`.
- Mock tests do not replace an actual age cryptographic interoperability check or non-production PostgreSQL restore drill.

## 2026-11-28 — Backup/restore mock regression tests

- Added CI-executed mocked tests for age-encrypted backup creation, private temporary plaintext cleanup, restrictive artifact permissions, guarded non-production restore and tampered artifact rejection.
- Mocks avoid requiring a live PostgreSQL instance or age key in CI; they do not replace a real cryptographic/database restore drill.

## 2026-11-28 — Encrypt PostgreSQL backup artifacts

- Changed the backup workflow to create plaintext dumps only in a private temporary directory, validate the archive, encrypt with age, and persist only the encrypted artifact plus checksum/manifest.
- Restore now requires an external age identity file, verifies the encrypted checksum, decrypts into a private temporary directory and validates the archive before restoring.
- Updated the drill runbook and security review. No private key or secret was added to the repository. Off-site replication, key escrow and an actual restore drill remain outstanding.
- CI shell syntax validation is required for this checkpoint; no live database backup/restore was executed.

## 2026-11-28 — Preliminary security and observability release reviews

- Added a source/configuration security review documenting current controls, prioritized release findings and required remediation. It is explicitly not a penetration test or production sign-off.
- Recorded gaps: API throttling is process-local, Redpanda has no configured TLS/auth/ACL, backup artifacts are not encrypted/off-host, database transport TLS is not configured in the example, and independent security review remains outstanding.
- Added observability gap assessment covering API/auth, PostgreSQL, Kafka, outbox/crawler, provider worker, backups and host signals; no metrics backend or alert rules were found in the repository tree.
- CI #174 passed on `8e6285f020e94c2b2fb122e5805426c279b8328d` before these documentation-only changes. New docs checkpoint requires its own CI run.
- No secrets, infrastructure, production data, or external accounts were changed or accessed.

## 2026-11-28 — Backup tooling CI validation and failure cleanup

- CI run #46105828409 passed on `441df56070b520d65bdf7447b4e1e8260532fe23`; includes Bash syntax checks for backup and restore scripts, Node build/tests, Go race/vet and DB migrations/regressions.
- Hardened backup failure handling to remove partial artifacts unless the full archive/checksum/manifest validation succeeds.
- Added non-interactive PostgreSQL client flags to avoid hanging for password prompts; credentials must be supplied securely through approved environment/pgpass configuration.
- CI run #46105880673 passed on `c6171e948ba7e9d3487a4eb523c93535a487a330` across Node build/tests, Go race/vet, Bash syntax and database checks.
- The scripts are CI syntax-validated only; no real database backup or restore drill has been executed.

## 2026-11-28 — Backup/restore tooling and benchmark protocols

- Added PostgreSQL custom-format backup with restrictive permissions, archive listing validation, SHA-256 checksum and manifest.
- Added explicitly guarded non-production restore. It verifies checksum/archive and avoids destructive `--clean`/`--create` behavior.
- Added backup/restore drill runbook with post-restore schema, role, tenant-RLS, auth regression and app-connectivity checks. Actual restore remains unexecuted.
- Documented controlled sustained-load/backpressure and worker failure/recovery protocols; no benchmark is claimed as executed.
- Added CI shell syntax checks for operational scripts.

## 2026-11-28 — Provider quota decision tests

- Extracted the Google worker quota decision into a small side-effect-free helper and added Node tests for daily and rolling-minute limits, same-day retry prevention, and next-day eligibility.
- Added the worker package test script so recursive CI executes the new tests alongside API Jest tests.
- CI run #46103822023 passed on `f0b8ac2c8b837553a765e10ac1456ef52c3a7636`; Node typecheck/build/tests/worker syntax, Go race/vet and database migrations/security regressions all passed.

## 2026-11-28 — Verified property URL-prefix boundary

- Tightened URL-prefix property matching so `/blog` authorizes `/blog` and `/blog/...`, but not sibling paths such as `/blogger/...`.
- Added Jest regression tests for exact URL-prefix paths, child paths, sibling-prefix rejection, cross-origin rejection, and Search Console domain-property subdomains.
- CI run #46103551185 passed on `23808e3dc06c98bcb9c9538c856acb41521b7a55`; Node typecheck/build/Jest, provider-worker syntax, Go race/vet and database regression checks passed.
- This closes the identified URL-prefix matching issue; it does not replace the full security review release gate.

## 2026-11-28 — Google worker quota reservation hardening

- Added a PostgreSQL-serialized rolling 60-second Google URL Inspection attempt counter shared by all provider-worker instances for the same tenant/property.
- Added a worker-side daily attempt counter so execution limits are enforced independently of queue-admission pacing and per-process sleeps.
- Quota-deferred jobs are rescheduled to the next minute boundary or next UTC daily window without consuming an attempt.
- CI run #46103336063 passed on `b12727cc29bd4b1800b189ef33423cdc7f9f88bd` across Node install/typecheck/build/Jest/worker syntax, Go race tests/vet, ordered migrations and database security regression tests.
- No external provider calls or production benchmark were performed; real provider E2E remains outstanding.

## 2026-11-28 — Latest CI and release-status reconciliation

- Verified CI run #46102607623 on `0c50dc59380dabb99d597af5feabc17b641c8951`: Node install/typecheck/build/Jest and provider-worker/benchmark syntax checks, Go race tests/vet, ordered migrations, tenant RLS, MFA lockout, auth-token replay and MFA recovery-code replay all passed.
- Verified preceding CI run #46102488732 also passed.
- Updated project status and implementation checklist to reflect the latest passing validation; benchmark execution, provider-account E2E, backup/restore and review gates remain outstanding.
- No production benchmark, secret change, merge, deployment or destructive operation was performed.

## 2026-11-28 — Integration documentation consistency

- Removed stale API documentation statements claiming Google/Bing integrations and provider jobs were not yet connected, and clarified that real non-production provider-account E2E validation remains outstanding.
- Clarified that provider operations remain restricted to URLs covered by the project's bound verified property and that acknowledgements are not indexing proof.

## 2026-11-28 — Benchmark measurement coverage

- Extended the non-production provider queue benchmark output with queue-latency p50/p95/p99, PostgreSQL statistics counter deltas, and visible/benchmark connection counts.
- Clarified that host CPU and disk IO must still be collected from the non-production database host; database counters alone are not host utilization metrics.
- CI run #46102361891 passed on commit `67f8447801b8837550fcdba607f09932be82eb29` across Node typecheck/build/Jest/worker syntax checks, Go race tests/vet, and database migration/RLS/auth regression checks.
- No benchmark was executed and no throughput claim was added.

## 2026-11-28 — CI activation and validation

- Added push-triggered CI for `feature/provider-job-engine`, ensuring branch commits run the same validation jobs rather than relying solely on pull-request events.
- CI run #46101301044 passed on `af3fc9c8b9f2375dd945266ac0ce86d1975f2d9b`: Node install/typecheck/build/Jest/worker syntax checks, Go crawler tests with race detector and vet, ordered database migrations, tenant RLS, MFA lockout, auth-token replay, and MFA recovery-code replay.
- Documentation/status checkpoint commit `ac3bb0968ce1bc097337cdf2f9b22241e3fce057` also passed CI run #46101487019 across all three jobs.
- No benchmark execution, production credential use, production deployment, main merge, or destructive operation was performed.

## 2026-11-28 — Authentication challenge hardening

- Added a persistent failed-attempt counter to auth tokens and invalidate MFA login challenges after five invalid TOTP or recovery-code attempts.
- Password-reset success responses no longer disclose the internal user ID.
- Added migration `0019_mfa_challenge_attempt_limits.sql`.
- Added CI database coverage for MFA lockout, consumed authentication-token replay, and single-use MFA recovery-code replay.
- Added API Jest/ts-jest infrastructure and service-level MFA challenge lockout/token-hashing coverage.
- Added application-level tenant/session isolation tests for JWT session binding, tenant switching and session ownership.
- Hardened MFA disable and serialized MFA enrollment/active challenge issuance with transactional row locking.
- Documented Git-based release/VPS deployment, configuration separation and rollback boundaries.

## 2026-11-28 — Provider Job Engine and benchmark harness

- Added provider-job attempt tracking and indexes, runtime RLS/quota regression coverage, and the isolated provider worker.
- Added a bounded non-production PostgreSQL queue benchmark harness and runbook. It measures only database queue-path throughput, not Google/Bing submission throughput.
- Google URL Inspection remains bounded by configured per-site daily/minute limits; Bing remains bounded by live provider quota.
- Provider acceptance and inspection evidence are not presented as proof of indexing.

