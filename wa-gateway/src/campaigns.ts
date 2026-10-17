import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { type BulkContent, type ReceiptStatus, type SessionManager } from "./sessions.js";

/**
 * Bulk WhatsApp campaigns. Each job is saved on the volume and sent one number at a time with a
 * random gap, so closing the browser or restarting the server does not stop it. Per-number results
 * and delivery / read ticks are posted to the app (edge function bulk-whatsapp).
 */

export type CampaignStatus = "running" | "paused" | "stopped" | "completed" | "failed";

interface CampaignItem {
  recipientId: string;
  phone: string;
  text: string;
  done: boolean;
}

interface CampaignMedia {
  url: string;
  mimetype: string;
  filename: string;
  kind: "image" | "video" | "document";
}

interface CampaignJob {
  campaignId: string;
  sessionId: string;
  status: CampaignStatus;
  media: CampaignMedia | null;
  minGapMs: number;
  maxGapMs: number;
  items: CampaignItem[];
  createdAt: string;
  /** Where results go, sent by the bulk-whatsapp function itself (no server setting needed). */
  reportUrl?: string;
}

const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const CAMPAIGN_DIR = process.env.CAMPAIGN_DIR ?? path.join(path.dirname(AUTH_DIR), "campaigns");
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
/** Defaults to the bulk-whatsapp function next to whatsapp-gateway-proxy, so no new setting is needed. */
const APP_BULK_URL = process.env.APP_BULK_URL || bulkUrlFrom(process.env.APP_EVENT_URL || process.env.APP_INBOUND_URL);

/** https://<project>.supabase.co/functions/v1/<any> → .../functions/v1/bulk-whatsapp */
function bulkUrlFrom(other: string | undefined): string {
  try {
    return other ? `${new URL(other).origin}/functions/v1/bulk-whatsapp` : "";
  } catch {
    return "";
  }
}
const ID_RE = /^[0-9a-fA-F-]{36}$/;
const MAX_ITEMS = 5000;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** {name} → the contact's name, or "Customer" when the number has no name. */
const fillName = (message: string, name: string) => message.replace(/\{\s*name\s*\}/gi, name.trim() || "Customer");

export class CampaignRunner {
  private jobs = new Map<string, CampaignJob>();
  private workers = new Set<string>();
  private media = new Map<string, BulkContent["media"]>();
  private receipts: { messageId: string; status: ReceiptStatus; at: string }[] = [];

  constructor(private sessions: SessionManager) {
    console.log(`Bulk WhatsApp results go to ${APP_BULK_URL || "(not set)"}`);
    sessions.onReceipt = (_sessionId, messageId, status) => {
      this.receipts.push({ messageId, status, at: new Date().toISOString() });
    };
    setInterval(() => void this.flushReceipts(), 5000);
  }

  private file(id: string) {
    return path.join(CAMPAIGN_DIR, `${id}.json`);
  }

  private save(job: CampaignJob) {
    fs.mkdirSync(CAMPAIGN_DIR, { recursive: true });
    const tmp = `${this.file(job.campaignId)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(job));
    fs.renameSync(tmp, this.file(job.campaignId));
  }

  /** Last report URL a campaign brought; delivery / read ticks are not tied to one campaign. */
  private lastReportUrl = "";

  private async post(body: Record<string, unknown>, reportUrl?: string) {
    const url = reportUrl || this.lastReportUrl || APP_BULK_URL;
    if (!url) {
      console.error("Bulk WhatsApp: no report URL, results cannot reach the app");
      return;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify(body),
        });
        if (res.ok) return;
        console.error(`Bulk WhatsApp report rejected (${res.status}): ${(await res.text()).slice(0, 300)}`);
      } catch (e) {
        console.error(`Bulk WhatsApp report failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(2000 * (attempt + 1));
    }
  }

  private async flushReceipts() {
    if (!this.receipts.length) return;
    const batch = this.receipts.splice(0, 200);
    await this.post({ action: "gateway-receipts", receipts: batch });
  }

  private report(job: CampaignJob, note: string | null = null) {
    void this.post({ action: "gateway-campaign", campaignId: job.campaignId, status: job.status, note }, job.reportUrl);
  }

  /** Reload saved jobs after a restart; running ones continue once their number reconnects. */
  restoreAll() {
    if (!fs.existsSync(CAMPAIGN_DIR)) return;
    for (const f of fs.readdirSync(CAMPAIGN_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const job = JSON.parse(fs.readFileSync(path.join(CAMPAIGN_DIR, f), "utf8")) as CampaignJob;
        if (job.status === "completed" || job.status === "stopped" || job.status === "failed") {
          fs.rmSync(path.join(CAMPAIGN_DIR, f), { force: true });
          continue;
        }
        this.jobs.set(job.campaignId, job);
        if (job.reportUrl) this.lastReportUrl = job.reportUrl;
        if (job.status === "running") this.kick(job.sessionId);
      } catch (e) {
        logger.warn({ err: e, f }, "bad campaign file");
      }
    }
  }

  create(input: Record<string, unknown>) {
    const campaignId = String(input.campaignId ?? "");
    const sessionId = String(input.sessionId ?? "");
    if (!ID_RE.test(campaignId)) throw new Error("Invalid campaign id");
    if (!/^u_[0-9a-fA-F-]{36}$/.test(sessionId)) throw new Error("Invalid session id");
    if (this.jobs.has(campaignId)) throw new Error("Campaign already exists");
    const rawItems = Array.isArray(input.items) ? input.items : [];
    if (!rawItems.length) throw new Error("No numbers to send to");
    if (rawItems.length > MAX_ITEMS) throw new Error(`At most ${MAX_ITEMS} numbers per campaign`);
    const message = String(input.message ?? "");
    const items: CampaignItem[] = rawItems.map((r) => {
      const it = r as Record<string, unknown>;
      return {
        recipientId: String(it.recipientId ?? ""),
        phone: String(it.phone ?? ""),
        text: fillName(message, String(it.name ?? "")),
        done: false,
      };
    });
    let media: CampaignMedia | null = null;
    const m = input.media as Record<string, unknown> | null | undefined;
    if (m && m.url) {
      const url = new URL(String(m.url));
      if (url.protocol !== "https:") throw new Error("Media URL must be https");
      const kind = m.kind === "video" || m.kind === "document" ? m.kind : "image";
      media = { url: url.toString(), mimetype: String(m.mimetype ?? "image/jpeg"), filename: String(m.filename ?? "poster"), kind };
    }
    if (!media && items.every((i) => !i.text.trim())) throw new Error("Message or poster is required");
    const minGapMs = Math.max(3000, Number(input.minGapMs ?? 8000));
    const maxGapMs = Math.max(minGapMs, Number(input.maxGapMs ?? 20000));
    let reportUrl: string | undefined;
    if (input.reportUrl) {
      const u = new URL(String(input.reportUrl));
      if (u.protocol !== "https:") throw new Error("reportUrl must be https");
      reportUrl = u.toString();
      this.lastReportUrl = reportUrl;
    }
    const job: CampaignJob = {
      campaignId, sessionId, status: "running", media, minGapMs, maxGapMs, items, createdAt: new Date().toISOString(),
      reportUrl,
    };
    this.jobs.set(campaignId, job);
    this.save(job);
    this.kick(sessionId);
    return this.summary(job);
  }

  private find(campaignId: string) {
    const job = this.jobs.get(campaignId);
    if (!job) throw new Error("Campaign not found on the WhatsApp server");
    return job;
  }

  private summary(job: CampaignJob) {
    const done = job.items.filter((i) => i.done).length;
    return { campaignId: job.campaignId, status: job.status, done, total: job.items.length };
  }

  get(campaignId: string) {
    return this.summary(this.find(campaignId));
  }

  setStatus(campaignId: string, action: "pause" | "resume" | "stop") {
    const job = this.find(campaignId);
    if (job.status === "completed" || job.status === "stopped" || job.status === "failed") return this.summary(job);
    job.status = action === "pause" ? "paused" : action === "stop" ? "stopped" : "running";
    this.save(job);
    if (job.status === "stopped") this.finish(job);
    if (job.status === "running") this.kick(job.sessionId);
    return this.summary(job);
  }

  private finish(job: CampaignJob) {
    this.jobs.delete(job.campaignId);
    this.media.delete(job.campaignId);
    fs.rmSync(this.file(job.campaignId), { force: true });
  }

  /** One worker per linked number: its campaigns go out in the order they were created. */
  private kick(sessionId: string) {
    if (this.workers.has(sessionId)) return;
    this.workers.add(sessionId);
    void this.work(sessionId)
      .catch((e) => logger.error({ err: e }, "campaign worker crashed"))
      .finally(() => this.workers.delete(sessionId));
  }

  private nextJob(sessionId: string) {
    return [...this.jobs.values()]
      .filter((j) => j.sessionId === sessionId && j.status === "running")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  private async loadMedia(job: CampaignJob): Promise<BulkContent["media"]> {
    if (!job.media) return undefined;
    const cached = this.media.get(job.campaignId);
    if (cached) return cached;
    const resp = await fetch(job.media.url);
    if (!resp.ok) throw new Error(`Could not download the poster (${resp.status})`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) throw new Error("Poster file is too large (max 16 MB)");
    const loaded = { buffer, mimetype: job.media.mimetype, filename: job.media.filename, kind: job.media.kind };
    this.media.set(job.campaignId, loaded);
    return loaded;
  }

  /** Waits up to ms, returning early when the job is no longer running (pause / stop). */
  private async gap(job: CampaignJob, ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end && job.status === "running") await sleep(Math.min(1000, end - Date.now()));
  }

  private async work(sessionId: string) {
    let waitingNote: string | null = null;
    for (;;) {
      const job = this.nextJob(sessionId);
      if (!job) return;

      // Number unlinked or offline, or today's cap used up: wait without failing anyone.
      let note: string | null = null;
      if (!this.sessions.isConnected(sessionId)) note = "Waiting for your WhatsApp to reconnect";
      else if (this.sessions.remainingToday(sessionId) <= 0) note = "Daily limit reached; continues tomorrow";
      if (note) {
        if (note !== waitingNote) this.report(job, note);
        waitingNote = note;
        await sleep(15_000);
        continue;
      }
      if (waitingNote) this.report(job, null);
      waitingNote = null;

      let media: BulkContent["media"];
      try {
        media = await this.loadMedia(job);
      } catch (e) {
        job.status = "failed";
        this.report(job, e instanceof Error ? e.message : "Poster download failed");
        this.finish(job);
        continue;
      }

      const item = job.items.find((i) => !i.done);
      if (!item) {
        job.status = "completed";
        this.report(job);
        this.finish(job);
        continue;
      }

      let status: "sent" | "failed" = "failed";
      let messageId: string | null = null;
      let error: string | null = null;
      try {
        if (!(await this.sessions.checkNumber(sessionId, item.phone))) {
          error = "Not on WhatsApp";
        } else {
          messageId = await this.sessions.sendBulk(sessionId, item.phone, { text: item.text, media });
          status = "sent";
        }
      } catch (e) {
        error = e instanceof Error ? e.message : "Send failed";
        // Lost connection mid-send: leave this number for the retry once WhatsApp is back.
        if (!this.sessions.isConnected(sessionId)) continue;
      }
      item.done = true;
      this.save(job);
      void this.post({
        action: "gateway-result",
        campaignId: job.campaignId,
        recipientId: item.recipientId,
        status,
        messageId,
        error,
        at: new Date().toISOString(),
      }, job.reportUrl);

      // Random human-like gap only after a real send; "not on WhatsApp" checks need no wait.
      if (status === "sent" && job.items.some((i) => !i.done)) {
        await this.gap(job, job.minGapMs + Math.random() * (job.maxGapMs - job.minGapMs));
      }
    }
  }
}
