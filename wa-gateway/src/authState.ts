import fs from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

/**
 * A linked number's keys on the volume, like Baileys' useMultiFileAuthState but safe to lose power on.
 * Baileys writes a file by emptying it first, so a restart or a full disk in the middle of a write left
 * creds.json empty: the server then read it as "never linked", showed a QR nobody scanned, and deleted
 * the folder, so the shop had to link again. Here every file is written to a temporary name and renamed
 * over the old one (the old file stays whole until the new one is complete), and the last good creds of
 * a linked number are also kept in creds.backup.json.
 */

export const CREDS_FILE = "creds.json";
export const CREDS_BACKUP_FILE = "creds.backup.json";

const fixFileName = (file: string) => file.replace(/\//g, "__").replace(/:/g, "-");

/** Parsed creds of a number that finished linking (has `account`), or null. */
export function readLinkedCreds(file: string): { me?: { id?: string; lid?: string } } | null {
  try {
    const creds = JSON.parse(fs.readFileSync(file, "utf8")) as { account?: unknown; me?: { id?: string; lid?: string } };
    return creds.account ? creds : null;
  } catch {
    return null;
  }
}

/** The folder holds a finished link (in creds.json, or in its backup when creds.json was damaged). */
export function hasLinkedCredsOnDisk(dir: string): boolean {
  return Boolean(readLinkedCreds(path.join(dir, CREDS_FILE)) ?? readLinkedCreds(path.join(dir, CREDS_BACKUP_FILE)));
}

/** WhatsApp user ids of the number itself (phone number and LID), whose own key files must never be pruned. */
export function ownUserIds(dir: string): string[] {
  const creds = readLinkedCreds(path.join(dir, CREDS_FILE)) ?? readLinkedCreds(path.join(dir, CREDS_BACKUP_FILE));
  return [creds?.me?.id, creds?.me?.lid]
    .map((jid) => jid?.split("@")[0]?.split(":")[0] ?? "")
    .filter(Boolean);
}

/** Per file, writes and removes run one after another so the newest value always lands last. */
const fileQueues = new Map<string, Promise<unknown>>();
function inOrder<T>(file: string, job: () => Promise<T>): Promise<T> {
  const next = (fileQueues.get(file) ?? Promise.resolve()).then(job, job);
  const tail = next.catch(() => undefined);
  fileQueues.set(file, tail);
  void tail.then(() => {
    if (fileQueues.get(file) === tail) fileQueues.delete(file);
  });
  return next;
}

let tmpSeq = 0;
async function writeAtomic(file: string, text: string) {
  const tmp = `${file}.tmp-${process.pid}-${++tmpSeq}`;
  try {
    await writeFile(tmp, text);
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => undefined);
    throw e;
  }
}

export async function useSafeAuthState(folder: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  /** The saved creds.json was missing or damaged and the backup copy was used. */
  fromBackup: boolean;
}> {
  await mkdir(folder, { recursive: true });

  const write = (file: string, data: unknown) => {
    const p = path.join(folder, fixFileName(file));
    return inOrder(p, () => writeAtomic(p, JSON.stringify(data, BufferJSON.replacer)));
  };
  const read = async (file: string) => {
    const p = path.join(folder, fixFileName(file));
    try {
      return JSON.parse(await inOrder(p, () => readFile(p, "utf8")), BufferJSON.reviver);
    } catch {
      return null;
    }
  };
  const remove = (file: string) => {
    const p = path.join(folder, fixFileName(file));
    return inOrder(p, () => unlink(p).catch(() => undefined));
  };

  let creds = (await read(CREDS_FILE)) as AuthenticationCreds | null;
  let fromBackup = false;
  if (!creds?.account) {
    const backup = (await read(CREDS_BACKUP_FILE)) as AuthenticationCreds | null;
    if (backup?.account) {
      creds = backup;
      fromBackup = true;
      await write(CREDS_FILE, creds);
    }
  }
  const liveCreds: AuthenticationCreds = creds ?? initAuthCreds();

  return {
    fromBackup,
    state: {
      creds: liveCreds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}.json`);
              if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data) => {
          const tasks: Promise<unknown>[] = [];
          for (const category in data) {
            const items = data[category as keyof SignalDataTypeMap] ?? {};
            for (const id in items) {
              const value = items[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? write(file, value) : remove(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await write(CREDS_FILE, liveCreds);
      // Only a finished link is worth keeping a second copy of.
      if (liveCreds.account) await write(CREDS_BACKUP_FILE, liveCreds);
    },
  };
}
