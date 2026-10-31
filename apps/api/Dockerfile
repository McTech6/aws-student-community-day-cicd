# syntax=docker/dockerfile:1
#
# Forge API image. Build from the repo root (npm workspaces need the root
# package.json and lockfile):
#
#   docker build -f apps/api/Dockerfile -t forge-api .
#
# Base images come from the ECR Public mirror of Docker Hub's official images,
# so CodeBuild does not hit Docker Hub's anonymous pull rate limit.
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim

# ---- base: Node + OpenSSL (Prisma's engines link against it) ---------------
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- prod-deps: only runtime dependencies, plus the generated Prisma client -
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# The schema must be present before install: the api's postinstall runs
# `prisma generate`, and Prisma downloads its engines during install.
COPY apps/api/prisma apps/api/prisma
RUN npm ci --omit=dev --no-audit --no-fund -w @forge/api \
  && mkdir -p apps/api/node_modules

# ---- build: all dependencies, compile TypeScript to dist/ -------------------
FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY apps/api/prisma apps/api/prisma
RUN npm ci --no-audit --no-fund -w @forge/api
COPY apps/api apps/api
RUN npm run build -w @forge/api

# ---- runtime: small image, non-root user ------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    PATH=/app/node_modules/.bin:$PATH

COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules /app/apps/api/node_modules
WORKDIR /app/apps/api
COPY --chown=node:node apps/api/package.json ./
COPY --chown=node:node apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --chown=node:node --chmod=755 apps/api/docker-entrypoint.sh ./

# The official Node image ships a non-root "node" user.
USER node
EXPOSE 3001

# The slim image has no curl, so the health check uses Node's built-in fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
