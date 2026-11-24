-- 0000_baseline (M0-06): extensions only; tables start with M1-02 (0001 onwards).
-- citext: case-insensitive emails and identifiers. pgcrypto: gen_random_bytes / digest.
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
