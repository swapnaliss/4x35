# Local stack: one command up, one command down (ADR 0016). Works without a .env.
#
#   make up        Postgres 17 healthy, then migrate, then seed
#   make down      stop the stack, keep the data
#   make reset     drop the stack and its volume, then `make up` (the clean-state recipe for gates)
#   make migrate   apply pending migrations (a no-op when none are pending)
#   make seed      run the idempotent seed
#   make psql      psql inside the container
#   make logs      the last Postgres log lines
#
# PORT_OFFSET (default 0) moves the host port to 5432 + PORT_OFFSET, so parallel worktrees never
# collide. No target prints an environment value: DATABASE_URL is exported, never echoed.

SHELL := /bin/bash
.DEFAULT_GOAL := up

PORT_OFFSET ?= 0
ifeq ($(shell [[ "$(PORT_OFFSET)" =~ ^[0-9]+$$ ]] && echo ok),)
$(error PORT_OFFSET must be a non-negative integer)
endif
PG_PORT := $(shell echo $$((5432 + $(PORT_OFFSET))))
export PG_PORT

# A local DATABASE_URL only when none is set (local-only default credentials, see docker-compose.yml).
ifeq ($(strip $(DATABASE_URL)),)
DATABASE_URL := postgres://postgres:postgres@127.0.0.1:$(PG_PORT)/postgres
endif
export DATABASE_URL

COMPOSE := docker compose

.PHONY: up down reset migrate seed psql logs db-guard

# migrate and seed write to DATABASE_URL: refuse a non-local one (an exported Render URL) unless
# ALLOW_REMOTE_DATABASE=1. The value is matched in the shell and never printed (BL-01 7130276627).
db-guard:
	@case "$$DATABASE_URL" in \
	  *://127.0.0.1[:/]*|*://localhost[:/]*|*@127.0.0.1[:/]*|*@localhost[:/]*) ;; \
	  *) [ "$${ALLOW_REMOTE_DATABASE:-}" = 1 ] || { \
	       echo "make: DATABASE_URL points at a non-local database; unset it to use the local stack, or set ALLOW_REMOTE_DATABASE=1" >&2; \
	       exit 1; } ;; \
	esac

up: db-guard
	$(COMPOSE) up --detach --wait postgres
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed

down:
	$(COMPOSE) down

reset: db-guard
	$(COMPOSE) down --volumes --remove-orphans
	@$(MAKE) --no-print-directory up

migrate: db-guard
	npm run --silent db:migrate

seed: db-guard
	npm run --silent db:seed

psql:
	$(COMPOSE) exec postgres psql -U postgres -d postgres

logs:
	$(COMPOSE) logs --tail=200 postgres
