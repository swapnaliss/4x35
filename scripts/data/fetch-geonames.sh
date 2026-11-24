#!/usr/bin/env bash
# GeoNames postal codes (allCountries.zip, CC-BY 4.0) into data/raw/. Never committed: M2-11 runs
# this at seed time. Idempotent; exits non-zero on a hash mismatch. PIN=1 re-pins (GeoNames
# regenerates the file daily). See docs/evidence/datasets.md.
set -euo pipefail
# shellcheck source=fetch-lib.sh
source "$(dirname "$0")/fetch-lib.sh"
fetch_source geonames-postal
