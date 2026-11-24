#!/usr/bin/env bash
# Fetch the ISO 20022 pain.001 XSDs into schemas/xsd/ from the pinned URLs in schemas/xsd.lock.json,
# verified by sha256. The XSDs are not committed: their licence could not be confirmed
# (docs/evidence/xsd-licence.md), so they are fetched at build time.
#
#   ./scripts/fetch-xsd.sh            fetch what is missing or wrong; skip files whose hash matches
#   XSD_LOCK=<path> ./scripts/fetch-xsd.sh   use another lock file (the tamper test only)
#
# Exits non-zero on a hash mismatch, a non-200 response, a 30 s timeout or a malformed lock entry.
# A file that fails verification is never written over a good one. No network use other than the
# URLs in the lock file.
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK="${XSD_LOCK:-schemas/xsd.lock.json}"
DEST=schemas/xsd
[ -f "$LOCK" ] || { echo "fetch-xsd: lock file not found: $LOCK" >&2; exit 1; }
mkdir -p "$DEST"

sha256() { sha256sum "$1" | cut -d' ' -f1; }

# One tab-separated line per lock entry: file, url, sha256. Validated here so the loop can trust it.
entries=$(node -e '
  const lock = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (!Array.isArray(lock) || lock.length === 0) throw new Error("lock must be a non-empty array");
  for (const e of lock) {
    if (!/^[A-Za-z0-9._-]+\.xsd$/.test(e.file ?? "")) throw new Error(`bad file name: ${e.file}`);
    if (!/^https:\/\/\S+$/.test(e.url ?? "")) throw new Error(`bad url for ${e.file}`);
    if (typeof e.sha256 !== "string" || e.sha256.length === 0) throw new Error(`missing sha256 for ${e.file}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.retrieved ?? "")) throw new Error(`bad retrieved date for ${e.file}`);
    console.log([e.file, e.url, e.sha256].join("\t"));
  }
' "$LOCK") || { echo "fetch-xsd: malformed lock file: $LOCK" >&2; exit 1; }

downloaded=0
cached=0
while IFS=$'\t' read -r file url want; do
  target="$DEST/$file"
  if [ -f "$target" ] && [ "$(sha256 "$target")" = "$want" ]; then
    echo "fetch-xsd: $file ok (hash matches, not downloaded)"
    cached=$((cached + 1))
    continue
  fi
  tmp=$(mktemp "$DEST/.$file.XXXXXX")
  code=$(curl -sS --max-time 30 -o "$tmp" -w '%{http_code}' "$url") || {
    rm -f "$tmp"; echo "fetch-xsd: $file download failed or timed out (30 s): $url" >&2; exit 1; }
  if [ "$code" != 200 ]; then
    rm -f "$tmp"; echo "fetch-xsd: $file HTTP $code from $url" >&2; exit 1
  fi
  got=$(sha256 "$tmp")
  if [ "$got" != "$want" ]; then
    rm -f "$tmp"
    echo "fetch-xsd: $file sha256 mismatch: lock $want, downloaded $got (nothing written)" >&2
    exit 1
  fi
  mv "$tmp" "$target"
  echo "fetch-xsd: $file downloaded and verified"
  downloaded=$((downloaded + 1))
done <<< "$entries"

echo "fetch-xsd: $downloaded downloaded, $cached already present"
