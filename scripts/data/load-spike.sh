#!/usr/bin/env bash
# M0-08 load spike: streams the fetched GeoNames and Japan Post files through the loader prototype
# into a scratch Postgres 17 (its own container, port and $TMPDIR volume; independent of M0-06's
# stack), times each load and index build, then runs scripts/data/measure-spike.sql.
# Prerequisites: scripts/data/fetch-geonames.sh and scripts/data/fetch-japanpost.sh have run.
# Usage: PORT_OFFSET=600 scripts/data/load-spike.sh [--keep]   (--keep leaves the container up)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
: "${TMPDIR:?export TMPDIR to a writable scratch directory}"
PORT=$((5432 + ${PORT_OFFSET:-600}))
NAME="m0-08-pg-scratch-${PORT}"
VOL="$TMPDIR/m0-08-pgdata"
RAW=data/raw

docker rm -f "$NAME" >/dev/null 2>&1 || true
VOL="$VOL-$(date +%s)"
mkdir -p "$VOL"
# run as the invoking user so the $TMPDIR volume stays removable without root
docker run -d --name "$NAME" --user "$(id -u):$(id -g)" -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=spike -v "$VOL:/var/lib/postgresql/data" \
  postgres:17-alpine >/dev/null
trap '[ "${1:-}" = --keep ] || { docker rm -f "$NAME" >/dev/null; rm -rf "$VOL"; }' EXIT
until docker exec "$NAME" pg_isready -U postgres -d spike -q 2>/dev/null; do sleep 1; done
sleep 2 # the entrypoint restarts the server once after initdb
until docker exec "$NAME" pg_isready -U postgres -d spike -q 2>/dev/null; do sleep 1; done

psql() { docker exec -i "$NAME" psql -U postgres -d spike -v ON_ERROR_STOP=1 -q "$@"; }
now() { date +%s%3N; }

psql <<'SQL'
CREATE TABLE geonames_postal (country text NOT NULL, postcode text NOT NULL, place text,
  admin1 text, admin2 text);
CREATE TABLE jp_post_roman (postcode text NOT NULL, prefecture_kanji text, city_kanji text,
  town_kanji text, prefecture_romaji text, city_romaji text, town_romaji text);
CREATE TABLE jp_post_kana (postcode text NOT NULL, prefecture_kana text, city_kana text,
  town_kana text, prefecture_kanji text, city_kanji text, town_kanji text);
SQL

load() { # <table> <zip> <member>
  local t0 t1
  t0=$(now)
  unzip -p "$RAW/$2" "$3" | node scripts/data/copy-stream.mjs "$1" \
    | psql -c "COPY $1 FROM STDIN"
  t1=$(now)
  echo "load_ms $1 $((t1 - t0))"
}
load geonames_postal geonames-allCountries.zip allCountries.txt
load jp_post_roman japanpost-KEN_ALL_ROME.zip KEN_ALL_ROME.CSV
load jp_post_kana japanpost-utf_ken_all.zip utf_ken_all.csv

# jp_post: the romanised rows with the kana reading joined on postcode + kanji. The join key drops
# whitespace and maps the wave dash: Shift_JIS 0x8160 decodes to U+FF5E, the UTF-8 file has U+301C.
t0=$(now)
psql <<'SQL'
CREATE TABLE jp_post AS
SELECT DISTINCT ON (r.ctid) r.postcode,
  r.prefecture_kanji, r.city_kanji, r.town_kanji,
  k.prefecture_kana, k.city_kana, k.town_kana,
  r.prefecture_romaji, r.city_romaji, r.town_romaji
FROM jp_post_roman r
LEFT JOIN jp_post_kana k
  ON k.postcode = r.postcode
 AND translate(regexp_replace(k.city_kanji, '[\s　]', '', 'g'), '～', '〜')
   = translate(regexp_replace(r.city_kanji, '[\s　]', '', 'g'), '～', '〜')
 AND translate(regexp_replace(k.town_kanji, '[\s　]', '', 'g'), '～', '〜')
   = translate(regexp_replace(r.town_kanji, '[\s　]', '', 'g'), '～', '〜')
ORDER BY r.ctid;
SQL
echo "build_ms jp_post $(($(now) - t0))"

t0=$(now); psql -c "CREATE INDEX geonames_postal_country_postcode ON geonames_postal (country, postcode)"
echo "index_ms geonames_postal $(($(now) - t0))"
t0=$(now); psql -c "CREATE INDEX jp_post_postcode ON jp_post (postcode)"
echo "index_ms jp_post $(($(now) - t0))"
psql -c "VACUUM ANALYZE"

docker exec -i "$NAME" psql -U postgres -d spike -v ON_ERROR_STOP=1 -P pager=off \
  <scripts/data/measure-spike.sql
