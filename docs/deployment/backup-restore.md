# PostgreSQL backup and restore drill

These are manual, non-production tools. They do not provide scheduled backups, off-site replication, PITR, encryption-at-rest, retention or monitoring.

## Backup

```bash
BACKUP_DATABASE_URL='postgresql://...' \
BACKUP_OUTPUT_DIR='/secure/backups/index-assist' \
bash infra/postgres/backup.sh
```

Use a dedicated backup identity with `pg_dump` privileges. Protect the output directory and copy artifacts to separate protected storage under the organization's backup policy. The script uses umask 077, custom-format `pg_dump`, excludes owner/ACL metadata, verifies the archive with `pg_restore --list`, and writes a SHA-256 file and manifest. Keep the dump, checksum and manifest together. Never commit backups or credentials.

## Restore drill — non-production only

1. Provision a new, empty, disposable non-production database. Never point this procedure at production.
2. Copy the dump and matching `.sha256` file to the restore host.
3. Run:

```bash
RESTORE_DATABASE_URL='postgresql://...' \
RESTORE_DUMP_FILE='/secure/backups/index-assist/example.dump' \
RESTORE_CONFIRM_NONPROD=YES \
RESTORE_TARGET_EMPTY=YES \
bash infra/postgres/restore.sh
```

The script verifies checksum and archive listing. It intentionally does not use `--clean` or `--create`; conflicts in a non-empty target fail rather than dropping objects. The confirmation variables are operator assertions, not automatic proof of environment or emptiness.

## Post-restore checklist

- [ ] Record backup timestamp, source/target identifiers, operator, duration and result.
- [ ] Verify expected schemas, tables, indexes, constraints and extensions.
- [ ] Apply migrations newer than the backup using the migration owner.
- [ ] Recreate/verify least-privilege runtime and relay roles/grants; owner/ACL metadata is excluded from dumps.
- [ ] Run tenant RLS, MFA lockout, auth-token replay and MFA recovery-code replay SQL tests against the restored target.
- [ ] Verify tenant isolation using the runtime role.
- [ ] Verify API/provider worker connectivity in the isolated test environment.
- [ ] Record restore duration and represented data-loss window.

A successful `pg_restore` command alone is not a completed recovery drill. Production backup policy, retention, off-site copies, encryption, monitoring and PITR must be designed and tested before release.
