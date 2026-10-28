#!/usr/bin/env sh
# Meridian — restore a backup made by deploy/backup.sh into a Docker volume (docs/deployment.md §7).
#
#   deploy/restore.sh <archive.tar.gz> <volume> [image]
#
# <volume>: the named volume mounted on /data (on Coolify: <app uuid>-meridian-data). It is
#   created if it does not exist. The application must be STOPPED: the script refuses to run
#   while a running container uses the volume.
# [image]: image providing node + tar (default node:22-alpine; the app image works too).
#
# Steps, all inside a throw-away container: extract → verify sha256 and PRAGMA integrity_check of
# every file listed in manifest.json → move the current volume content to /data/.pre-restore-<ts>/
# (nothing is deleted; remove it once the restore is validated) → copy the backup in place.
set -eu

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
case "${1:-}" in -h | --help) usage 0 ;; esac
[ $# -ge 2 ] || usage 2

ARCHIVE=$1
VOLUME=$2
IMAGE=${3:-node:22-alpine}

[ -f "$ARCHIVE" ] || { echo "restore: $ARCHIVE not found" >&2; exit 1; }
tar -tzf "$ARCHIVE" manifest.json >/dev/null 2>&1 ||
  { echo "restore: $ARCHIVE is not a Meridian backup (no manifest.json)" >&2; exit 1; }

RUNNING=$(docker ps -q --filter "volume=$VOLUME")
if [ -n "$RUNNING" ]; then
  echo "restore: volume '$VOLUME' is in use by running container(s): $RUNNING" >&2
  echo "restore: stop the application first (Coolify: Stop; locally: docker stop …)" >&2
  exit 1
fi

# The volume belongs to uid 1000 (`node`) in the app image; run as that user so restored files
# keep the right owner. A brand-new volume is created root-owned, so fix that first.
docker run --rm --user 0 -v "$VOLUME:/data" --entrypoint sh "$IMAGE" -c 'chown 1000:1000 /data'

docker run --rm -i --user 1000:1000 -v "$VOLUME:/data" --entrypoint sh "$IMAGE" -c '
set -eu
WORK=$(mktemp -d)
trap "rm -rf \"$WORK\"" EXIT
tar -xzf - -C "$WORK"
WORK="$WORK" STAMP=$(date -u +%Y%m%dT%H%M%SZ) node --no-warnings --input-type=module -e "
  import { DatabaseSync } from \"node:sqlite\";
  import { copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync } from \"node:fs\";
  import { createHash } from \"node:crypto\";
  import { join } from \"node:path\";
  const { WORK, STAMP } = process.env;
  const manifest = JSON.parse(readFileSync(join(WORK, \"manifest.json\"), \"utf8\"));
  if (manifest.format !== 1) throw new Error(\"unknown backup format \" + manifest.format);
  console.error(\"restore: backup from \" + manifest.createdAt + \" (app \" + manifest.appVersion + \", \" + manifest.commit + \")\");
  // 1. Verify everything before touching the volume.
  for (const f of manifest.files) {
    if (f.name.includes(\"/\")) throw new Error(\"unexpected path \" + f.name);
    const path = join(WORK, \"data\", f.name);
    const sha = createHash(\"sha256\").update(readFileSync(path)).digest(\"hex\");
    if (sha !== f.sha256) throw new Error(f.name + \": checksum mismatch\");
    if (f.kind === \"sqlite\") {
      const db = new DatabaseSync(path, { readOnly: true });
      const ok = db.prepare(\"pragma integrity_check\").get().integrity_check;
      db.close();
      if (ok !== \"ok\") throw new Error(f.name + \": integrity_check failed: \" + ok);
    }
    console.error(\"restore: verified \" + f.name);
  }
  // 2. Move the current content aside (including stale -wal/-shm files), never delete it.
  const aside = \"/data/.pre-restore-\" + STAMP;
  const current = readdirSync(\"/data\").filter((n) => !n.startsWith(\".pre-restore-\"));
  if (current.length > 0) {
    mkdirSync(aside);
    for (const n of current) renameSync(join(\"/data\", n), join(aside, n));
    console.error(\"restore: previous content moved to \" + aside);
  }
  // 3. Copy exactly the files listed in the manifest.
  for (const f of manifest.files) copyFileSync(join(WORK, \"data\", f.name), join(\"/data\", f.name));
  console.error(\"restore: restored \" + manifest.files.map((f) => f.name).join(\", \"));
"
ls -la /data >&2
' <"$ARCHIVE"

echo "restore: '$VOLUME' restored from $ARCHIVE — start the application and check /api/health"
