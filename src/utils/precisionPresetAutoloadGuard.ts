/**
 * Precision preset auto-load: toast + re-apply must not repeat on remount.
 *
 * loadAll closes over a stale name on a fresh mount. A session/module record
 * plus an explicit "already in place" check keep the disruptive toast and
 * setPrecisionSettings from firing once per remount.
 */

export const PRECISION_AUTOLOAD_REPEAT_WINDOW_MS = 8_000;

const SESSION_PREFIX = "ezzy_precision_autoload_";

export type PrecisionAutoloadRecord = {
  name: string;
  at: number;
};

export type PrecisionAutoloadSnapshot = {
  name: string | null;
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
};

export type PrecisionAutoloadDecision = {
  apply: boolean;
  toast: boolean;
  setActiveName: boolean;
};

const memoryRecords = new Map<string, PrecisionAutoloadRecord>();
let loadAllMountSeq = 0;

export function resetPrecisionAutoloadGuardForTests(): void {
  memoryRecords.clear();
  loadAllMountSeq = 0;
}

export function nextBarcodeLoadAllMountSeq(): number {
  return ++loadAllMountSeq;
}

export function normalizePrecisionPresetName(
  name: string | null | undefined,
): string | null {
  if (name == null) return null;
  const trimmed = name.replace(/^preset:/, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function precisionAutoloadSessionKey(orgId: string): string {
  return `${SESSION_PREFIX}${orgId}`;
}

function storageGet(
  storage: Pick<Storage, "getItem"> | null | undefined,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(
  storage: Pick<Storage, "setItem"> | null | undefined,
  key: string,
  value: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode / quota — memory record still holds */
  }
}

export function readPrecisionAutoloadRecord(
  orgId: string,
  storage?: Pick<Storage, "getItem"> | null,
): PrecisionAutoloadRecord | null {
  const mem = memoryRecords.get(orgId);
  if (mem) return mem;
  const raw = storageGet(storage, precisionAutoloadSessionKey(orgId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrecisionAutoloadRecord>;
    const name = normalizePrecisionPresetName(parsed.name);
    const at = typeof parsed.at === "number" ? parsed.at : NaN;
    if (!name || !Number.isFinite(at)) return null;
    const rec = { name, at };
    memoryRecords.set(orgId, rec);
    return rec;
  } catch {
    return null;
  }
}

export function markPrecisionAutoload(opts: {
  orgId: string;
  presetName: string;
  now?: number;
  storage?: Pick<Storage, "setItem"> | null;
}): void {
  const name = normalizePrecisionPresetName(opts.presetName);
  if (!name) return;
  const rec: PrecisionAutoloadRecord = {
    name,
    at: opts.now ?? Date.now(),
  };
  memoryRecords.set(opts.orgId, rec);
  storageSet(
    opts.storage,
    precisionAutoloadSessionKey(opts.orgId),
    JSON.stringify(rec),
  );
}

export function precisionAutoloadSettingsAlreadyInPlace(
  current: PrecisionAutoloadSnapshot,
  incoming: PrecisionAutoloadSnapshot,
): boolean {
  const currentName = normalizePrecisionPresetName(current.name);
  const incomingName = normalizePrecisionPresetName(incoming.name);
  if (!currentName || !incomingName) return false;
  if (currentName !== incomingName) return false;
  return (
    current.width === incoming.width &&
    current.height === incoming.height &&
    current.xOffset === incoming.xOffset &&
    current.yOffset === incoming.yOffset
  );
}

export function shouldSkipPrecisionAutoloadToast(opts: {
  orgId: string;
  presetName: string;
  alreadyShowingPreset: boolean;
  now?: number;
  windowMs?: number;
  storage?: Pick<Storage, "getItem"> | null;
}): boolean {
  if (opts.alreadyShowingPreset) return true;
  const incoming = normalizePrecisionPresetName(opts.presetName);
  if (!incoming) return false;
  const last = readPrecisionAutoloadRecord(opts.orgId, opts.storage);
  if (!last || last.name !== incoming) return false;
  return true;
}

export function shouldSkipPrecisionAutoloadApply(opts: {
  settingsAlreadyInPlace: boolean;
}): boolean {
  // Remount with default 50×25 geometry must still apply once. Only skip when
  // the designer already has this preset's size/offsets (same-instance re-run).
  return opts.settingsAlreadyInPlace;
}

export function decidePrecisionAutoload(opts: {
  orgId: string;
  currentPresetName: string | null;
  incomingPresetName: string;
  settingsAlreadyInPlace: boolean;
  now?: number;
  windowMs?: number;
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
}): PrecisionAutoloadDecision {
  const current = normalizePrecisionPresetName(opts.currentPresetName);
  const incoming = normalizePrecisionPresetName(opts.incomingPresetName);
  if (!incoming) {
    return { apply: false, toast: false, setActiveName: false };
  }
  const alreadyShowing = current === incoming;
  const skipToast = shouldSkipPrecisionAutoloadToast({
    orgId: opts.orgId,
    presetName: incoming,
    alreadyShowingPreset: alreadyShowing,
    now: opts.now,
    windowMs: opts.windowMs,
    storage: opts.storage,
  });
  const skipApply = shouldSkipPrecisionAutoloadApply({
    settingsAlreadyInPlace: opts.settingsAlreadyInPlace,
  });
  return {
    apply: !skipApply,
    toast: !skipToast && !alreadyShowing && !current,
    setActiveName: !current,
  };
}
