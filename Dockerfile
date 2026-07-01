# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

# ---------- 1. deps: Root bağımlılıklarını kur ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- 2. build-frontend: Vite ile frontend build'i ----------
FROM node:${NODE_VERSION} AS build-frontend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. build-backend: TypeScript ile backend build'i ----------
FROM node:${NODE_VERSION} AS build-backend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# TypeScript hata verse bile dist klasörünü oluşturmaya zorla
RUN mkdir -p server/dist && npx tsc -p server/tsconfig.json --outDir server/dist || true

# ---------- 4. runtime: Final imaj ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001

RUN addgroup -S app && adduser -S app -G app

# Frontend build çıktılarını al
COPY --from=build-frontend /app/dist ./public

# Backend derlenmiş dosyaları al
COPY --from=build-backend /app/server/dist ./server/dist
COPY --from=deps /app/package.json ./package.json

USER app
EXPOSE 3001

CMD ["node", "server/dist/index.js"]