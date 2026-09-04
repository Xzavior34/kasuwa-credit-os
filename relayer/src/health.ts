import { createServer } from "node:http";
import { getJob } from "./state.js";
import { logger } from "./logger.js";

/**
 * GET /health -> 200 OK if the process is alive.
 * GET /status/:jobId -> the persisted JobRecord for that job, or 404.
 * Deliberately tiny — no framework — this is observability scaffolding, not a public API.
 */
export function startHealthServer(port: number): void {
  const server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400).end();
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "ok" }));
      return;
    }
    const statusMatch = req.url.match(/^\/status\/(.+)$/);
    if (statusMatch) {
      const jobId = decodeURIComponent(statusMatch[1]);
      const job = await getJob(jobId);
      if (!job) {
        res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "job not found" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(job));
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, () => {
    logger.info("health server listening", { status: "LISTENING", port });
  });
}
