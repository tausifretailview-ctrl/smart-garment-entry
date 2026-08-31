import {
  getPrecisionThermalCols,
  isPrecisionThermalSheetMode,
  printModeToThermalCols,
  type PrecisionPrintMode,
} from "./precisionThermalModes";

/** Why a writer wants to change printMode / thermalCols. */
export type PrintModeLockReason =
  | "user-click"
  | "user-print"
  | "new-purchase-nav"
  | "org-change"
  | "settings-fetch"
  | "preset-autoload"
  | "preset-load"
  | "autosave"
  | "sheet-type";

export type UserPrintModeLock = {
  mode: PrecisionPrintMode;
  cols: number;
  source: "click" | "print";
} | null;

const USER_REASONS: PrintModeLockReason[] = ["user-click", "user-print"];
const RESET_REASONS: PrintModeLockReason[] = ["new-purchase-nav", "org-change"];

export function printModeWriteAllowed(
  lock: UserPrintModeLock,
  reason: PrintModeLockReason,
): boolean {
  if (USER_REASONS.includes(reason)) return true;
  if (RESET_REASONS.includes(reason)) return true;
  return lock == null;
}

export function nextPrintModeLock(
  lock: UserPrintModeLock,
  reason: PrintModeLockReason,
  mode: PrecisionPrintMode,
): UserPrintModeLock {
  if (reason === "user-click") {
    return { mode, cols: printModeToThermalCols(mode), source: "click" };
  }
  if (reason === "user-print") {
    return { mode, cols: printModeToThermalCols(mode), source: "print" };
  }
  if (RESET_REASONS.includes(reason)) return null;
  return lock;
}

export function applyPrintModeDecision(input: {
  lock: UserPrintModeLock;
  reason: PrintModeLockReason;
  requestedMode: PrecisionPrintMode;
}): {
  accepted: boolean;
  lock: UserPrintModeLock;
  mode: PrecisionPrintMode;
} {
  if (!printModeWriteAllowed(input.lock, input.reason)) {
    return {
      accepted: false,
      lock: input.lock,
      mode: input.lock?.mode ?? input.requestedMode,
    };
  }
  const lock = nextPrintModeLock(input.lock, input.reason, input.requestedMode);
  return {
    accepted: true,
    lock,
    mode: lock?.mode ?? input.requestedMode,
  };
}

/** Print / preview must follow the session lock when it is set. */
export function resolveLockedPrintMode(
  lock: UserPrintModeLock,
  printMode: PrecisionPrintMode,
  thermalCols = 1,
): { mode: PrecisionPrintMode; cols: number } {
  const mode = lock?.mode ?? printMode;
  const cols = lock?.cols ?? thermalCols;
  return {
    mode,
    cols: isPrecisionFootwearCols(mode) ? 1 : getPrecisionThermalCols(mode, cols),
  };
}

function isPrecisionFootwearCols(mode: PrecisionPrintMode): boolean {
  return mode === "footwear" || mode === "a4";
}

export function thermalColsForPrintMode(mode: PrecisionPrintMode, fallback = 1): number {
  if (!isPrecisionThermalSheetMode(mode)) return fallback;
  return printModeToThermalCols(mode);
}
