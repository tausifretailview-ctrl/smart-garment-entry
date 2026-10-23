import fs from "node:fs";
import path from "node:path";
import pino from "pino";
import { type BulkContent, type InboxEvent, type ReceiptStatus, type SessionManager } from "./sessions.js";
import { removeCampaignVideos, shrinkVideo, type VideoQuality } from "./video.js";
import { pruneVideos } from "./storage.js";

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
  /** Videos only: re-encode to 480p / 720p before sending. Missing = send as uploaded. */
  quality?: VideoQuality;
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
  /** Scheduled campaigns: nothing is sent before this time (ISO). */
  startAt?: string;
}

const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const CAMPAIGN_DIR = process.env.CAMPAIGN_DIR ?? path.join(path.dirname(AUTH_DIR), "campaigns");
const VIDEO_DIR = path.join(CAMPAIGN_DIR, "videos");
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
/** Schedules reach at most this far ahead (setTimeout tops out near 24 days). */
const MAX_SCHEDULE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
/** A video that is made smaller may start bigger than WhatsApp's 16 MB. */
const MAX_VIDEO_SOURCE_BYTES = 50 * 1024 * 1024;
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A chat the app said is not a bulk customer is not reported again for this long. */
const INBOX_IGNORE_MS = 30 * 60 * 1000;

/** {name} → the contact's name, or "Customer" when the number has no name. */
const fillName = (message: string, name: string) => message.replace(/\{\s*name\s*\}/gi, name.trim() || "Customer");

export class CampaignRunner {
  private jobs = new Map<string, CampaignJob>();
  private workers = new Set<string>();
  private timers = new Map<string, NodeJS.Timeout>();
  private media = new Map<string, BulkContent["media"]>();
  private receipts: { messageId: string; status: ReceiptStatus; at: string }[] = [];
  /** "sessionId:phone" → until when: chats with people who never got a bulk message (friends, family). */
  private inboxIgnore = new Map<string, number>();

  constructor(private sessions: SessionManager) {
    console.log(`Bulk WhatsApp results go to ${APP_BULK_URL || "(not set)"}`);
    sessions.onReceipt = (_sessionId, messageId, status) => {
      this.receipts.push({ messageId, status, at: new Date().toISOString() });
    };
    sessions.onOptOut = (sessionId, phone, subscribe) => void this.optOut(sessionId, phone, subscribe);
    sessions.onInbox = (sessionId, event) => void this.inbox(sessionId, event);
    setInterval(() => void this.flushReceipts(), 5000);
  }

  /**
   * STOP: the app records the unsubscribe and this number is dropped from campaigns still sending.
   * START undoes it. Either way the customer gets a one-line confirmation.
   */
  private async optOut(sessionId: string, phone: string, subscribe: boolean) {
    await this.post({ action: "gateway-optout", sessionId, phone, subscribe, at: new Date().toISOString() });
    if (!subscribe) {
      for (const job of this.jobs.values()) {
        if (job.sessionId !== sessionId) continue;
        let changed = false;
        for (const item of job.items) {
          if (item.done || item.phone !== phone) continue;
          item.done = true;
          changed = true;
          void this.post({
            action: "gateway-result",
            campaignId: job.campaignId,
            recipientId: item.recipientId,
            status: "skipped",
            messageId: null,
            error: "Unsubscribed",
            at: new Date().toISOString(),
          }, job.reportUrl);
        }
        if (changed) this.save(job);
      }
    }
    try {
      await this.sessions.sendText(
        sessionId,
        phone,
        subscribe
          ? "You are subscribed again. Reply STOP anytime to stop these messages."
          : "You are unsubscribed. You will not get these offer messages again. Reply START to subscribe again.",
      );
    } catch (e) {
      logger.warn({ err: e }, "opt-out confirmation failed");
    }
  }

  /**
   * Messages in a bulk number's chats go to the app's Inbox. The app keeps only chats with customers
   * this number sent bulk messages to; for anyone else it answers tracked: false and their chat is
   * skipped for a while, so a shop's personal chats do not reach the app again and again.
   */
  private async inbox(sessionId: string, event: InboxEvent) {
    const key = `${sessionId}:${event.phone}`;
    const until = this.inboxIgnore.get(key);
    if (until && until > Date.now()) return;
    const url = this.lastReportUrl || APP_BULK_URL;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({ action: "gateway-inbox", sessionId, ...event }),
      });
      const data = (await res.json().catch(() => ({}))) as { tracked?: boolean };
      if (res.ok && data.tracked === false) {
        this.inboxIgnore.set(key, Date.now() + INBOX_IGNORE_MS);
        if (this.inboxIgnore.size > 5000) this.inboxIgnore.delete(this.inboxIgnore.keys().next().value as string);
      }
    } catch (e) {
      logger.warn({ err: e }, "inbox forward failed");
    }
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

  private async post(body: Record<string, unknown>, reportUrl?: string): Promise<boolean> {
    const url = reportUrl || this.lastReportUrl || APP_BULK_URL;
    if (!url) {
      console.error("Bulk WhatsApp: no report URL, results cannot reach the app");
      return false;
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
          body: JSON.stringify(body),
        });
        if (res.ok) return true;
        console.error(`Bulk WhatsApp report rejected (${res.status}): ${(await res.text()).slice(0, 300)}`);
      } catch (e) {
        console.error(`Bulk WhatsApp report failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(2000 * (attempt + 1));
    }
    return false;
  }

  private flushing = false;
  private async flushReceipts() {
    if (this.flushing || !this.receipts.length) return;
    this.flushing = true;
    try {
      const batch = this.receipts.splice(0, 200);
      // Kept for the next round when the app cannot be reached, so delivered / read ticks are not lost.
      if (!(await this.post({ action: "gateway-receipts", receipts: batch }))) {
        this.receipts.unshift(...batch);
        if (this.receipts.length > 20_000) this.receipts.splice(0, this.receipts.length - 20_000);
      }
    } finally {
      this.flushing = false;
    }
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
        this.wakeAtStart(job);
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
      const quality = kind === "video" && (m.quality === "small" || m.quality === "medium") ? m.quality : undefined;
      media = { url: url.toString(), mimetype: String(m.mimetype ?? "image/jpeg"), filename: String(m.filename ?? "poster"), kind, quality };
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
    let startAt: string | undefined;
    if (input.startAt) {
      const at = Date.parse(String(input.startAt));
      if (!Number.isFinite(at)) throw new Error("Invalid start time");
      if (at - Date.now() > MAX_SCHEDULE_MS) throw new Error("Schedule at most 14 days ahead");
      if (at > Date.now()) startAt = new Date(at).toISOString();
    }
    const job: CampaignJob = {
      campaignId, sessionId, status: "running", media, minGapMs, maxGapMs, items, createdAt: new Date().toISOString(),
      reportUrl, startAt,
    };
    this.jobs.set(campaignId, job);
    this.save(job);
    this.kick(sessionId);
    this.wakeAtStart(job);
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

  /** Scheduled job: start its number's worker when the time comes. */
  private wakeAtStart(job: CampaignJob) {
    const wait = job.startAt ? Date.parse(job.startAt) - Date.now() : 0;
    if (wait <= 0) return;
    clearTimeout(this.timers.get(job.campaignId));
    this.timers.set(
      job.campaignId,
      setTimeout(() => {
        this.timers.delete(job.campaignId);
        if (job.status === "running") this.kick(job.sessionId);
      }, wait + 1000),
    );
  }

  /** Encoded videos of campaigns no longer on this server (finished, or lost before a restart). */
  cleanVideos(): number {
    return pruneVideos(VIDEO_DIR, new Set(this.jobs.keys()));
  }

  private finish(job: CampaignJob) {
    clearTimeout(this.timers.get(job.campaignId));
    this.timers.delete(job.campaignId);
    this.jobs.delete(job.campaignId);
    this.media.delete(job.campaignId);
    fs.rmSync(this.file(job.campaignId), { force: true });
    removeCampaignVideos(VIDEO_DIR, job.campaignId);
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
      .filter((j) => j.sessionId === sessionId && j.status === "running" && !this.waitingForStart(j))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  private waitingForStart(job: CampaignJob) {
    return Boolean(job.startAt && Date.parse(job.startAt) > Date.now());
  }

  /** Checks the poster once per campaign; the send itself goes by URL so WhatsApp gets one upload. */
  private async loadMedia(job: CampaignJob): Promise<BulkContent["media"]> {
    if (!job.media) return undefined;
    const cached = this.media.get(job.campaignId);
    if (cached) return cached;
    if (job.media.kind === "video" && job.media.quality) {
      const file = await shrinkVideo({
        url: job.media.url,
        quality: job.media.quality,
        dir: VIDEO_DIR,
        id: job.campaignId,
        maxSourceBytes: MAX_VIDEO_SOURCE_BYTES,
      });
      // A file path: Baileys reads it from disk and caches the upload under this path.
      const small = { url: file, mimetype: "video/mp4", filename: job.media.filename, kind: "video" as const };
      this.media.set(job.campaignId, small);
      return small;
    }
    const resp = await fetch(job.media.url);
    // Only the headers are needed here; Baileys downloads the file itself on the first send.
    await resp.body?.cancel().catch(() => undefined);
    if (!resp.ok) throw new Error(`Could not download the poster (${resp.status})`);
    if (Number(resp.headers.get("content-length") ?? 0) > MAX_MEDIA_BYTES) {
      throw new Error("Poster file is too large (max 16 MB)");
    }
    const loaded = { url: job.media.url, mimetype: job.media.mimetype, filename: job.media.filename, kind: job.media.kind };
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
      if (job.startAt) {
        // Scheduled time reached: clear the "Starts at" note in the app.
        delete job.startAt;
        this.save(job);
        this.report(job, null);
      }

      // Number unlinked or offline, or today's cap used up: wait without failing anyone.
      let note: string | null = null;
      if (!this.sessions.isConnected(sessionId)) note = this.sessions.offlineNote(sessionId);
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
      const encoding = job.media?.kind === "video" && job.media.quality && !this.media.has(job.campaignId);
      if (encoding) this.report(job, "Making the video smaller before sending");
      try {
        media = await this.loadMedia(job);
      } catch (e) {
        job.status = "failed";
        this.report(job, e instanceof Error ? e.message : "Poster download failed");
        this.finish(job);
        continue;
      }
      if (encoding) this.report(job, null);
      // Paused or stopped while the video was being made smaller.
      if (job.status !== "running") continue;

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
          // Now a bulk customer: their reply belongs in the Inbox even if an earlier chat was skipped.
          this.inboxIgnore.delete(`${sessionId}:${item.phone}`);
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
