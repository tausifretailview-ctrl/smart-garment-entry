import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { SessionManager, type ResendJob } from "./sessions.js";
import { CampaignRunner } from "./campaigns.js";
import { describeDisk, describeFolders, diskLow, diskUsage, fileKinds, folderFileCounts } from "./storage.js";

const PORT = Number(process.env.PORT ?? 8787);
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
if (!API_KEY) {
  console.error("GATEWAY_API_KEY is required");
  process.exit(1);
}

const sessions = new SessionManager();
const campaigns = new CampaignRunner(sessions);
const app = express();
// Bulk campaigns carry every number and its message in one request.
app.use(express.json({ limit: "8mb" }));

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
  const phone = typeof req.body?.phone === "string" && req.body.phone.trim() ? req.body.phone : undefined;
  res.json({ success: true, ...(await sessions.start(req.params.orgId, phone)) });
}));

// Platform page: every number this server knows and why it last dropped.
app.get("/sessions", wrap(async (_req, res) => {
  res.json({ success: true, sessions: sessions.listStatus() });
}));

// Bills that failed while the number was unlinked: sent again one by one, results posted to APP_EVENT_URL.
app.post("/sessions/:orgId/resend", wrap(async (req, res) => {
  const jobs = Array.isArray(req.body?.jobs) ? (req.body.jobs as ResendJob[]).slice(0, 300) : [];
  res.json({ success: true, queued: sessions.queueResend(req.params.orgId, jobs) });
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

app.get("/sessions/:orgId/groups", wrap(async (req, res) => {
  res.json({ success: true, groups: await sessions.groups(req.params.orgId) });
}));

app.post("/sessions/:orgId/check-number", wrap(async (req, res) => {
  const exists = await sessions.checkNumber(req.params.orgId, String(req.body?.phone ?? ""));
  res.json({ success: true, exists });
}));

app.post("/sessions/:orgId/check-numbers", wrap(async (req, res) => {
  const phones = Array.isArray(req.body?.phones) ? (req.body.phones as unknown[]).map(String) : [];
  const onWhatsApp = await sessions.checkNumbers(req.params.orgId, phones);
  res.json({ success: true, onWhatsApp });
}));

app.post("/sessions/:orgId/save-contacts", wrap(async (req, res) => {
  const list = Array.isArray(req.body?.contacts) ? (req.body.contacts as { phone?: unknown; name?: unknown }[]) : [];
  const contacts = list.map((c) => ({ phone: String(c?.phone ?? ""), name: String(c?.name ?? "") }));
  res.json({ success: true, ...(await sessions.saveContacts(req.params.orgId, contacts)) });
}));

// A bill customer: save as contact and/or add to the shop's chosen group (invite link when privacy blocks it).
app.post("/sessions/:orgId/join-customer", wrap(async (req, res) => {
  const b = req.body ?? {};
  res.json({
    success: true,
    ...(await sessions.joinCustomer(req.params.orgId, {
      phone: String(b.phone ?? ""),
      name: b.name ? String(b.name) : undefined,
      saveContact: b.saveContact === true,
      groupId: b.groupId ? String(b.groupId) : undefined,
      inviteFallback: b.inviteFallback === true,
      inviteText: b.inviteText ? String(b.inviteText).slice(0, 500) : undefined,
    })),
  });
}));

// ---- Bulk WhatsApp campaigns (sessions "u_<userId>") ----
app.post("/campaigns", wrap(async (req, res) => {
  res.json({ success: true, ...campaigns.create(req.body ?? {}) });
}));

app.post("/campaigns/drop-number", wrap(async (req, res) => {
  res.json({ success: true, ...campaigns.dropNumber(req.body ?? {}) });
}));

app.get("/campaigns/:id", wrap(async (req, res) => {
  res.json({ success: true, ...campaigns.get(req.params.id) });
}));

app.post("/campaigns/:id/reschedule", wrap(async (req, res) => {
  res.json({ success: true, ...campaigns.reschedule(req.params.id, req.body ?? {}) });
}));

app.post("/campaigns/:id/:action(pause|resume|stop)", wrap(async (req, res) => {
  const action = req.params.action as "pause" | "resume" | "stop";
  res.json({ success: true, ...campaigns.setStatus(req.params.id, action) });
}));

// ---- Volume upkeep: per-customer key files pile up with every bill / campaign message ----
const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const DATA_DIR = path.dirname(AUTH_DIR);
/** Customer key files unused this long are removed (WhatsApp rebuilds them on the next message). */
const KEEP_DAYS = Math.max(3, Number(process.env.KEEP_CUSTOMER_KEYS_DAYS ?? 30) || 30);
const UPKEEP_EVERY_MS = 6 * 60 * 60 * 1000;

function upkeep(reason: string, videos = true) {
  try {
    const low = diskLow(diskUsage(DATA_DIR));
    const freed = sessions.cleanStorage(low ? 3 : KEEP_DAYS);
    const oldVideos = videos ? campaigns.cleanVideos() : 0;
    const after = diskUsage(DATA_DIR);
    console.log(
      `Storage (${reason}): ${describeDisk(after)}; removed ${freed.files} old customer files, ` +
        `${freed.folders} unlinked number folders, ${oldVideos} old videos`,
    );
    if (reason === "startup" || diskLow(after)) {
      const line =
        `Biggest number folders: ${describeFolders(folderFileCounts(AUTH_DIR)) || "none"}. ` +
        `Files by kind: ${fileKinds(AUTH_DIR) || "none"}`;
      if (diskLow(after)) console.error(`Storage almost full. ${line}`);
      else console.log(line);
    }
  } catch (e) {
    console.error(`Storage upkeep failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

app.listen(PORT, () => {
  console.log(`wa-gateway listening on :${PORT}`);
  // Before any number reconnects, so nothing is being written while old files go. Videos wait until
  // the saved campaigns are loaded, so a running campaign keeps its encoded video.
  upkeep("startup", false);
  setInterval(() => upkeep("every 6 hours"), UPKEEP_EVERY_MS).unref();
  void sessions.restoreAll().then(() => {
    campaigns.restoreAll();
    campaigns.cleanVideos();
  });
});

// Railway sends SIGTERM before replacing the server on a redeploy: close the WhatsApp links cleanly first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log(`${signal}: closing WhatsApp links (they stay linked and reconnect after the restart)`);
    void sessions.shutdown().finally(() => process.exit(0));
  });
}
