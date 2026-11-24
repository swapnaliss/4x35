# shellcheck shell=bash
# Shared by scripts/data/fetch-*.sh (M0-08). Source it; do not run it.
#
# fetch_source <id>: fetches the source <id> from data/sources.json into data/raw/<file>.
#   - file present and its sha256 matches the pin  -> "up to date", no download, return 0
#   - file present with another sha256              -> "hash mismatch", return 3 (never overwrites)
#   - file absent                                   -> download (60 s timeout), verify, then move
#                                                      into place; a mismatch deletes the download
#                                                      and returns 3
#   - PIN=1                                         -> re-download and record sha256, bytes and
#                                                      retrieved in data/sources.json (use when the
#                                                      publisher has regenerated the file)
# Writes only to data/raw/ (gitignored) and, with PIN=1, to data/sources.json.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
SOURCES="$ROOT/data/sources.json"
RAW="$ROOT/data/raw"
TIMEOUT_S=60

sha256_of() { sha256sum "$1" | cut -d' ' -f1; }

fetch_source() {
  local id="$1" url file pin dest tmp got bytes
  url=$(jq -er --arg id "$id" '.[] | select(.id == $id) | .url' "$SOURCES")
  file=$(jq -er --arg id "$id" '.[] | select(.id == $id) | .file' "$SOURCES")
  pin=$(jq -r --arg id "$id" '.[] | select(.id == $id) | .sha256 // ""' "$SOURCES")
  dest="$RAW/$file"
  mkdir -p "$RAW"

  if [ -f "$dest" ] && [ "${PIN:-0}" != 1 ]; then
    got=$(sha256_of "$dest")
    if [ "$got" = "$pin" ]; then
      echo "$id: up to date ($file, sha256 $got)"
      return 0
    fi
    echo "$id: hash mismatch on existing $file: pinned ${pin:-<none>}, found $got" >&2
    echo "$id: delete the file to re-download, or run with PIN=1 to re-pin" >&2
    return 3
  fi

  if [ -z "$pin" ] && [ "${PIN:-0}" != 1 ]; then
    echo "$id: no sha256 pinned in data/sources.json; run with PIN=1 to pin" >&2
    return 2
  fi

  tmp="$dest.part"
  echo "$id: downloading $url"
  if ! curl -fsSL --connect-timeout 15 --max-time "$TIMEOUT_S" -o "$tmp" "$url"; then
    rm -f "$tmp"
    echo "$id: download failed (timeout ${TIMEOUT_S}s)" >&2
    return 4
  fi
  got=$(sha256_of "$tmp")
  bytes=$(stat -c %s "$tmp")

  if [ "${PIN:-0}" = 1 ]; then
    local out
    out=$(mktemp "${TMPDIR:-/tmp}/sources.XXXXXX")
    jq --arg id "$id" --arg sha "$got" --argjson bytes "$bytes" \
      --arg retrieved "$(date -u +%Y-%m-%d)" \
      'map(if .id == $id then .sha256 = $sha | .bytes = $bytes | .retrieved = $retrieved else . end)' \
      "$SOURCES" >"$out"
    mv "$out" "$SOURCES"
    echo "$id: pinned sha256 $got ($bytes bytes)"
  elif [ "$got" != "$pin" ]; then
    rm -f "$tmp"
    echo "$id: hash mismatch on download: pinned $pin, got $got" >&2
    echo "$id: the publisher regenerated the file; review it, then run with PIN=1 to re-pin" >&2
    return 3
  fi
  mv "$tmp" "$dest"
  echo "$id: fetched $file ($bytes bytes, sha256 $got)"
}
