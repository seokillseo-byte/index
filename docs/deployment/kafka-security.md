# Kafka / Redpanda transport security runbook

Updated: 2026-11-28

## Scope and status

This runbook covers the existing `url.ingestion` and `provider.jobs` topics and their existing producer/consumer services. It does not add product features.

**Status: client support and configuration templates are implemented; broker activation and ACL provisioning remain a release gate.** The Compose broker still pins Redpanda `v24.3.7` and uses a plaintext listener; that release line is end-of-support. Current Redpanda documentation lists `v26.3` as the latest release line (released November 2026), with `v26.3.1` published November 20, 2026. The example template now targets `v26.3.1`, but the Compose image is deliberately NOT upgraded: this repository uses a persistent data volume, and a broker data-format upgrade must be rehearsed with a backup and the supported upgrade path before changing the image tag. Do not use the current Compose broker for production.

The example broker configuration is `infra/redpanda/redpanda.yaml.example`, targeting the v26.3 configuration model. It enables SASL on the Kafka listener, Kafka ACL authorization, Kafka TLS, and a loopback-only TLS Admin API. `infra/redpanda/.bootstrap.yaml.example` protects the Admin API before first startup of a new cluster. These templates are not mounted by the current Compose stack and are not yet validated against a live broker; do not treat them as an active security boundary until compatibility and non-production integration tests pass.

## Required certificate material

Provision these files through the approved certificate/key-management process, outside Git:

- Broker certificate and private key. The certificate SAN must include `redpanda`, the advertised broker hostname used by the containers.
- Private CA certificate used to verify broker and Admin API certificates.
- Admin API certificate/key pair for the loopback Admin listener; its SAN must cover `localhost` (and the chosen loopback address if IP verification is used).
- Keep broker and Admin API private keys readable only by the Redpanda service account.
- Mount the CA certificate read-only into crawler, outbox relay and provider worker at `/run/secrets/kafka/ca.crt`.
- Do not mount the broker private key into application containers.
- Rotate certificates before expiry and test rotation in non-production.

The example config enables TLS on the Kafka listener and the loopback Admin API; Redpanda's documented minimum TLS version is 1.2. SASL/SCRAM does not replace TLS: both are required. The Admin API is deliberately bound to `127.0.0.1` and must not be published to the Docker host or a public interface. Kafka SASL does not secure the Admin API.

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

The current `redpanda-init` Compose job uses an unauthenticated Kafka connection and will NOT work unchanged after SASL/ACL enforcement is enabled. In a secured non-production deployment, create the existing topics through an authenticated administrative `rpk` session, or replace that init step with an authenticated, secret-injected provisioning job before enabling the protected workloads.

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

The bootstrap/admin identity may create the two existing topics. Application principals must not receive cluster-wide superuser access, topic-create permission, wildcard topic ACLs or access to the other consumer group. Because the current Compose init job is unauthenticated, it must not be used in the secured configuration.

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

CI now includes Node tests for the shared Kafka config and Go tests for the crawler dialer configuration. These test configuration construction and fail-closed validation; they do not start Redpanda, verify SCRAM handshakes, validate broker certificates, or prove ACL enforcement. A real non-production Redpanda integration test remains required.

## References

- Redpanda supported versions and release lifecycle: https://docs.redpanda.com/streaming/current/
- Redpanda v26.2 production deployment and first-start Admin API bootstrap: https://docs.redpanda.com/streaming/26.2/deploy/redpanda/manual/production/production-deployment/
- Redpanda authentication and SCRAM user creation: https://docs.redpanda.com/streaming/current/manage/security/authentication/
- Redpanda Kafka TLS: https://docs.redpanda.com/streaming/current/manage/security/encryption/
- Redpanda ACLs: https://docs.redpanda.com/streaming/current/manage/security/authorization/acl/
- Redpanda production security checklist: https://docs.redpanda.com/streaming/current/deploy/redpanda/manual/production/production-readiness/
- Redpanda `rpk security acl create`: https://docs.redpanda.com/streaming/current/reference/rpk/rpk-security/rpk-security-acl-create/
- KafkaJS TLS/SASL: https://kafka.js.org/docs/configuration
- kafka-go TLS/SASL transport: https://pkg.go.dev/github.com/segmentio/kafka-go
