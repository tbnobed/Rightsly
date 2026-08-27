#!/bin/sh
# Creates a complete, restorable self-hosted backup. Credentials are supplied
# by PostgreSQL environment variables; do not enable shell tracing here.
set -eu

backup_root=/backups
retention_days="${BACKUP_RETENTION_DAYS:-30}"
lock_dir="$backup_root/.rightsly-backup.lock"
today="$(date -u +%F)"
final_dir="$backup_root/rightsly-$today"
temp_dir="$backup_root/.rightsly-$today.$$.tmp"

mkdir -p "$backup_root"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "A Rightsly backup is already running; exiting." >&2
  exit 0
fi

cleanup() {
  rm -rf "$temp_dir"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

if [ -e "$final_dir" ]; then
  echo "Backup for $today already exists; exiting."
  exit 0
fi

mkdir "$temp_dir"
# PostgreSQL custom format supports selective, validated restores with pg_restore.
# Ownership and ACLs are deployment-specific and should not be carried into a
# recovery database.
pg_dump --format=custom --no-owner --no-acl --file="$temp_dir/database.dump"
# Object binaries are intentionally excluded from portable CSV exports, but are
# part of a disaster-recovery backup.
tar -C /objectdata -czf "$temp_dir/objectdata.tar.gz" .

(
  cd "$temp_dir"
  sha256sum database.dump objectdata.tar.gz > SHA256SUMS
  {
    echo "Rightsly backup manifest"
    echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "database_format=postgresql-custom"
    echo "object_archive=objectdata.tar.gz"
    echo "retention_days=$retention_days"
  } > MANIFEST.txt
)

# A same-filesystem rename makes a complete backup visible atomically.
mv "$temp_dir" "$final_dir"
# Retain completed dated backup directories only. Never touch temp/lock paths.
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'rightsly-????-??-??' \
  -mtime "+$((retention_days - 1))" -exec rm -rf {} +
echo "Rightsly backup completed: $(basename "$final_dir")"