# Kafka / Redpanda transport security runbook

Updated: 2026-11-28

## Scope and status

This runbook covers the existing `url.ingestion` and `provider.jobs` topics and their existing producer/consumer services. It does not add product features.

**Status: client support is implemented; broker activation and ACL provisioning remain a release gate.** The Compose broker is still configured with a plaintext listener. Do not treat this example as an active security boundary until the broker config, certificates, SCRAM users and ACLs have been installed and verified together.

The example broker configuration is `infra/redpanda/redpanda.yaml.example`, based on the Redpanda 24.3.x self-managed configuration model. Review compatibility against the exact pinned image before mounting it as `/etc/redpanda/redpanda.yaml`.

## Required certificate material

Provision these files through the approved certificate/key-management process, outside Git:

- Broker certificate and private key. The certificate SAN must include `redpanda`, the advertised broker hostname used by the containers.
- Private CA certificate used to verify the broker certificate.
- Keep the broker private key readable only by the Redpanda service account.
- Mount the CA certificate read-only into crawler, outbox relay and provider worker at `/run/secrets/kafka/ca.crt`.
- Do not mount the broker private key into application containers.
- Rotate certificates before expiry and test rotation in non-production.

The example config enables TLS 1.2+ (Redpanda's documented default minimum) with SASL authentication on the internal Kafka listener. SASL/SCRAM does not replace TLS: both are required.

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

Use an isolated administrative bootstrap session on the private Docker network. Create the initial SCRAM superuser before enabling authorization, then enable SASL and Kafka ACL enforcement, and use that superuser only for provisioning. Follow the Redpanda 24.3 documentation for the exact bootstrap order and CLI flags. Do not expose the Admin API or unauthenticated bootstrap listener outside the private network.

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

The bootstrap/admin identity may create the two existing topics. Application principals must not receive cluster-wide superuser access, topic-create permission, wildcard topic ACLs or access to the other consumer group.

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

- Redpanda authentication: https://docs.redpanda.com/streaming/24.3/manage/security/authentication/
- Redpanda Kafka TLS: https://docs.redpanda.com/streaming/24.3/manage/security/encryption/
- Redpanda ACLs: https://docs.redpanda.com/streaming/current/manage/security/authorization/acl/
- KafkaJS TLS/SASL: https://kafka.js.org/docs/configuration
- kafka-go TLS/SASL transport: https://pkg.go.dev/github.com/segmentio/kafka-go
