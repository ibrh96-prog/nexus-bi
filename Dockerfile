# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=20-alpine

# ---------- 1. deps: install root + server deps --------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---------- 2. build-frontend: compile Vite bundle -------------------------
FROM node:${NODE_VERSION} AS build-frontend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite build çıktısının her zaman 'dist' olduğunu garanti ediyoruz
RUN npm run build

# ---------- 3. build-backend: compile TS -> JS -----------------------------
FROM node:${NODE_VERSION} AS build-backend
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./server/
COPY tsconfig.json ./
# Backend için gerekli bağımlılıkları kopyalıyoruz
RUN npx tsc -p server/tsconfig.json

# ---------- 4. runtime: minimal image --------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001

RUN addgroup -S app && adduser -S app -G app

# Frontend: build-frontend aşamasından 'dist' klasörünü alıp 'public'e kopyalıyoruz
COPY --from=build-frontend /app/dist ./public

# Backend: build-backend aşamasından derlenmiş dosyaları kopyalıyoruz
COPY --from=build-backend /app/server/dist ./server/dist
COPY --from=deps /app/package.json ./package.json

USER app
EXPOSE 3001

CMD ["node", "server/dist/index.js"]