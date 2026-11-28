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


## Secure Redpanda validation checkpoint (2026-11-28)

- [x] CI #351 passed on `651aa595da71c1c70e6ed6bee31ac3ca25b5d6c1`: [workflow](https://github.com/seokillseo-byte/index/actions/runs/46167799041). Database, Node and crawler jobs all succeeded.
- [x] CI validates SASL activation, Kafka TLS/ACL and loopback Admin API TLS configuration, Compose merge/YAML, secret readability guards, shell syntax and secure provisioning mocks.
- [ ] Run a real v26.3.1 Redpanda broker in isolated non-production and verify TLS/SCRAM handshakes and positive/negative ACLs.
- [ ] Verify wrong-password/untrusted-CA rejection and workload restart/recovery on the live non-production broker.
- [ ] Rehearse old-volume migration using a disposable cold copy and a tested rollback plan.


## Redpanda Compose secret-expansion follow-up (2026-11-29)

- [x] Explicitly defer the Admin password command substitution in the one-shot provisioner to the container shell using Compose's escaped dollar syntax.
- [x] Add a mock regression assertion that the secure overlay retains the escaped command substitution.
- [ ] Await CI validation of branch head `98c9527242933868675a1e357e3d04003ba4238d`.
- [ ] Continue with isolated non-production broker TLS/SCRAM/ACL and restart/recovery tests; no live broker is available in this execution context.


## Secure Redpanda Compose topology checks (2026-11-29)

- [x] Added merged-Compose assertions for broker/provisioner image pin, provisioner network namespace, healthy-broker dependency, isolated secure data volume, and no Admin API port publication.
- [ ] CI validation for `11ae3cd1b9c8e2bf222475ee1602fc783061b139` — pending confirmation; the available run/status lookup returned no entries.
- [ ] Live non-production broker TLS/SCRAM, positive/negative ACL, invalid credential/CA and restart/recovery tests remain outstanding.
- [ ] Disposable cold-copy volume upgrade/rollback rehearsal remains outstanding.


## Secure Redpanda provisioner negative-path regression coverage (2026-11-29)

- [x] Add mock rejection cases for plaintext Kafka, disabled Admin API TLS, non-SCRAM mechanism, missing bootstrap Admin password, short service password and unreadable CA.
- [x] Ensure the short-password fixture exercises new-user creation rather than the existing-principal idempotency path.
- [x] Assert rejected configurations do not change mock topic, principal or ACL counts.
- [ ] CI execution/result for latest branch commit — pending confirmation.
- [ ] Live non-production TLS/SCRAM/ACL and restart/recovery validation — outstanding.


## Redpanda CA input validation follow-up (2026-11-29)

- [x] Add mock rejection cases for missing Kafka CA, missing Admin API CA and empty Admin API CA.
- [x] Keep invalid-input checks ahead of topic/user/ACL provisioning and retain the no-mutation assertions.
- [ ] Confirm CI execution on the updated branch head.
- [ ] Run live non-production broker TLS/SCRAM/ACL and restart/recovery validation.


## Empty Kafka CA regression (2026-11-29)

- [x] Add an empty Kafka CA rejection case to complement missing/unreadable Kafka CA and missing/empty Admin API CA cases.
- [x] Preserve final no-mutation assertions for topics, SCRAM users and ACLs after invalid configuration cases.
- [ ] Confirm CI execution on the latest branch commit.
- [ ] Validate real broker TLS/SCRAM/ACL and workload restart/recovery in non-production.


## Service SCRAM secret validation (2026-11-29)

- [x] Add missing service password-file rejection coverage on the new-user path.
- [x] Add empty service password-file rejection coverage on the new-user path.
- [x] Restore the existing-principal fixture after each negative case and retain no-mutation assertions.
- [ ] Confirm CI execution on the latest branch commit.
- [ ] Run live non-production broker TLS/SCRAM/ACL and recovery validation.


## All application SCRAM secret mappings (2026-11-29)

- [x] Verify missing and empty outbox password-file rejection.
- [x] Verify missing and empty crawler password-file rejection.
- [x] Verify missing and empty provider password-file rejection.
- [x] Preserve principal fixtures and final no-mutation assertions.
- [ ] Confirm CI execution on the latest branch commit.
- [ ] Validate real TLS/SCRAM/ACL behavior against a non-production broker.


## Secure Compose secret wiring (2026-11-29)

- [x] Assert outbox/crawler/provider SCRAM secret mounts and target paths.
- [x] Assert service secret declarations resolve to the expected host files.
- [x] Assert Kafka and Admin API CA environment paths match the mounted CA secret.
- [ ] Confirm the updated Compose mock test executes successfully in CI.
- [ ] Validate secret readability and authentication against a real non-production broker.


## Redpanda secret mount and permission coverage (2026-11-29)

- [x] Assert broker CA/certificate/private-key/bootstrap-password mounts and target paths.
- [x] Assert broker private keys and bootstrap password use mode `0400`; public CA/certificates use `0444`.
- [x] Assert all provisioner secret mounts, restrictive modes and host source-file mappings.
- [ ] Confirm the expanded merged-Compose test executes successfully in CI.
- [ ] Verify effective UID/GID and secret readability inside real non-production containers.


## Broker bootstrap and authenticated healthcheck regression coverage (2026-11-29)

- [x] Assert broker startup checks readability of CA, broker/admin certificates and private keys.
- [x] Assert bootstrap password minimum-length and colon guards are present.
- [x] Assert healthcheck uses the Admin SCRAM identity/password secret and Admin API TLS CA.
- [x] Normalize provisioner secret modes when YAML represents octal modes as integers.
- [ ] Confirm merged-Compose test passes in CI.
- [ ] Validate effective container UID/GID, TLS/SCRAM authentication and healthcheck against non-production Redpanda.


## Non-empty Redpanda certificate preflight (2026-11-29)

- [x] Require CA, broker/admin certificates and private keys to be readable and non-empty before broker startup.
- [x] Assert the merged secure Compose startup command includes both readability and non-empty checks.
- [ ] Confirm the updated test in CI and verify with real certificate files in non-production.
