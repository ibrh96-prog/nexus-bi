# Nexus BI — Backend API

Standalone Node.js service (Express + Drizzle + PostgreSQL). Runs
independently of the TanStack Start frontend (which is deployed to
Cloudflare Workers and cannot host Express).

## Setup

```bash
bun add express drizzle-orm pg zod
bun add -d @types/express @types/pg drizzle-kit tsx
```

## Env

```
DATABASE_URL=postgres://user:pass@host:5432/nexus_bi
PG_SSL=false
PORT=3001
```

## Run

```bash
bunx tsx server/index.ts
```

## Migrations

Point `drizzle-kit` at `server/schema.ts`:

```bash
bunx drizzle-kit generate --schema=./server/schema.ts --dialect=postgresql --out=./server/migrations
bunx drizzle-kit migrate --dialect=postgresql --migrations-folder=./server/migrations
```

## Endpoints

- `GET/POST     /api/workflows`
- `GET/PUT/DELETE /api/workflows/:id`
- `GET/POST     /api/metrics`  (`?limit=`)
- `GET/PUT/DELETE /api/metrics/:id`
- `GET/POST     /api/insights` (`?status=&type=`)
- `GET/PUT/DELETE /api/insights/:id`
