# Kafka / Redpanda transport security runbook

Updated: 2026-11-28

## Scope and status

This runbook covers the existing `url.ingestion` and `provider.jobs` topics and their existing producer/consumer services. It does not add product features.

**Status: client support and configuration templates are implemented; broker activation and ACL provisioning remain a release gate.** The Compose broker still pins Redpanda `v24.3.7` and uses a plaintext listener; that release line is end-of-support. Current Redpanda documentation lists `v26.3` as the latest release line (released November 2026), with `v26.3.1` published November 20, 2026. The example template now targets `v26.3.1`, but the Compose image is deliberately NOT upgraded: this repository uses a persistent data volume, and a broker data-format upgrade must be rehearsed with a backup and the supported upgrade path before changing the image tag. Do not use the current Compose broker for production.

The example broker configuration is infra/redpanda/redpanda.yaml.example, targeting the v26.3 configuration model. It explicitly enables `redpanda.enable_sasl: true` (required to activate SASL), configures the Kafka listener for SASL, enables Kafka ACL authorization and Kafka TLS, and keeps the Admin API loopback-only with TLS. The secure-config CI test asserts these security-critical settings rather than checking YAML syntax alone. infra/redpanda/.bootstrap.yaml.example protects the Admin API before first startup of a new cluster. A separate non-production overlay, infra/docker/compose.redpanda.secure.yml, mounts these templates and provisions the existing topics over authenticated TLS/SCRAM. The overlay is repository code only; it has not been run against a live broker and is not production-approved.

## Required certificate material

Provision these files through the approved certificate/key-management process, outside Git:

- Broker certificate and private key. The certificate SAN must include `redpanda`, the advertised broker hostname used by the containers.
- Private CA certificate used to verify broker and Admin API certificates.
- Admin API certificate/key pair for the loopback Admin listener; its SAN must cover localhost.
- Keep broker and Admin API private keys readable only by the Redpanda service account.
- Mount the CA certificate read-only into crawler, outbox relay and provider worker at `/run/secrets/kafka/ca.crt`.
- Do not mount the broker private key into application containers.
- Rotate certificates before expiry and test rotation in non-production.

The example config enables TLS on the Kafka listener and the loopback Admin API. SASL/SCRAM does not replace TLS: both are required. The Admin API is deliberately bound to 127.0.0.1; the secure Compose overlay's one-shot provisioning container shares the broker network namespace so it can reach that loopback listener without publishing port 9644. Kafka SASL does not secure the Admin API.

## Application client configuration

The Node outbox relay and provider worker share `apps/worker/src/kafka-config.mjs`. The Go crawler uses `services/crawler/cmd/crawler/kafka_security.go`.

Set the following in each protected service environment file:

```dotenv
KAFKA_BROKERS=redpanda:9092
KAFKA_TLS_CA_FILE=/run/secrets/kafka/ca.crt
KAFKA_SASL_MECHANISM=scram-sha-512
KAFKA_SASL_USERNAME=<service-specific-user>
KAFKA_SASL_PASSWORD=<service-specific-secret>
```

Use separate principals and passwords for the outbox relay, crawler and provider worker. Do not share a superuser identity with application workloads. Never commit populated environment files, passwords, broker keys or private CA keys.

The production Compose workloads set `NODE_ENV=production`. Both Node and Go clients reject a production configuration without TLS and SCRAM-SHA-512. Partial SCRAM settings and missing/invalid CA files fail startup. TLS certificate verification remains enabled; do not set `rejectUnauthorized: false` or use an insecure TLS skip-verify option.

## Broker bootstrap and ACL plan

### Protect the Admin API before first start

Kafka API SASL does not secure the Redpanda Admin API. By default, any client that can reach an unauthenticated Admin API has cluster-superuser access. For a NEW cluster only:

1. Review `infra/redpanda/redpanda.yaml.example` against the exact broker release. Keep the Admin API bound to loopback; do not publish port 9644.
2. Copy `infra/redpanda/.bootstrap.yaml.example` to `/etc/redpanda/.bootstrap.yaml` before the very first broker startup. This bootstrap file is read only on initial cluster creation and later edits are ignored.
3. Inject `RP_BOOTSTRAP_USER=index-assist-admin:<one-time-secret>:SCRAM-SHA-512` through an approved one-time secret injection mechanism when starting the new broker. The username must match the `superusers` entry in `.bootstrap.yaml`. Never put the actual password in Git, shell history, Compose YAML, or a persistent `.env` file.
4. After the first startup, remove `RP_BOOTSTRAP_USER` from the broker environment and remove any temporary bootstrap secret file. Keep the administrator credential only in the approved secret manager. The broker bootstrap account must be verified with an authenticated `rpk` command.
5. For an EXISTING cluster, do not expect `.bootstrap.yaml` to apply. Use the already authenticated Admin API to set and verify `admin_api_require_auth`, `superusers`, Kafka authentication and ACL settings; plan the change so at least one working superuser remains.

The example keeps the Admin API loopback-only and enables TLS. If remote administration is ever required, use a private management network, TLS, Admin API authentication and firewall allowlisting; never expose port 9644 publicly.

### Provision Kafka principals and ACLs

Create the initial SCRAM superuser before enabling authorization to avoid locking out administration. Use `rpk security user create` with `--mechanism SCRAM-SHA-512`, then create each application principal and its topic/group ACLs using `rpk security acl create`. The superuser is for provisioning only, never application traffic.

The base development Compose profile still uses a plaintext v24.3.7 broker. Its topic-init job has been changed to run in the broker network namespace and call the shared provisioning script. When the secure overlay is applied, that same job is overridden to use TLS, SCRAM-SHA-512 and the bootstrap administrator credentials read from a protected secret file. It creates only the two existing topics (url.ingestion and provider.jobs), and is repeat-safe if they already exist.

### Isolated non-production secure Compose rehearsal

The secure overlay creates a separate named volume, redpanda_data_secure; it does NOT attach, migrate, or modify the legacy redpanda_data volume. This lets the team validate a clean v26.3.1 secured cluster without risking the existing v24.3.7 data. It is not a rehearsal of the data-format upgrade itself. For that, clone the old volume to disposable storage and follow Redpanda's supported upgrade path with a verified backup and rollback plan.

1. Create the following files outside Git (the repository ignores the entire secrets/ directory):
   - secrets/kafka/ca.crt
   - secrets/redpanda/broker.crt and broker.key (broker certificate SAN: redpanda)
   - secrets/redpanda/admin.crt and admin.key (Admin API certificate SAN: localhost)
   - secrets/redpanda/admin-password (at least 32 characters, no colon; owner-readable only, e.g. mode 0600)
   - secrets/kafka/outbox-scram-password, crawler-scram-password and provider-scram-password (each a unique random password of at least 32 characters; owner-readable only)
2. Copy .env.redpanda.secure.example to .env.redpanda.secure. Keep REDPANDA_ADMIN_USER=index-assist-admin aligned with the superuser in .bootstrap.yaml.example.
3. For a NEW empty cluster only, leave REDPANDA_BOOTSTRAP_ONCE=1 and start only the broker:
   ~~~bash
   docker compose --env-file .env --env-file .env.redpanda.secure \
     -f infra/docker/compose.infrastructure.yml \
     -f infra/docker/compose.redpanda.secure.yml up -d redpanda
   ~~~
   The broker wrapper reads the bootstrap password from the mounted secret file and exports RP_BOOTSTRAP_USER only for this first startup. The bootstrap file is read only on first cluster creation.
4. After the authenticated Admin API health check succeeds, set REDPANDA_BOOTSTRAP_ONCE=0 and recreate the broker with the same Compose files. This removes the one-time bootstrap environment from subsequent broker processes while preserving the new secure volume. Do not skip this step.
5. Start the complete stack with all three Compose files:
   ~~~bash
   docker compose --env-file .env --env-file .env.redpanda.secure \
     -f infra/docker/compose.infrastructure.yml \
     -f infra/docker/compose.redpanda.secure.yml \
     -f infra/docker/compose.workloads.yml up -d
   ~~~
   The one-shot redpanda-init service waits for broker health, authenticates over TLS/SCRAM, creates the existing topics, provisions the three service SCRAM principals and applies their least-privilege ACLs. Workloads depend on successful completion of this job.
6. Do not point this overlay at the existing v24.3.7 volume. For upgrade testing, make a separate cold copy/snapshot and test the exact supported upgrade sequence on disposable infrastructure first.

The overlay requires the broker/admin certificate and password files to exist before Compose starts. It keeps the Kafka port published only on host loopback and does not publish Admin API port 9644.

### Secret file ownership and container readability

The Redpanda v26.3.1 image runs as the unprivileged `redpanda` user, not root. Local file-backed Compose secrets are mounted from host files; a restrictive mode such as `0400` is useful only when the mounted file is owned by the UID that must read it. Do not assume that setting `mode: 0400` in the Compose secret declaration changes host-file ownership.

After pulling the exact pinned image, obtain its runtime UID/GID rather than hard-coding an assumed numeric ID:

```bash
RP_UID="$(docker run --rm --entrypoint id redpandadata/redpanda:v26.3.1 -u)"
RP_GID="$(docker run --rm --entrypoint id redpandadata/redpanda:v26.3.1 -g)"
printf 'Redpanda container UID:GID = %s:%s\\n' "$RP_UID" "$RP_GID"
```

The broker must read its CA, broker certificate/key, Admin certificate/key and bootstrap password. The one-shot provisioner runs from the same Redpanda image and must also read the three service password files. Set owner and restrictive permissions on the private files:

```bash
sudo chown "$RP_UID:$RP_GID" \
  secrets/redpanda/broker.key secrets/redpanda/admin.key \
  secrets/redpanda/admin-password \
  secrets/kafka/outbox-scram-password \
  secrets/kafka/crawler-scram-password \
  secrets/kafka/provider-scram-password
sudo chmod 0400 \
  secrets/redpanda/broker.key secrets/redpanda/admin.key \
  secrets/redpanda/admin-password \
  secrets/kafka/outbox-scram-password \
  secrets/kafka/crawler-scram-password \
  secrets/kafka/provider-scram-password
sudo chmod 0444 secrets/kafka/ca.crt \
  secrets/redpanda/broker.crt secrets/redpanda/admin.crt
```

The secure broker startup and provisioning scripts now fail early when their required files are unreadable. The CI mock also verifies that an unreadable CA is rejected. Confirm readability inside the exact image/container before starting the broker; do not solve permission errors by making private keys or passwords world-readable. The admin password is mounted as a Docker secret; the provisioner reads it into the rpk process environment rather than placing it in command-line arguments. Service password files are also mounted only into the one-shot provisioner; rpk's user-create command accepts the target password as an argument, so that value is briefly visible in the provisioner container's process arguments and must never be logged or run in a shared admin container.

Create dedicated SCRAM-SHA-512 principals:

- `index-assist-outbox`
- `index-assist-crawler`
- `index-assist-provider`

Grant only the following Kafka ACLs:

| Principal | Resource | Operations |
|---|---|---|
| `index-assist-outbox` | topic `url.ingestion` | Write, Describe |
| `index-assist-outbox` | topic `provider.jobs` | Write, Describe |
| `index-assist-outbox` | cluster | IdempotentWrite (required by the idempotent producer) |
| `index-assist-crawler` | topic `url.ingestion` | Read, Describe |
| `index-assist-crawler` | group `index-assist-crawler-v1` | Read |
| `index-assist-provider` | topic `provider.jobs` | Read, Describe |
| `index-assist-provider` | group `index-assist-provider-v1` | Read |

The bootstrap/admin identity creates the two existing topics, provisions the three application SCRAM users and applies the following least-privilege ACLs through the one-shot secure provisioner. Application principals must not receive cluster-wide superuser access, topic-create permission, wildcard topic ACLs or access to the other consumer group. Use unique random passwords from protected secret files; do not reuse the bootstrap administrator password.

The secure overlay's one-shot provisioner runs infra/redpanda/provision-secure-cluster.sh after the bootstrap superuser is healthy. It reads the three service passwords from Docker secret files, creates missing SCRAM users, creates missing ACLs, and ensures the two existing topics. Existing users are deliberately not recreated or silently password-rotated; if a user already exists, the provisioner retains its current credential. To rotate one, use the authenticated rpk user-update workflow, then update the matching secret file and workload environment file together.

The script grants exactly the ACL matrix above. It is repeat-safe for already-created users, ACLs and topics, and CI exercises that behavior with a mock rpk CLI. rpk's user-create CLI accepts the service password as a command argument; it is used only inside the short-lived provisioner container. Restrict access to that container, avoid enabling shell tracing, and ensure process/audit collection does not capture command arguments.


## Non-production verification gates

1. Validate the broker certificate chain and hostname from all three application containers.
2. Confirm each application authenticates with its own SCRAM principal over TLS.
3. Confirm the outbox relay can publish to both existing topics.
4. Confirm crawler can consume `url.ingestion` but is denied access to `provider.jobs`.
5. Confirm provider worker can consume `provider.jobs` but is denied access to `url.ingestion`.
6. Confirm crawler/provider principals cannot publish, create topics, or read the other consumer group.
7. Confirm a wrong password and an untrusted CA both fail connection.
8. Confirm no password, OAuth token, certificate private key or full connection string appears in logs.
9. Restart each service and verify it reconnects without losing committed/acknowledged work.
10. Record the broker version, certificate fingerprints, ACL export, test results and rollback plan.

Do not roll out to production until the positive and negative ACL tests pass. If ACL enforcement is enabled before all principals and topic/group permissions are ready, the consumers and relay will fail closed and queues will accumulate.

## Existing CI coverage and limitations

CI #340 passed Compose/Redpanda YAML syntax, merged Compose config, shell syntax and mock rpk tests for repeat-safe topic creation, three SCRAM principals, least-privilege ACLs and fail-closed TLS/SCRAM settings: https://github.com/seokillseo-byte/index/actions/runs/46119413495. CI #341 passed the current documentation checkpoint: https://github.com/seokillseo-byte/index/actions/runs/46119449767. Node tests cover the shared Kafka config and Go tests cover crawler dialer configuration. CI does not start Redpanda, verify SCRAM handshakes, validate broker certificates, or prove ACL enforcement. A real non-production Redpanda integration test remains required.

## References

- Redpanda supported versions and release lifecycle: https://docs.redpanda.com/streaming/current/
- Redpanda production deployment and first-start Admin API bootstrap: https://docs.redpanda.com/streaming/current/deploy/redpanda/manual/production/production-deployment/
- Redpanda rpk environment variables: https://docs.redpanda.com/streaming/current/reference/environment-variables/
- Redpanda v26.3 upgrade guide: https://docs.redpanda.com/streaming/current/upgrade/
- Redpanda authentication and SCRAM user creation: https://docs.redpanda.com/streaming/current/manage/security/authentication/
- Redpanda Kafka TLS: https://docs.redpanda.com/streaming/current/manage/security/encryption/
- Redpanda ACLs: https://docs.redpanda.com/streaming/current/manage/security/authorization/acl/
- Redpanda production security checklist: https://docs.redpanda.com/streaming/current/deploy/redpanda/manual/production/production-readiness/
- Redpanda `rpk security acl create`: https://docs.redpanda.com/streaming/current/reference/rpk/rpk-security/rpk-security-acl-create/
- KafkaJS TLS/SASL: https://kafka.js.org/docs/configuration
- kafka-go TLS/SASL transport: https://pkg.go.dev/github.com/segmentio/kafka-go
