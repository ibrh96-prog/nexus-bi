import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Express } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

const SSR_INTERNAL_PORT = 4000;

let ssrProcess: ChildProcess | undefined;

/**
 * The TanStack Start build (.output/server/index.mjs, Nitro's node-server
 * preset) is a self-starting server, not an importable request handler — so
 * we run it as a child process on an internal port and proxy everything the
 * API routers above didn't claim. This keeps the frontend's relative
 * `/api/...` fetches same-origin without a second public Render service.
 */
export function mountFrontend(app: Express): void {
  const ssrEntry = path.resolve(process.cwd(), ".output/server/index.mjs");
  if (!existsSync(ssrEntry)) {
    // eslint-disable-next-line no-console
    console.warn(`[frontend] ${ssrEntry} not found — skipping SSR mount`);
    return;
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.PORT;
  childEnv.NITRO_PORT = String(SSR_INTERNAL_PORT);

  ssrProcess = spawn(process.execPath, [ssrEntry], { env: childEnv, stdio: "inherit" });
  ssrProcess.on("exit", (code) => {
    // eslint-disable-next-line no-console
    console.error(`[frontend] SSR process exited with code ${code}`);
  });
  ssrProcess.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[frontend] failed to start SSR process", err);
  });

  app.use(
    createProxyMiddleware({
      target: `http://127.0.0.1:${SSR_INTERNAL_PORT}`,
      changeOrigin: true,
      on: {
        error: (_err, _req, res) => {
          if ("writeHead" in res && !res.headersSent) {
            res.writeHead(503, { "content-type": "application/json" });
          }
          res.end(JSON.stringify({ error: "frontend_unavailable" }));
        },
      },
    }),
  );
}

export function stopFrontend(): void {
  ssrProcess?.kill();
}
