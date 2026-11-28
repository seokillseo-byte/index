# PostgreSQL encrypted backup and restore drill

These are manual, non-production tools. Backups are encrypted with [age](https://age-encryption.org/) before leaving a private temporary directory. The repository does not contain private age identities or backup credentials. The backup script supports multiple independent age recipients so separately held recovery identities can decrypt the same artifact. These scripts still do not provide scheduling, off-site replication, PITR, retention, monitoring or key escrow.

## Key preparation

Install the `age` CLI on the backup and restore hosts. Generate an age identity on a trusted key-management workstation:

```bash
age-keygen -o index-assist-backup-identity.txt
age-keygen -y index-assist-backup-identity.txt
```

The first command creates a private identity; protect it with owner-only permissions and store it separately from backups. The second prints its public recipient (the `age1...` value). Configure `BACKUP_AGE_RECIPIENTS` with a comma-separated list of at least two public recipients held by separate recovery custodians (for example, primary operations and independent disaster-recovery custody). The script also accepts the legacy single `BACKUP_AGE_RECIPIENT` variable when the plural variable is unset. The manifest records public recipients so operators can identify which recovery identities are needed. Each age recipient can independently decrypt the backup; this is multi-recipient recovery, NOT threshold cryptography or two-person approval. If dual control is required, enforce it in the secret manager/key-release process. Never place private identities in Git, the backup directory, a container image or the database VPS. Store them in an approved secret manager/offline recovery locations with controlled access and tested retrieval.

## Backup

```bash
BACKUP_DATABASE_URL='postgresql://...' \
BACKUP_OUTPUT_DIR='/secure/backups/index-assist' \
BACKUP_AGE_RECIPIENT='age1...' \
bash infra/postgres/backup.sh
```

Use a dedicated backup identity with `pg_dump` privileges and secure PostgreSQL password handling (for example, a protected `.pgpass`, not a URL committed to Git). The script uses umask 077, creates a private temporary directory for the plaintext custom-format dump, validates it with `pg_restore --list`, encrypts it using age, removes plaintext, and writes a SHA-256 checksum and manifest for the encrypted artifact. The encrypted dump, checksum and manifest are chmod 600. Keep all three together. The `.manifest` records the recipient count and public recipient strings. Copy all three artifacts to separate protected storage; do not assume encryption alone provides off-site recovery or key escrow.

## Off-site replication, retention and key recovery (operator setup required)

No off-site provider or retention policy is configured in this repository. The local MinIO service is on the same infrastructure host and is NOT an off-site backup. Before release, select an object-storage destination in a separate account and failure domain (preferably a separate region/provider), then:

1. Copy only `*.dump.age`, matching `*.dump.age.sha256`, and `*.manifest` files. Never replicate plaintext dumps, age identity files, database URLs or populated environment files.
2. Use a dedicated write-only backup identity for uploads and a separate read/restore identity for recovery. Deny public access; require TLS in transit; enable bucket versioning and object-lock/immutability where supported.
3. Verify every uploaded object by downloading it to an isolated restore host, checking `sha256sum -c`, and confirming age decryption plus `pg_restore --list`. A successful upload or object ETag is not a substitute for the repository SHA-256 verification.
4. Define and approve backup frequency/RPO, restore RTO, retention windows, legal holds, deletion authorization and lifecycle expiry before enabling automated deletion. Keep enough generations to cover the approved retention schedule; do not invent a retention period in code.
5. Store each private age identity separately from the backup destination, with independent custody and a documented emergency access process. Test recovery-key retrieval periodically. Losing every matching identity makes all copies unrecoverable; rotating recipients does not re-encrypt old backups.
6. Execute a restore drill using a copy fetched from off-site storage, not the local backup directory. Record object version, checksum, key custodian, restore duration, RPO/RTO achieved and post-restore SQL checks.

Age multi-recipient encryption means any one corresponding identity can decrypt. It does not implement a two-person cryptographic quorum. Protect key retrieval with the organization's access approval process.

## Restore drill — non-production only

1. Provision a new, empty, disposable non-production database. Never point this procedure at production.
2. Copy the encrypted `.dump.age` artifact and matching `.sha256` file to the restore host.
3. Make the corresponding private age identity available through a protected file with owner-only permissions (for example, `chmod 600`). The restore script rejects identity files accessible to group/other users.
4. Run:

```bash
RESTORE_DATABASE_URL='postgresql://...' \
RESTORE_DUMP_FILE='/secure/backups/index-assist/example.dump.age' \
RESTORE_AGE_IDENTITY_FILE='/secure/keys/index-assist-backup-identity.txt' \
RESTORE_CONFIRM_NONPROD=YES \
RESTORE_TARGET_EMPTY=YES \
bash infra/postgres/restore.sh
```

The script verifies the encrypted artifact checksum, decrypts into a private temporary directory, validates the PostgreSQL archive, then restores. It intentionally does not use `--clean` or `--create`; conflicts in a non-empty target fail rather than dropping objects. The confirmation variables are operator assertions, not automatic proof of environment or emptiness. Ensure the restore identity corresponds to the public recipient used at backup time.

## Post-restore checklist

- [ ] Record backup timestamp, source/target identifiers, operator, duration and result.
- [ ] Verify expected schemas, tables, indexes, constraints and extensions.
- [ ] Apply migrations newer than the backup using the migration owner.
- [ ] Recreate/verify least-privilege runtime and relay roles/grants; owner/ACL metadata is excluded from dumps.
- [ ] Run tenant RLS, MFA lockout, auth-token replay and MFA recovery-code replay SQL tests against the restored target.
- [ ] Verify tenant isolation using the runtime role.
- [ ] Verify API/provider worker connectivity in the isolated test environment.
- [ ] Record restore duration and represented data-loss window.
- [ ] Verify encrypted off-site copy availability and that the recovery identity can be retrieved by an authorized operator.

A successful `pg_restore` command alone is not a completed recovery drill. Before release, define backup frequency, retention, off-site copies, identity/key recovery, monitoring and PITR or an explicitly accepted recovery-point objective, then execute and record a restore drill.
