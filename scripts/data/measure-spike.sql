-- M0-08 measurements on the scratch load (run by scripts/data/load-spike.sh).
-- shape(): digits -> 9, letters -> A, so "SW1A" -> "AA9A".
CREATE FUNCTION pg_temp.shape(p text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT regexp_replace(regexp_replace(p, '[0-9]', '9', 'g'), '[A-Za-z]', 'A', 'g') $$;

\echo '## rows'
SELECT 'geonames_postal' AS t, count(*) FROM geonames_postal
UNION ALL SELECT 'jp_post_roman', count(*) FROM jp_post_roman
UNION ALL SELECT 'jp_post_kana', count(*) FROM jp_post_kana
UNION ALL SELECT 'jp_post', count(*) FROM jp_post;
SELECT count(DISTINCT country) AS geonames_countries FROM geonames_postal;

\echo '## sizes (bytes)'
SELECT relname, pg_relation_size(oid) AS table_bytes, pg_indexes_size(oid) AS index_bytes,
       pg_total_relation_size(oid) AS total_bytes
FROM pg_class WHERE relname IN ('geonames_postal', 'jp_post', 'jp_post_roman', 'jp_post_kana')
ORDER BY relname;
SELECT pg_database_size('spike') AS database_bytes;

\echo '## per country: rows, postcodes, unique-match rate (one distinct place per postcode)'
WITH list(country, ord) AS (
  SELECT * FROM unnest(ARRAY['JP','IN','CN','SG','HK','AE','BR','DE','GB','US','FR','NL','ES','IT',
    'SE','DK','NO','FI','CH','BE','AT','PL','IE','KR','PH','TW','MY','AU','CA','MX'])
    WITH ORDINALITY),
pc AS (
  SELECT country, postcode, count(*) AS n, count(DISTINCT lower(place)) AS places
  FROM geonames_postal GROUP BY country, postcode)
SELECT l.ord <= 14 AS parser_list, l.country,
       coalesce(sum(pc.n), 0) AS rows, count(pc.postcode) AS postcodes,
       count(*) FILTER (WHERE pc.places = 1) AS unique_pc,
       round(100.0 * count(*) FILTER (WHERE pc.places = 1) / nullif(count(pc.postcode), 0), 1)
         AS unique_pct,
       round(avg(pc.places), 2) AS avg_places
FROM list l LEFT JOIN pc ON pc.country = l.country
GROUP BY l.ord, l.country ORDER BY l.ord;

\echo '## JP from Japan Post: unique-match rate (one distinct city+town per postcode)'
SELECT count(*) AS postcodes,
       count(*) FILTER (WHERE towns = 1) AS unique_pc,
       round(100.0 * count(*) FILTER (WHERE towns = 1) / count(*), 1) AS unique_pct
FROM (SELECT postcode, count(DISTINCT (city_kanji, town_kanji)) AS towns
      FROM jp_post GROUP BY postcode) s;
SELECT count(*) FILTER (WHERE town_kana IS NULL) AS kana_unmatched, count(*) AS rows FROM jp_post;
SELECT count(*) FILTER (WHERE town_kanji = '以下に掲載がない場合') AS placeholder_not_listed,
       count(*) FILTER (WHERE town_kanji LIKE '%一円') AS placeholder_whole_city,
       count(*) FILTER (WHERE town_kanji LIKE '%（%' AND town_kanji NOT LIKE '%）%') AS split_open,
       count(*) FILTER (WHERE town_kanji NOT LIKE '%（%' AND town_kanji LIKE '%）%') AS split_close,
       count(*) FILTER (WHERE town_kanji LIKE '%（%）%') AS with_note
FROM jp_post;

\echo '## postcode shapes per parser-list country (top 3)'
SELECT country, shape, n FROM (
  SELECT country, pg_temp.shape(postcode) AS shape, count(*) AS n,
         row_number() OVER (PARTITION BY country ORDER BY count(*) DESC) AS r
  FROM geonames_postal
  WHERE country IN ('JP','IN','CN','SG','HK','AE','BR','DE','GB','US','FR','NL','ES','IT','IE')
  GROUP BY country, pg_temp.shape(postcode)) s
WHERE r <= 3 ORDER BY country, n DESC;

\echo '## defect: HK and AE postcodes'
SELECT country, postcode, count(*) AS rows, min(place) AS example_place
FROM geonames_postal WHERE country IN ('HK', 'AE')
GROUP BY country, postcode ORDER BY country, rows DESC LIMIT 20;

\echo '## defect: truncated coverage'
SELECT 'CN ends 00' AS check, count(*) FILTER (WHERE postcode ~ '00$') AS hit, count(*) AS rows
FROM geonames_postal WHERE country = 'CN'
UNION ALL SELECT 'BR ends -000 or 000', count(*) FILTER (WHERE postcode ~ '-?000$'), count(*)
FROM geonames_postal WHERE country = 'BR'
UNION ALL SELECT 'IE 3-char routing key', count(*) FILTER (WHERE length(postcode) = 3), count(*)
FROM geonames_postal WHERE country = 'IE'
UNION ALL SELECT 'GB outward code only', count(*) FILTER (WHERE postcode !~ ' '), count(*)
FROM geonames_postal WHERE country = 'GB'
UNION ALL SELECT 'NL 4 digits only', count(*) FILTER (WHERE postcode ~ '^[0-9]{4}$'), count(*)
FROM geonames_postal WHERE country = 'NL'
UNION ALL SELECT 'CA 3-char FSA only', count(*) FILTER (WHERE length(postcode) = 3), count(*)
FROM geonames_postal WHERE country = 'CA';
SELECT country, postcode, place FROM geonames_postal
WHERE (country, postcode) IN (SELECT country, min(postcode) FROM geonames_postal
  WHERE country IN ('CN', 'BR', 'IE', 'GB', 'NL', 'CA') GROUP BY country) ORDER BY country;

\echo '## defect: duplicate (country, postcode, place) rows'
SELECT count(*) AS duplicate_rows FROM (
  SELECT 1 FROM geonames_postal GROUP BY country, postcode, lower(place), admin1, admin2
  HAVING count(*) > 1) d;

\echo '## defect detail: HK row, AE spread, kana join misses'
SELECT * FROM geonames_postal WHERE country = 'HK';
SELECT count(*) AS rows, count(DISTINCT place) AS places, count(admin1) AS with_admin1,
       min(postcode), max(postcode) FROM geonames_postal WHERE country = 'AE';
SELECT count(*) AS kana_unmatched,
       count(*) FILTER (WHERE town_kanji ~ '（|）') AS of_which_split_or_note
FROM jp_post WHERE town_kana IS NULL;

\echo '## projection: GeoNames without the excluded countries (AE, HK)'
CREATE TABLE geonames_kept AS SELECT * FROM geonames_postal WHERE country NOT IN ('AE', 'HK');
CREATE INDEX ON geonames_kept (country, postcode);
SELECT count(*) AS rows, pg_relation_size('geonames_kept') AS table_bytes,
       pg_indexes_size('geonames_kept') AS index_bytes,
       pg_total_relation_size('geonames_kept') AS total_bytes FROM geonames_kept;
