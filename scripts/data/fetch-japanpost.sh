#!/usr/bin/env bash
# Japan Post postcode data into data/raw/. Never committed: M2-11 runs this at seed time.
#   japanpost-roman: KEN_ALL_ROME.zip (Shift_JIS; postcode, kanji and romaji, no kana)
#   japanpost-kana:  utf_ken_all.zip (UTF-8, one record per line; adds the kana readings)
# Idempotent; exits non-zero on a hash mismatch. PIN=1 re-pins after a monthly Japan Post update.
set -euo pipefail
# shellcheck source=fetch-lib.sh
source "$(dirname "$0")/fetch-lib.sh"
fetch_source japanpost-roman
fetch_source japanpost-kana
