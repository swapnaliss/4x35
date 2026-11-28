# syntax=docker/dockerfile:1
# Multi-stage image for apps/server (ADR 0016). One image runs MODE=web | worker | all.

# ---- manifests: every workspace package.json, so npm ci layers cache on dependency changes only
FROM node:24-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/rulepacks/package.json packages/rulepacks/
COPY packages/db/package.json packages/db/
COPY packages/llm/package.json packages/llm/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY integrations/kiro-power/package.json integrations/kiro-power/

# ---- build: full install, compile every workspace
FROM manifests AS build
RUN npm ci
COPY tsconfig.base.json tsconfig.json ./
COPY packages/ packages/
COPY apps/ apps/
COPY integrations/ integrations/
RUN npm run build

# ---- production dependencies only
FROM manifests AS prod-deps
RUN npm ci --omit=dev

# ---- runtime: slim, non-root, production deps + built output only
FROM node:24-slim AS runtime
ARG COMMIT=unknown
ENV NODE_ENV=production \
    MODE=all \
    PORT=8080 \
    COMMIT=${COMMIT}
WORKDIR /app
COPY --from=prod-deps /app/package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
# Workspace packages the server imports at runtime (node_modules/@4x35/* link to these).
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/db/package.json packages/db/
COPY --from=build /app/packages/db/dist packages/db/dist
# SQL migrations for the Render pre-deploy step `node packages/db/dist/migrate.js` (M0-07): it
# resolves the repo-root `drizzle/` from `packages/db/dist/`.
COPY drizzle/ drizzle/
USER node
EXPOSE 8080
# Worker mode has no listener, so it reports healthy without an HTTP probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "if(process.env.MODE==='worker')process.exit(0);fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/server/dist/main.js"]
