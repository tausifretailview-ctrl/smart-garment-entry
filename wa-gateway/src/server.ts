import express, { type NextFunction, type Request, type Response } from "express";
import { SessionManager } from "./sessions.js";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
if (!API_KEY) {
  console.error("GATEWAY_API_KEY is required");
  process.exit(1);
}

const sessions = new SessionManager();
const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health") return next();
  if (req.header("x-api-key") !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
});

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response) =>
    fn(req, res).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "Internal error";
      res.status(400).json({ success: false, error: message });
    });

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/sessions/:orgId/start", wrap(async (req, res) => {
  res.json({ success: true, ...(await sessions.start(req.params.orgId)) });
}));

app.get("/sessions/:orgId/status", wrap(async (req, res) => {
  res.json({ success: true, ...(await sessions.status(req.params.orgId)) });
}));

app.delete("/sessions/:orgId", wrap(async (req, res) => {
  await sessions.logout(req.params.orgId);
  res.json({ success: true });
}));

app.post("/sessions/:orgId/send-text", wrap(async (req, res) => {
  const { phone, message } = req.body ?? {};
  const messageId = await sessions.sendText(req.params.orgId, String(phone ?? ""), String(message ?? ""));
  res.json({ success: true, messageId });
}));

app.post("/sessions/:orgId/send-file", wrap(async (req, res) => {
  const { phone, fileUrl, filename, caption } = req.body ?? {};
  const messageId = await sessions.sendFile(
    req.params.orgId,
    String(phone ?? ""),
    String(fileUrl ?? ""),
    String(filename ?? "document.pdf"),
    caption ? String(caption) : undefined,
  );
  res.json({ success: true, messageId });
}));

app.post("/sessions/:orgId/check-number", wrap(async (req, res) => {
  const exists = await sessions.checkNumber(req.params.orgId, String(req.body?.phone ?? ""));
  res.json({ success: true, exists });
}));

app.listen(PORT, () => {
  console.log(`wa-gateway listening on :${PORT}`);
  void sessions.restoreAll();
});
