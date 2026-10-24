import fs from "node:fs";
import path from "node:path";

/**
 * Keeps the server's volume (/data) from filling up. A linked number keeps one small file per customer
 * device (Signal session, identity key, group sender keys), so a shop that sends thousands of bills
 * builds up hundreds of thousands of files, and the volume runs out of space or file slots ("ENOSPC:
 * no space left on device"), after which no number can link or save its keys.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Per-customer files WhatsApp rebuilds on the next message to or from that customer. */
const SESSION_FILE_RE = /^session-(.+)$/;
const SENDER_KEY_RE = /^sender-key-/;
const IDENTITY_FILE_RE = /^identity-key-(.+)$/;
/** Half-written key files left by a restart in the middle of a save (see authState.ts). */
const TMP_FILE_RE = /\.tmp-\d+-\d+$/;

export interface DiskUsage {
  bytesTotal: number;
  bytesFree: number;
  filesTotal: number;
  filesFree: number;
}

export function diskUsage(dir: string): DiskUsage | null {
  try {
    const s = fs.statfsSync(dir);
    return { bytesTotal: s.blocks * s.bsize, bytesFree: s.bavail * s.bsize, filesTotal: s.files, filesFree: s.ffree };
  } catch {
    return null;
  }
}

/** Under 10% of the space or of the file slots left. */
export function diskLow(u: DiskUsage | null): boolean {
  if (!u) return false;
  return u.bytesFree < u.bytesTotal * 0.1 || (u.filesTotal > 0 && u.filesFree < u.filesTotal * 0.1);
}

export const isDiskFull = (e: unknown) => (e as NodeJS.ErrnoException | null)?.code === "ENOSPC";

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

export function describeDisk(u: DiskUsage | null): string {
  if (!u) return "disk usage unknown";
  const files = u.filesTotal > 0 ? `, file slots ${u.filesTotal - u.filesFree} of ${u.filesTotal} used` : "";
  return `${mb(u.bytesTotal - u.bytesFree)} of ${mb(u.bytesTotal)} used${files}`;
}

function list(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function mtime(file: string): number | null {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Removes a linked number's per-customer files not used for `maxAgeDays`: Signal sessions and group
 * sender keys (WhatsApp sets them up again on the next message), and the identity key of a customer
 * whose session is gone. Account keys, pre-keys, app-state keys and LID mappings are never touched, nor
 * the files of the number's own phone and other linked devices (`ownUsers`: its phone number and LID),
 * which carry the link itself.
 */
export function pruneSessionDir(sessionDir: string, maxAgeDays: number, now = Date.now(), ownUsers: string[] = []): number {
  const cutoff = now - maxAgeDays * DAY_MS;
  const names = list(sessionDir);
  const live = new Set<string>();
  const isOwn = (address: string) => ownUsers.some((u) => address.startsWith(`${u}.`) || address.startsWith(`${u}_`));
  let removed = 0;
  for (const name of names) {
    if (TMP_FILE_RE.test(name)) {
      const at = mtime(path.join(sessionDir, name));
      if (at !== null && at < now - 60 * 60 * 1000) {
        fs.rmSync(path.join(sessionDir, name), { force: true });
        removed++;
      }
      continue;
    }
    const session = SESSION_FILE_RE.exec(name);
    if (session && isOwn(session[1])) continue;
    if (!session && !SENDER_KEY_RE.test(name)) continue;
    const file = path.join(sessionDir, name);
    const at = mtime(file);
    if (at !== null && at < cutoff) {
      fs.rmSync(file, { force: true });
      removed++;
    } else if (session) {
      live.add(session[1]);
    }
  }
  for (const name of names) {
    const identity = IDENTITY_FILE_RE.exec(name);
    if (!identity || live.has(identity[1]) || isOwn(identity[1])) continue;
    const file = path.join(sessionDir, name);
    const at = mtime(file);
    if (at !== null && at < cutoff) {
      fs.rmSync(file, { force: true });
      removed++;
    }
  }
  return removed;
}

/** Encoded campaign videos (and half-written leftovers) whose campaign is no longer on this server. */
export function pruneVideos(videoDir: string, activeCampaignIds: Set<string>): number {
  let removed = 0;
  for (const name of list(videoDir)) {
    const id = name.replace(/-(small|medium)\.mp4(\.part)?$/, "").replace(/-source$/, "");
    if (activeCampaignIds.has(id)) continue;
    fs.rmSync(path.join(videoDir, name), { force: true });
    removed++;
  }
  return removed;
}

/** Number of files in each folder under `dir`, most first (no per-file stat, so it stays quick). */
export function folderFileCounts(dir: string): { name: string; files: number }[] {
  return list(dir)
    .map((name) => ({ name, files: list(path.join(dir, name)).length }))
    .sort((a, b) => b.files - a.files);
}

export function describeFolders(counts: { name: string; files: number }[], top = 8): string {
  return counts
    .slice(0, top)
    .map((c) => `${c.name}: ${c.files} files`)
    .join("; ");
}

/** Files of every number grouped by kind ("session", "lid-mapping", "pre-key", ...), most first. */
export function fileKinds(authDir: string): string {
  const counts = new Map<string, number>();
  for (const id of list(authDir)) {
    for (const name of list(path.join(authDir, id))) {
      const kind = /^(app-state-sync-(key|version)|sender-key-memory|sender-key|identity-key|lid-mapping|device-list|pre-key|session|tctoken)-/.exec(name)?.[1] ?? "other";
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
}
