import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { getRecentLogs, getLastId } from "../log-buffer";

const HealthCheckResponse = z.object({ status: z.string() });

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/logs", (req, res) => {
  const sinceId = req.query.since !== undefined ? Number(req.query.since) : undefined;
  const logs = getRecentLogs(sinceId);
  res.json({ logs, lastId: getLastId() });
});

router.get("/logs/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let lastId = req.query.since !== undefined ? Number(req.query.since) : getLastId();

  const send = () => {
    const newLogs = getRecentLogs(lastId);
    if (newLogs.length > 0) {
      lastId = newLogs[newLogs.length - 1].id;
      res.write(`data: ${JSON.stringify(newLogs)}\n\n`);
    }
  };

  send();
  const interval = setInterval(send, 800);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

export default router;
