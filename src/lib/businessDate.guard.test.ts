import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { istCalendarYmd } from "@/lib/localDayBounds";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Review item B7 (22 Nov 2026): "today" for a voucher, return, credit note or due date is the
 * Indian calendar day, never the UTC day.
 *
 * `new Date().toISOString().split("T")[0]` is the UTC date: between 12:00 am and 5:30 am IST it
 * is still yesterday, so vouchers, sale returns and credit notes made after midnight were dated
 * the previous day while the bill itself was dated correctly. On a Date picked from a calendar
 * (local midnight) it is the previous day at any hour: due dates and delivery dates were saved
 * one day early.
 */
const UTC_DAY = /toISOString\(\)\.(split\(("|')T("|')\)\[0\]|slice\(0, ?10\))/;

/** Files where the UTC day is right or harmless, with the reason. */
const ALLOWED: Record<string, string> = {
  "components/school/StudentExcelImportDialog.tsx": "dates parsed from an Excel file",
  "components/LegacyInvoiceImportDialog.tsx": "dates parsed from an import file",
  "lib/ownerAlertHistory.ts": "adds the IST offset first",
  "lib/deliveryDashboardSummary.ts": "adds the IST offset first",
  "utils/customerBalanceUtils.ts": "adds the IST offset first",
  "utils/ewayBill.ts": "adds the IST offset first",
  "pages/OwnerAlertView.tsx": "adds the IST offset first / UTC day arithmetic",
  "utils/invoiceDashboardData.ts": "UTC day arithmetic on a yyyy-MM-dd value",
  "utils/quietCustomers.ts": "cut-off set to local noon first",
  "lib/barcode/exportLabelsPdf.ts": "file name",
  "utils/printerPresetBackup.ts": "file name",
  "utils/saleInvoiceFormatBackup.ts": "file name",
  "pages/StockSettlement.tsx": "file names",
  "pages/ProductDashboard.tsx": "file names",
  "pages/PlatformAdmin.tsx": "file name",
  "pages/BarcodePrinting.tsx": "file name",
  "pages/Godowns.tsx": "file name",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("business dates use the Indian calendar day", () => {
  afterEach(() => vi.useRealTimers());

  it("12:40 am in India is today's date, not yesterday's", () => {
    vi.useFakeTimers();
    // 22 Nov 2026, 00:40 IST = 21 Nov 2026, 19:10 UTC
    vi.setSystemTime(new Date("2026-11-21T19:10:00Z"));
    expect(new Date().toISOString().split("T")[0]).toBe("2026-11-21");
    expect(istCalendarYmd()).toBe("2026-11-22");
  });

  it("no new code takes the UTC day as the business date", () => {
    const offenders = sourceFiles(SRC)
      .map((file) => ({ rel: relative(SRC, file).replace(/\\/g, "/"), text: readFileSync(file, "utf8") }))
      .filter(({ rel, text }) => UTC_DAY.test(text) && !(rel in ALLOWED))
      .map(({ rel }) => rel);
    // Use istCalendarYmd() for "today" and format(date, "yyyy-MM-dd") for a picked date.
    expect(offenders).toEqual([]);
  });

  it("the allow-list holds no stale entries", () => {
    const stale = Object.keys(ALLOWED).filter((rel) => {
      try {
        return !UTC_DAY.test(readFileSync(join(SRC, rel), "utf8"));
      } catch {
        return true;
      }
    });
    expect(stale).toEqual([]);
  });
});
