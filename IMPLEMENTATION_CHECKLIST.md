# Index Assist — Implementation Checklist

## Authentication hardening

- [x] Email verification tokens are single-use and expire after 30 minutes.
- [x] Registration sends verification email and does not issue sessions before verification.
- [x] Login and refresh require verified email.
- [x] Verification and resend endpoints are rate-limited.
- [x] TOTP MFA enrollment and login challenge.
- [x] Single-use MFA recovery codes hashed at rest.
- [x] Password recovery uses single-use 30-minute tokens and revokes existing sessions.
- [x] Server-side session listing and revocation endpoints.
- [x] MFA endpoint rate limits and DTO validation hardening.
- [x] MFA login challenge invalidated after five failed TOTP/recovery attempts.
- [x] MFA enrollment/disable and active challenge issuance serialized transactionally.
- [x] API service tests for MFA lockout and challenge-token hashing.
- [x] Database tests for auth-token replay, recovery-code replay, and tenant RLS.
- [x] Application tests for JWT session binding, tenant-switch rejection, and session ownership.
- [x] CI install/typecheck/build/Jest/worker syntax checks pass on commit `af3fc9c8b9f2375dd945266ac0ce86d1975f2d9b` (run #46101301044).
- [x] CI validation of the docs/status checkpoint passes on commit `ac3bb0968ce1bc097337cdf2f9b22241e3fce057` (run #46101487019).
- [x] CI run #46102488732 passes on `8ee786ce6fec4448db0f5755b602345aeaefb39e`.
- [x] CI run #46102607623 passes on `0c50dc59380dabb99d597af5feabc17b641c8951`, including Node/Jest, worker syntax, Go race/vet and database security regressions.
- [x] CI run #46103232631 passes on `aca15d51d989d782e76f4fa4a9d433dfa2f998ec`.
- [x] CI run #46103336063 passes on `b12727cc29bd4b1800b189ef33423cdc7f9f88bd` after shared Google per-minute worker quota hardening.
- [x] CI run #46103551185 passes on `23808e3dc06c98bcb9c9538c856acb41521b7a55`, including new verified-property URL-scope regression tests.
- [x] CI run #46103822023 passes on `f0b8ac2c8b837553a765e10ac1456ef52c3a7636`, including provider quota-decision unit tests.
- [x] CI run #46107552896 passes on `1a9be1d87fa541866777475f28d0a6c3fe682bb4`: database migration/RLS/auth regressions, crawler Go race/vet, Node typecheck/build/Jest, worker syntax and age-encrypted backup/restore tests.
- [x] CI #276 passed Redis two-client integration, API typecheck/build/Jest, worker tests, crawler Go race/vet and database regression suites.
- [x] CI #277 passed the Redis reconnect/recovery regression test plus Redis two-client integration, API typecheck/build/Jest, worker tests, crawler Go race/vet and database regressions: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46110358016).
- [x] Added Redis integration test with two independent storage clients to verify shared counters and blocked state; CI Node job now provisions Redis service.
- [x] Redis client is a Nest-managed provider and disconnects during application shutdown.
- [x] API readiness checks PostgreSQL and Redis; added controller tests for Redis-unavailable readiness.
- [x] Redis uses `noeviction`; rejected counter writes fail closed rather than evicting active throttle state.
- [x] Redis client retries transient reconnects with bounded backoff; rate-limited requests remain fail-closed until ready.
- [x] Added KafkaJS TLS/SCRAM-SHA-512 config for outbox relay/provider worker and kafka-go TLS/SCRAM-SHA-512 config for crawler.
- [x] Production worker/crawler startup rejects plaintext Kafka configuration; added Node/Go config tests, CA-file mounts and env examples.
- [x] Added Redpanda TLS/SASL example, loopback-only TLS Admin API template, first-start `.bootstrap.yaml` example and Kafka security/ACL rollout runbook.
- [x] Add a Redpanda v26.3.1 TLS/SASL/ACL broker template, loopback-only TLS Admin API and first-start Admin API bootstrap example; reviewed against current Redpanda security docs.
- [x] Add an isolated secure Compose overlay with a new `redpanda_data_secure` volume; it does not mount or modify the legacy EOL broker volume.
- [x] Move `redpanda-init` into the broker network namespace and add repeat-safe topic provisioning for existing topics.
- [x] Add secure one-shot provisioning for three service SCRAM principals and least-privilege topic/group/idempotent-write ACLs; passwords are read from Docker secret files.
- [x] Add mock tests for topic provisioning, TLS/SCRAM fail-closed guards, SCRAM user/ACL repeat-safety and secure Compose merge.
- [x] Explicitly enable `redpanda.enable_sasl: true` in the v26.3.1 broker template; strengthen the secure-config test to assert SASL activation, Kafka ACL authorization, Kafka TLS and loopback Admin API TLS/binding.
- [x] Add fail-fast readability checks for broker certificate/key, Admin bootstrap password, Kafka/Admin CA and service SCRAM password files; add an unreadable-CA regression test and document UID/GID alignment for the non-root Redpanda image.
- [x] CI #340 passed the secure overlay merge test, all Redpanda provisioning mocks, Node typecheck/build/Jest, Go race/vet and database security regressions: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46119413495).
- [x] CI #341 passed the current documentation checkpoint: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46119449767).
- [ ] Provision actual broker/Admin certificates and service password files; run the isolated secure overlay on non-production Redpanda and verify the Admin API/Kafka TLS/SCRAM handshakes.
- [ ] Verify positive/negative ACL operations, wrong-password/untrusted-CA rejection and workload restart/recovery on a live non-production broker.
- [ ] Rehearse the v24.3.7 persistent-volume upgrade on a disposable cold copy with a tested rollback plan; never change the active volume by merely changing the image tag.
- [x] CI #276 passed Redis and Kafka client changes; [workflow](https://github.com/seokillseo-byte/index/actions/runs/46110245705).
- [x] CI #277 passed the follow-up Redis reconnect regression test: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46110358016).
- [x] CI #286 passed on the full documentation checkpoint: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46110473131).
- [x] CI #306 passed multi-recipient age encryption/decryption using two independent identities, invalid/duplicate/empty recipient rejection, Bash safety tests, YAML syntax, Node typecheck/build/Jest, crawler Go race/vet and database regressions: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46111164620).
- [x] Fresh CI for secure Redpanda Compose overlay and mock provisioning scripts passed in CI #340; docs checkpoint passed in CI #341.

## Provider Job Engine

- [x] Tenant-scoped provider job model and idempotency.
- [x] Verified property binding and URL coverage checks, including URL-prefix path-segment boundary validation.
- [x] Google URL Inspection daily/minute quota reservation at API admission.
- [x] Google URL Inspection per-minute attempt reservation shared across worker instances.
- [x] Worker quota-decision unit tests cover daily cap, rolling-minute cap, same-day retry prevention and next-day eligibility.
- [x] Bing live DailyQuota/MonthlyQuota checks.
- [x] Restricted runtime DB role for provider worker.
- [x] Kafka `provider.jobs` consumer and isolated worker.
- [x] Provider result persistence and acceptance/indexing distinction.
- [x] Retry/backoff, dead-letter, lease recovery and batch draining.
- [x] Provider job history, attempt tracking and indexes.
- [x] Runtime RLS claim and provider quota SQL tests.
- [x] CI database migrations and regression tests pass on both validation checkpoints above.

## Capacity and production readiness

- [x] Bounded non-production PostgreSQL queue benchmark harness and runbook.
- [x] Benchmark reports queue-latency percentiles, PostgreSQL counter deltas and connection snapshots; host CPU/disk IO are measured separately at host level.
- [x] CI validates benchmark metric instrumentation and all existing checks on commit `67f8447801b8837550fcdba607f09932be82eb29` (run #46102361891).
- [ ] Execute benchmark on dedicated non-production database/hardware.
- [ ] Record queue latency, jobs/sec, DB CPU/IO, connections and saturation.
- [x] Document controlled sustained queue/backpressure benchmark protocol.
- [ ] Execute sustained queue/backpressure benchmark and record metrics.
- [x] Document non-production worker failure/recovery protocol.
- [ ] Execute worker failure/recovery tests and record evidence.
- [ ] Validate 1,000,000 URLs/day using measured end-to-end capacity.
- [ ] Google/Bing end-to-end test with non-production provider accounts.
- [x] Add guarded PostgreSQL custom-format backup and non-production restore scripts with checksum/archive validation.
- [x] Encrypt backup artifacts with age before final storage; restore decrypts only into a private temporary directory and requires an external identity file.
- [x] Remove partial backup artifacts on failure and prevent interactive password prompts in unattended operations.
- [x] CI validates Bash syntax and runs backup/restore safety tests, including temporary plaintext cleanup, restore guard and checksum tamper rejection (CI #178 passed).
- [x] CI installs age and verifies real ephemeral-key encryption/decryption plus wrong-identity rejection (CI #180 passed); PostgreSQL itself remains mocked.
- [x] Restore rejects age identity files with group/other permissions; regression test and full CI passed on commit `e956c903a2a1d1522e5dc716b2ac03437604160f` (run #46107414623).
- [x] Document post-restore validation and operational limitations.
- [x] Add multi-recipient age encryption support and document independent key custody/off-site replication/retention requirements; CI #306 passed the two-identity crypto round-trip.
- [ ] Configure protected age identity storage/key recovery and off-site encrypted backup replication in a separate account/failure domain.
- [ ] Define approved backup frequency, RPO/RTO, retention and deletion policy; enable object versioning/immutability where supported.
- [ ] Execute non-production restore drill using a copy retrieved from off-site storage and record evidence.
- [x] Perform preliminary static security/configuration review and document findings.
- [x] Implement shared Redis-backed API throttler with atomic counter/blocking and fail-closed 503 behavior; two-client integration and reconnect/recovery regression passed CI #276/#277/#286.
- [ ] Resolve remaining security release findings: live Kafka TLS/auth/ACL, off-host encrypted backup and key custody, database TLS for multi-host, observability alert delivery and independent security review.
- [x] Perform observability/alerting gap assessment and document required signals.
- [ ] Deploy metrics/logging/alerting, define thresholds/owners, and test alert delivery in non-production.
- [ ] Production VPS deployment and HTTPS/DNS validation after release approval.

## Scope boundary

Google URL Inspection is inspection evidence, not an indexing request. Bing submission acceptance is not proof of indexing. No throughput target is considered achieved without measured evidence.
