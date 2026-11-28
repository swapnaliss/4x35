#!/usr/bin/env bash
# Creates or syncs the 4x35 Render Blueprint (render.yaml on main) and prints IDs and the public URL.
# Idempotent: a re-run plans a sync and approves only real changes, so it creates nothing when the
# Blueprint already matches main (M0-07 AC 2). ADR 0016, ADR 0017.
#
#   scripts/setup.sh            check tools, validate render.yaml, create or sync the Blueprint,
#                               write the IDs to .dev-refs.md (gitignored; IDs are not secrets)
#   scripts/setup.sh --status   change nothing; print one JSON object
#                               {"url","region","plan","postgres_version","postgres_region",
#                                "last_deploy":{"id","status","commit"}}
#
# Never prints an environment value. It touches only the resources named below, by name or ID; any
# other service in the Render workspace is filtered out before anything is printed.
# Render CLI v2.35.0: `render blueprints validate` (GA) and `render ea blueprints create|plan|approve`
# (early access) are the CLI's Blueprint apply path, verified by M0-07.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

SERVICE_NAME=4x35
DB_NAME=4x35-db
BRANCH=main
BLUEPRINT_FILE=render.yaml
WAIT_SECONDS=${SETUP_WAIT_SECONDS:-1200}

# .dev-refs.md lives in the main checkout, also when this runs from a worktree.
common=$(git rev-parse --path-format=absolute --git-common-dir)
DEV_REFS="$(dirname "$common")/.dev-refs.md"
SCRATCH="${TMPDIR:-/tmp}/4x35-setup.$$"
mkdir -p "$SCRATCH"
trap 'rm -rf "$SCRATCH"' EXIT

die() { echo "setup: $*" >&2; exit 1; }

# The 4x35 web service and database records (JSON), or "null". Other services never leave jq.
render_services() { render services -o json --confirm 2>"$SCRATCH/services.err"; }
service_json() { jq -c --arg n "$SERVICE_NAME" '[.[] | .service? | select(. != null and .name == $n and .type == "web_service")] | .[0]' "$SCRATCH/services.json"; }
db_json() { jq -c --arg n "$DB_NAME" '[.[] | .postgres? | select(. != null and .name == $n)] | .[0]' "$SCRATCH/services.json"; }
refresh() { render_services >"$SCRATCH/services.json" || die "render services failed: $(cat "$SCRATCH/services.err")"; }

blueprint_id() {
  [ -f "$DEV_REFS" ] || return 0
  sed -nE 's/^- Render blueprint: (exs-[a-z0-9]+).*/\1/p' "$DEV_REFS" | head -n1
}

# Rewrites the managed block in .dev-refs.md (IDs and URL only).
write_refs() {
  local bp=$1 svc=$2 db=$3 url=$4
  touch "$DEV_REFS"
  awk '/^<!-- render:begin -->$/{skip=1} !skip{print} /^<!-- render:end -->$/{skip=0}' "$DEV_REFS" >"$SCRATCH/refs"
  {
    cat "$SCRATCH/refs"
    echo "<!-- render:begin -->"
    echo "## Render (written by scripts/setup.sh, M0-07; IDs are not secrets)"
    echo "- Render blueprint: $bp"
    echo "- Render service $SERVICE_NAME: $svc"
    echo "- Render Postgres $DB_NAME: $db"
    echo "- Render URL: $url"
    echo "<!-- render:end -->"
  } >"$DEV_REFS"
}

status() {
  refresh
  local svc db
  svc=$(service_json)
  db=$(db_json)
  [ "$svc" != null ] || die "service '$SERVICE_NAME' not found (run scripts/setup.sh first)"
  [ "$db" != null ] || die "database '$DB_NAME' not found (run scripts/setup.sh first)"
  render deploys list "$(jq -r .id <<<"$svc")" -o json --confirm >"$SCRATCH/deploys.json" 2>"$SCRATCH/deploys.err" \
    || die "render deploys list failed: $(cat "$SCRATCH/deploys.err")"
  jq -n --argjson s "$svc" --argjson d "$db" --slurpfile deps "$SCRATCH/deploys.json" '
    ($deps[0] | if type == "array" then . else (.data // []) end) as $list
    | (($list[0] // {}) | (.deploy // .)) as $last
    | {
        url: $s.serviceDetails.url,
        region: $s.serviceDetails.region,
        plan: $s.serviceDetails.plan,
        postgres_version: $d.version,
        postgres_region: $d.region,
        last_deploy: {
          id: ($last.id // null),
          status: ($last.status // null),
          commit: (($last.commit | if type == "object" then .id else . end) // null)
        }
      }'
}

if [ "${1:-}" = "--status" ]; then
  status
  exit 0
fi
[ $# -eq 0 ] || die "usage: scripts/setup.sh [--status]"

# 1. Tools and logins
command -v render >/dev/null || die "Render CLI not found (P-18: install it, then 'render login')"
command -v jq >/dev/null || die "jq not found (P-29)"
render whoami -o json >/dev/null 2>&1 || die "Render CLI not logged in (P-18 owner step: render login, then render workspace set <workspace>)"
gh auth status >/dev/null 2>&1 || die "GitHub CLI not logged in (P-01 owner step: gh auth login)"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
REPO_URL="https://github.com/$REPO"

# 2. The blueprint validates, and Render reads it from main (only the main commit deploys).
render blueprints validate "$BLUEPRINT_FILE" -o json --confirm >"$SCRATCH/validate.json" 2>&1 || true
jq -e '.valid == true' "$SCRATCH/validate.json" >/dev/null 2>&1 \
  || die "render.yaml is not valid: $(cat "$SCRATCH/validate.json")"
echo "setup: render.yaml valid"
gh api "repos/$REPO/contents/$BLUEPRINT_FILE?ref=$BRANCH" --jq .sha >/dev/null 2>&1 \
  || die "$BLUEPRINT_FILE is not on $BRANCH of $REPO yet: merge it first (Render reads the Blueprint from $BRANCH)"

# Owner steps for the errors Render can return on create or approve.
explain() {
  local f=$1
  if grep -qiE 'payment|card|billing' "$f"; then
    echo "setup: owner step: add a card in Render Workspace Settings -> Billing (P-20)" >&2
  elif grep -qiE 'github|repositor|permission|access|not found|installation' "$f"; then
    echo "setup: owner step (P-19): connect Render to GitHub with access to $REPO (Render dashboard -> Account Settings -> Git Deployment Credentials -> GitHub)" >&2
  fi
}

approve() {
  local bp=$1
  if ! render ea blueprints approve "$bp" -o json --confirm >"$SCRATCH/approve.json" 2>&1; then
    cat "$SCRATCH/approve.json" >&2; explain "$SCRATCH/approve.json"; die "approve failed for $bp"
  fi
  echo "setup: sync approved: $(jq -r '.data.id // "?"' "$SCRATCH/approve.json" 2>/dev/null)"
}

# 3. Create or sync
refresh
svc=$(service_json)
db=$(db_json)
bp=$(blueprint_id)
created=0
if [ -z "$bp" ]; then
  if [ "$svc" != null ] || [ "$db" != null ]; then
    die "'$SERVICE_NAME' or '$DB_NAME' exists but no Blueprint ID is in .dev-refs.md: find it in the Render dashboard -> Blueprints and add '- Render blueprint: exs-...' to .dev-refs.md, then re-run"
  fi
  echo "setup: creating Blueprint '$SERVICE_NAME' from $REPO_URL ($BRANCH, $BLUEPRINT_FILE)"
  if ! render ea blueprints create --repo "$REPO_URL" --branch "$BRANCH" --path "$BLUEPRINT_FILE" \
      --name "$SERVICE_NAME" --existing-resources create_new --auto-sync -o json --confirm \
      >"$SCRATCH/create.json" 2>&1; then
    cat "$SCRATCH/create.json" >&2; explain "$SCRATCH/create.json"; die "Blueprint create failed"
  fi
  bp=$(jq -r '.data.blueprint.id' "$SCRATCH/create.json")
  outcome=$(jq -r '.data.planningOutcome' "$SCRATCH/create.json")
  [[ "$bp" == exs-* ]] || { cat "$SCRATCH/create.json" >&2; die "no Blueprint ID in the create output"; }
  write_refs "$bp" pending pending pending
  echo "setup: Blueprint $bp created (planning: $outcome)"
  case "$outcome" in
    planned) approve "$bp"; created=1 ;;
    no_changes) ;;
    *) jq '.data.notices' "$SCRATCH/create.json" >&2 || true; die "first sync planning $outcome: fix the errors, then run 'render ea blueprints plan $bp'" ;;
  esac
else
  echo "setup: Blueprint $bp exists; planning a sync from $BRANCH"
  if ! render ea blueprints plan "$bp" -o json --confirm >"$SCRATCH/plan.json" 2>&1; then
    cat "$SCRATCH/plan.json" >&2; explain "$SCRATCH/plan.json"; die "plan failed for $bp"
  fi
  outcome=$(jq -r '.data.planningOutcome' "$SCRATCH/plan.json")
  case "$outcome" in
    no_changes) echo "setup: no changes; nothing created" ;;
    planned) echo "setup: changes planned on $BRANCH; approving"; approve "$bp" ;;
    *) jq '.data.notices' "$SCRATCH/plan.json" >&2 || true; die "sync planning $outcome for $bp" ;;
  esac
fi

# 4. Wait until both resources exist (the approved sync creates them asynchronously).
deadline=$((SECONDS + WAIT_SECONDS))
until [ "$svc" != null ] && [ "$db" != null ]; do
  [ "$SECONDS" -lt "$deadline" ] || die "resources not visible after ${WAIT_SECONDS}s; check the sync in the Render dashboard -> Blueprints -> $bp"
  sleep 10
  refresh
  svc=$(service_json)
  db=$(db_json)
done

svc_id=$(jq -r .id <<<"$svc")
db_id=$(jq -r .id <<<"$db")
url=$(jq -r '.serviceDetails.url // "pending"' <<<"$svc")
write_refs "$bp" "$svc_id" "$db_id" "$url"
echo "setup: blueprint $bp"
echo "setup: service $SERVICE_NAME $svc_id"
echo "setup: database $DB_NAME $db_id"
echo "setup: url $url"
[ "$created" = 1 ] && echo "setup: first deploy started; watch it with scripts/setup.sh --status"
exit 0
