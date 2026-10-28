# syntax=docker/dockerfile:1.7
# Meridian — single image: Hono server + built PWA (architecture §7.1).
# Build from the repository root:  docker build -f deploy/Dockerfile .

# Base image is overridable (e.g. a registry mirror when Docker Hub rate-limits):
#   --build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine
ARG NODE_IMAGE=node:22-alpine

# ── 1. Build ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Manifests first so the dependency layer is cached across source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/engine/package.json packages/engine/
COPY packages/geo/package.json packages/geo/
COPY packages/content-schema/package.json packages/content-schema/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY tools/geo-pipeline/package.json tools/geo-pipeline/
COPY content/package.json content/
# Optional build secret `extra_ca`: extra CA bundle for TLS-intercepting proxies
# (absent on Coolify, where nothing changes).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi && \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ── 2. Runtime ────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runtime
ARG SOURCE_COMMIT=unknown
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public \
    DATA_DIR=/data \
    GIT_COMMIT=${SOURCE_COMMIT} \
    APP_VERSION=${APP_VERSION}

WORKDIR /app
# The server is a single esbuild bundle: no node_modules at runtime.
COPY --from=build --chown=node:node /repo/apps/server/dist/server.mjs ./server.mjs
COPY --from=build --chown=node:node /repo/apps/web/dist ./public
RUN mkdir -p /data && chown node:node /data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "server.mjs"]
