import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";

export type SessionStatus = "connected" | "connecting" | "qr" | "disconnected" | "logged_out";

interface Session {
  sock: WASocket | null;
  status: SessionStatus;
  qr: string | null;
  number: string | null;
  starting: boolean;
  sentToday: number;
  day: string;
  lastSendAt: number;
  queue: Promise<unknown>;
  retries: number;
  /** Set by logout so a closing socket never reconnects. */
  stopped: boolean;
}

const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const APP_EVENT_URL = process.env.APP_EVENT_URL ?? "";
/** Customer replies (text) are posted here, e.g. https://<project>.supabase.co/functions/v1/whatsapp-webhook */
const APP_INBOUND_URL = process.env.APP_INBOUND_URL ?? "";
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
const MAX_PER_DAY = Number(process.env.MAX_MSGS_PER_DAY ?? 300);
/** Bulk WhatsApp: each user links their own number (session id "u_<userId>") with its own daily cap. */
const MAX_BULK_PER_DAY = Number(process.env.MAX_BULK_MSGS_PER_DAY ?? 500);
const MIN_GAP_MS = 2000;
const MAX_GAP_MS = 5000;
/** Shop (bill) sessions are keyed by organization id; Bulk WhatsApp sessions by "u_" + user id. */
const SESSION_ID_RE = /^(u_)?[0-9a-fA-F-]{36}$/;
export const isUserSession = (id: string) => id.startsWith("u_");
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Digits only; 10-digit numbers get India's 91 (same rule as the edge function). */
export function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  if (full.length < 10) throw new Error("Invalid phone number");
  return `${full}@s.whatsapp.net`;
}

/** Message content for bulk sends: text alone, or a poster/file with the text as its caption. */
export interface BulkContent {
  text: string;
  media?: { buffer: Buffer; mimetype: string; filename: string; kind: "image" | "video" | "document" };
}

export type ReceiptStatus = "delivered" | "read";

export class SessionManager {
  private sessions = new Map<string, Session>();
  /** Delivery / read ticks for messages sent from Bulk WhatsApp sessions. */
  onReceipt: ((sessionId: string, messageId: string, status: ReceiptStatus) => void) | null = null;

  private assertOrg(orgId: string) {
    if (!SESSION_ID_RE.test(orgId)) throw new Error("Invalid session id");
  }

  private dailyCap(id: string) {
    return isUserSession(id) ? MAX_BULK_PER_DAY : MAX_PER_DAY;
  }

  private get(orgId: string): Session {
    let s = this.sessions.get(orgId);
    if (!s) {
      s = {
        sock: null, status: "disconnected", qr: null, number: null, starting: false,
        sentToday: 0, day: today(), lastSendAt: 0, queue: Promise.resolve(), retries: 0, stopped: false,
      };
      this.sessions.set(orgId, s);
    }
    return s;
  }

  private dir(orgId: string) {
    return path.join(AUTH_DIR, orgId);
  }

  private async notify(orgId: string, s: Session) {
    // Bulk WhatsApp sessions are not the shop's bill number: the page polls their status instead.
    if (!APP_EVENT_URL || isUserSession(orgId)) return;
    try {
      await fetch(APP_EVENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          action: "gateway-event",
          organizationId: orgId,
          status: s.status,
          connectedNumber: s.number,
        }),
      });
    } catch (e) {
      logger.warn({ err: e }, "notify failed");
    }
  }

  async restoreAll() {
    if (!fs.existsSync(AUTH_DIR)) return;
    for (const orgId of fs.readdirSync(AUTH_DIR)) {
      // Only numbers that finished linking; an abandoned QR leaves no creds.json worth restoring.
      if (!SESSION_ID_RE.test(orgId) || !fs.existsSync(path.join(this.dir(orgId), "creds.json"))) continue;
      await this.connect(orgId).catch((e) => logger.warn({ err: e }, "restore failed"));
    }
  }

  private async connect(orgId: string) {
    const s = this.get(orgId);
    if (s.starting || s.sock) return; // already open, linking, or connecting
    s.starting = true;
    s.stopped = false;
    s.status = "connecting";
    try {
      fs.mkdirSync(this.dir(orgId), { recursive: true });
      const { state, saveCreds } = await useMultiFileAuthState(this.dir(orgId));
      const { version } = await fetchLatestBaileysVersion();
      const sock = makeWASocket({
        version,
        auth: state,
        logger: logger as never,
        printQRInTerminal: false,
        browser: ["Ezzy ERP", "Chrome", "1.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      s.sock = sock;
      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        if (type !== "notify") return;
        for (const m of messages) void this.forwardInbound(orgId, m);
      });
      if (isUserSession(orgId)) {
        // WhatsApp status: 3 = delivered (two grey ticks), 4 = read, 5 = played (voice/video seen).
        sock.ev.on("messages.update", (updates) => {
          for (const { key, update } of updates) {
            const st = update.status;
            if (!key.fromMe || !key.id || typeof st !== "number" || st < 3) continue;
            this.onReceipt?.(orgId, key.id, st >= 4 ? "read" : "delivered");
          }
        });
      }
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          s.status = "qr";
        }
        if (connection === "open") {
          s.status = "connected";
          s.qr = null;
          s.retries = 0;
          s.number = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
          await this.notify(orgId, s);
        } else if (connection === "close") {
          if (s.sock !== sock) return; // an older socket closing after a restart
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          s.sock = null;
          s.qr = null;
          const linked = Boolean(state.creds.me?.id);
          if (code === DisconnectReason.loggedOut) {
            s.status = "logged_out";
            s.number = null;
            fs.rmSync(this.dir(orgId), { recursive: true, force: true });
            await this.notify(orgId, s);
          } else if (s.stopped) {
            s.status = "logged_out";
          } else if (!linked) {
            // QR expired without a scan: stop here instead of making new QR codes forever.
            s.status = "disconnected";
            fs.rmSync(this.dir(orgId), { recursive: true, force: true });
          } else if (code === DisconnectReason.restartRequired) {
            // Normal right after a scan: WhatsApp asks for one restart before the link opens.
            s.status = "connecting";
            setTimeout(() => {
              if (!s.stopped) void this.connect(orgId).catch(() => undefined);
            }, 500);
          } else {
            s.status = "disconnected";
            // Network drop or WhatsApp restart: back off up to 1 min between tries.
            const delay = Math.min(60_000, 5000 * 2 ** s.retries);
            s.retries++;
            if (s.retries === 1) await this.notify(orgId, s);
            setTimeout(() => {
              if (!s.stopped) void this.connect(orgId).catch(() => undefined);
            }, delay);
          }
        }
      });
    } catch (e) {
      s.status = "disconnected";
      throw e;
    } finally {
      s.starting = false;
    }
  }

  /** Customer text replies go to the app (review "OK" → stars flow). Groups, status and own messages are skipped. */
  private async forwardInbound(orgId: string, m: WAMessage) {
    // Replies to bulk messages are not bill reviews: only the shop session feeds the review flow.
    if (!APP_INBOUND_URL || m.key.fromMe || isUserSession(orgId)) return;
    const key = m.key as WAMessage["key"] & { senderPn?: string; remoteJidAlt?: string };
    let jid = key.remoteJid ?? "";
    if (jid.endsWith("@lid")) jid = key.senderPn || key.remoteJidAlt || "";
    if (!jid.endsWith("@s.whatsapp.net")) return;
    const msg = m.message;
    const text = (
      msg?.conversation ||
      msg?.extendedTextMessage?.text ||
      msg?.buttonsResponseMessage?.selectedDisplayText ||
      msg?.listResponseMessage?.title ||
      ""
    ).trim();
    if (!text) return;
    try {
      await fetch(APP_INBOUND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
        body: JSON.stringify({
          event: "ezzy-gateway-inbound",
          organizationId: orgId,
          from: jid.split("@")[0],
          text: text.slice(0, 1000),
          messageId: key.id ?? null,
          senderName: m.pushName ?? null,
        }),
      });
    } catch (e) {
      logger.warn({ err: e }, "inbound forward failed");
    }
  }

  async start(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    await this.connect(orgId); // no-op while a socket is open; the QR refreshes on its own
    // Give Baileys a moment to emit the first QR
    for (let i = 0; i < 40 && s.status !== "qr" && s.status !== "connected"; i++) await sleep(250);
    return this.status(orgId);
  }

  async status(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    return { status: s.status, qr: s.qr, connectedNumber: s.number };
  }

  async logout(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    s.stopped = true;
    try {
      await s.sock?.logout();
    } catch {
      /* already closed */
    }
    s.sock = null;
    s.status = "logged_out";
    s.qr = null;
    s.number = null;
    fs.rmSync(this.dir(orgId), { recursive: true, force: true });
  }

  private ready(orgId: string): Session {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    if (s.status !== "connected" || !s.sock) throw new Error("WhatsApp session is not connected");
    return s;
  }

  isConnected(id: string): boolean {
    const s = this.sessions.get(id);
    return Boolean(s && s.status === "connected" && s.sock);
  }

  /** Messages this number can still send today (resets at 00:00 UTC). */
  remainingToday(id: string): number {
    const s = this.get(id);
    if (s.day !== today()) return this.dailyCap(id);
    return Math.max(0, this.dailyCap(id) - s.sentToday);
  }

  /** Serialize sends per org with a random human-like gap and a daily cap (ban protection). */
  private enqueue<T>(s: Session, job: () => Promise<T>, cap = MAX_PER_DAY): Promise<T> {
    const run = async () => {
      if (s.day !== today()) {
        s.day = today();
        s.sentToday = 0;
      }
      if (s.sentToday >= cap) throw new Error(`Daily send limit (${cap}) reached`);
      const gap = MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS);
      const wait = s.lastSendAt + gap - Date.now();
      if (wait > 0) await sleep(wait);
      const result = await job();
      s.sentToday++;
      s.lastSendAt = Date.now();
      return result;
    };
    const next = s.queue.then(run, run);
    s.queue = next.catch(() => undefined);
    return next;
  }

  async sendText(orgId: string, phone: string, message: string) {
    const s = this.ready(orgId);
    if (!message.trim()) throw new Error("message is required");
    const jid = toJid(phone);
    return this.enqueue(s, async () => {
      const res = await s.sock!.sendMessage(jid, { text: message });
      return res?.key?.id ?? null;
    });
  }

  async sendFile(orgId: string, phone: string, fileUrl: string, filename: string, caption?: string) {
    const s = this.ready(orgId);
    const jid = toJid(phone);
    const url = new URL(fileUrl);
    if (url.protocol !== "https:") throw new Error("fileUrl must be https");
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Could not download file (${resp.status})`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length > 16 * 1024 * 1024) throw new Error("File too large");
    return this.enqueue(s, async () => {
      const res = await s.sock!.sendMessage(jid, {
        document: buffer,
        mimetype: resp.headers.get("content-type")?.split(";")[0] || "application/pdf",
        fileName: filename,
        caption,
      });
      return res?.key?.id ?? null;
    });
  }

  /** One bulk message; the campaign runner waits its own (longer) random gap between calls. */
  async sendBulk(id: string, phone: string, content: BulkContent): Promise<string | null> {
    const s = this.ready(id);
    const jid = toJid(phone);
    return this.enqueue(
      s,
      async () => {
        const { text, media } = content;
        const msg = !media
          ? { text }
          : media.kind === "image"
            ? { image: media.buffer, mimetype: media.mimetype, caption: text || undefined }
            : media.kind === "video"
              ? { video: media.buffer, mimetype: media.mimetype, caption: text || undefined }
              : { document: media.buffer, mimetype: media.mimetype, fileName: media.filename, caption: text || undefined };
        const res = await s.sock!.sendMessage(jid, msg);
        return res?.key?.id ?? null;
      },
      this.dailyCap(id),
    );
  }

  async checkNumber(orgId: string, phone: string): Promise<boolean> {
    const s = this.ready(orgId);
    const [result] = (await s.sock!.onWhatsApp(toJid(phone))) ?? [];
    return Boolean(result?.exists);
  }
}
