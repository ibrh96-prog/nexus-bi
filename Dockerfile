# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Multi-stage build for a monorepo:
#   - frontend: Vite/React (built with `npm run build` at repo root)
#   - backend:  Express/TypeScript (source under ./server, built with tsc)
# The final image runs the Express server and serves the built frontend as
# static assets from /app/public.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=20-alpine

# ---------- 1. deps: install root + server deps (cached separately) --------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Root (frontend) deps
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# Backend deps
COPY server/package.json server/package-lock.json* ./server/
RUN --mount=type=cache,target=/root/.npm \
    cd server && npm ci --no-audit --no-fund

# ---------- 2. build-frontend: compile Vite bundle -------------------------
FROM node:${NODE_VERSION} AS build-frontend
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* vars must be present at build time (baked into the bundle).
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- 3. build-backend: compile TS -> JS -----------------------------
FROM node:${NODE_VERSION} AS build-backend
WORKDIR /app/server
COPY --from=deps /app/server/node_modules ./node_modules
COPY server/ ./
RUN npx tsc -p tsconfig.json

# ---------- 4. prod-deps: prune backend to production-only deps ------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---------- 5. runtime: minimal image --------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001

RUN addgroup -S app && adduser -S app -G app

# Backend artifacts + production node_modules
COPY --from=build-backend  /app/server/dist          ./server/dist
COPY --from=prod-deps      /app/server/node_modules  ./server/node_modules
COPY --from=build-backend  /app/server/package.json  ./server/package.json

# Frontend bundle served statically by Express (mount under /public).
COPY --from=build-frontend /app/dist ./public

USER app
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server/dist/index.js"]
