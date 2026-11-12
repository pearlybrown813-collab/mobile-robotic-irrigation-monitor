// server/src/index.ts  --  entry point of the API server
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { pool } from "./db";
import authRoutes from "./routes/auth";
import readingRoutes from "./routes/readings";
import robotRoutes from "./routes/robot";
import adminRoutes from "./routes/admin";

const app = express();
app.set("trust proxy", 1); // Codespaces / reverse proxy sends X-Forwarded-For
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
// The ESP32 firmware posts application/x-www-form-urlencoded bodies.
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected", time: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, database: "unreachable" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/robot", robotRoutes);
app.use("/api", adminRoutes);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// In production the built React dashboard is served from client/dist.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

// Central error handler: log the detail, show a safe message.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(config.port, () => {
  console.log(`Irrigation monitor API listening on http://localhost:${config.port}`);
});
