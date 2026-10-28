#!/usr/bin/env sh
# Meridian — consistent backup of the data volume (docs/deployment.md §7).
#
#   deploy/backup.sh <container> [output-dir]
#
# <container>: name, id or name prefix of the running app container (on Coolify the container
#   name starts with the application uuid, e.g. pxpelh5odsogybzd8qnw6ry3).
# [output-dir]: where the archive is written (default: current directory).
# BACKUP_KEEP=n: optional, keep only the n most recent archives in output-dir.
#
# Every SQLite database (*.db) of DATA_DIR is copied with SQLite's online backup API
# (node:sqlite `backup()`, run inside the container) — consistent even while the app writes, WAL
# included — then checked with `PRAGMA integrity_check`. Other regular files are copied as-is;
# -wal/-shm/-journal files and hidden directories (e.g. .pre-restore-*) are skipped.
# Output: meridian-backup-<UTC timestamp>.tar.gz containing data/ and manifest.json.
set -eu

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
[ $# -ge 1 ] || usage 2
case "$1" in -h | --help) usage 0 ;; esac

TARGET=$1
OUT_DIR=${2:-.}
KEEP=${BACKUP_KEEP:-0}

if docker inspect --type container "$TARGET" >/dev/null 2>&1; then
  CONTAINER=$TARGET
else
  CONTAINER=$(docker ps -q --filter "name=^${TARGET}" | head -n 1)
fi
[ -n "$CONTAINER" ] || { echo "backup: no running container matches '$TARGET'" >&2; exit 1; }

mkdir -p "$OUT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="$OUT_DIR/meridian-backup-$STAMP.tar.gz"
trap 'rm -f "$ARCHIVE.part"' EXIT

# Runs inside the container (Node ≥ 22.16 for node:sqlite backup()); logs go to stderr,
# the tar stream to stdout.
docker exec -i "$CONTAINER" sh -s >"$ARCHIVE.part" <<'IN_CONTAINER'
set -eu
DATA=${DATA_DIR:-/data}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/data"
SRC="$DATA" DEST="$WORK/data" node --no-warnings --input-type=module -e '
  import { DatabaseSync, backup } from "node:sqlite";
  import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
  import { createHash } from "node:crypto";
  import { join } from "node:path";
  const { SRC, DEST } = process.env;
  const files = [];
  for (const name of readdirSync(SRC).sort()) {
    const from = join(SRC, name), to = join(DEST, name);
    if (!statSync(from).isFile() || /-(wal|shm|journal)$/.test(name)) continue;
    let kind = "file";
    if (name.endsWith(".db")) {
      const db = new DatabaseSync(from, { readOnly: true });
      const pages = await backup(db, to);
      db.close();
      // Standalone file: rollback journal (the server switches back to WAL on open), so the
      // archive never needs -wal/-shm companions.
      const check = new DatabaseSync(to);
      check.exec("pragma journal_mode = delete");
      const { integrity_check: ok } = check.prepare("pragma integrity_check").get();
      check.close();
      if (ok !== "ok") throw new Error(`${name}: integrity_check failed: ${ok}`);
      kind = "sqlite";
      console.error(`backup: ${name} (${pages} pages, integrity ok)`);
    } else {
      copyFileSync(from, to);
      console.error(`backup: ${name}`);
    }
    const buf = readFileSync(to);
    files.push({ name, kind, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") });
  }
  writeFileSync(join(DEST, "..", "manifest.json"), JSON.stringify({
    format: 1,
    createdAt: new Date().toISOString(),
    appVersion: process.env.APP_VERSION ?? null,
    commit: process.env.GIT_COMMIT ?? null,
    files,
  }, null, 2) + "\n");
'
tar -C "$WORK" -czf - manifest.json data
IN_CONTAINER

tar -tzf "$ARCHIVE.part" manifest.json >/dev/null
mv "$ARCHIVE.part" "$ARCHIVE"
trap - EXIT
echo "backup: wrote $ARCHIVE ($(wc -c <"$ARCHIVE" | tr -d ' ') bytes)"

if [ "$KEEP" -gt 0 ] 2>/dev/null; then
  # shellcheck disable=SC2012 # archive names are controlled (no spaces)
  ls -1t "$OUT_DIR"/meridian-backup-*.tar.gz | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" && echo "backup: pruned $old"
  done
fi
