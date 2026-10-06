import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
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
}

const AUTH_DIR = process.env.AUTH_DIR ?? "./data/sessions";
const APP_EVENT_URL = process.env.APP_EVENT_URL ?? "";
const API_KEY = process.env.GATEWAY_API_KEY ?? "";
const MAX_PER_DAY = Number(process.env.MAX_MSGS_PER_DAY ?? 300);
const MIN_GAP_MS = 2000;
const MAX_GAP_MS = 5000;
const ORG_ID_RE = /^[0-9a-fA-F-]{36}$/;
const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** Digits only; 10-digit numbers get India's 91 (same rule as the edge function). */
function toJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  if (full.length < 10) throw new Error("Invalid phone number");
  return `${full}@s.whatsapp.net`;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  private assertOrg(orgId: string) {
    if (!ORG_ID_RE.test(orgId)) throw new Error("Invalid organization id");
  }

  private get(orgId: string): Session {
    let s = this.sessions.get(orgId);
    if (!s) {
      s = {
        sock: null, status: "disconnected", qr: null, number: null, starting: false,
        sentToday: 0, day: today(), lastSendAt: 0, queue: Promise.resolve(),
      };
      this.sessions.set(orgId, s);
    }
    return s;
  }

  private dir(orgId: string) {
    return path.join(AUTH_DIR, orgId);
  }

  private async notify(orgId: string, s: Session) {
    if (!APP_EVENT_URL) return;
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
      if (ORG_ID_RE.test(orgId)) await this.connect(orgId).catch((e) => logger.warn({ err: e }, "restore failed"));
    }
  }

  private async connect(orgId: string) {
    const s = this.get(orgId);
    if (s.starting || s.status === "connected") return;
    s.starting = true;
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
        browser: ["EzzyERP", "Chrome", "1.0"],
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      s.sock = sock;
      sock.ev.on("creds.update", saveCreds);
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          s.qr = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          s.status = "qr";
        }
        if (connection === "open") {
          s.status = "connected";
          s.qr = null;
          s.number = sock.user?.id?.split(":")[0]?.split("@")[0] ?? null;
          await this.notify(orgId, s);
        } else if (connection === "close") {
          const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          s.sock = null;
          s.qr = null;
          if (code === DisconnectReason.loggedOut) {
            s.status = "logged_out";
            s.number = null;
            fs.rmSync(this.dir(orgId), { recursive: true, force: true });
            await this.notify(orgId, s);
          } else {
            s.status = "disconnected";
            await this.notify(orgId, s);
            setTimeout(() => void this.connect(orgId).catch(() => undefined), 5000);
          }
        }
      });
    } finally {
      s.starting = false;
    }
  }

  async start(orgId: string) {
    this.assertOrg(orgId);
    const s = this.get(orgId);
    if (s.status !== "connected") await this.connect(orgId);
    // Give Baileys a moment to emit the first QR
    for (let i = 0; i < 20 && s.status !== "qr" && s.status !== "connected"; i++) await sleep(250);
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

  /** Serialize sends per org with a random human-like gap and a daily cap (ban protection). */
  private enqueue<T>(s: Session, job: () => Promise<T>): Promise<T> {
    const run = async () => {
      if (s.day !== today()) {
        s.day = today();
        s.sentToday = 0;
      }
      if (s.sentToday >= MAX_PER_DAY) throw new Error(`Daily send limit (${MAX_PER_DAY}) reached`);
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

  async checkNumber(orgId: string, phone: string): Promise<boolean> {
    const s = this.ready(orgId);
    const [result] = (await s.sock!.onWhatsApp(toJid(phone))) ?? [];
    return Boolean(result?.exists);
  }
}
