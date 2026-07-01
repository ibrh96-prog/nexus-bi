# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

# ---------- 1. deps: Root bağımlılıklarını kur ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- 2. build-frontend: compile Vite bundle ----------
FROM node:${NODE_VERSION} AS build-frontend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Hata kontrolü: Çıktı klasörünü bul ve /app/dist yoluna taşı
RUN if [ -d "build" ]; then mv build dist; fi && \
    if [ -d "out" ]; then mv out dist; fi && \
    mkdir -p dist

# ---------- 3. build-backend: compile TS -> JS ----------
FROM node:${NODE_VERSION} AS build-backend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p server/dist && npx tsc -p server/tsconfig.json --outDir server/dist || true

# ---------- 4. runtime: Final imaj ----------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001
RUN addgroup -S app && adduser -S app -G app

# Frontend'i /app/dist yolundan alıp public'e taşıyoruz
COPY --from=build-frontend /app/dist ./public
COPY --from=build-backend /app/server/dist ./server/dist
COPY --from=deps /app/package.json ./package.json

USER app
EXPOSE 3001
CMD ["node", "server/dist/index.js"]