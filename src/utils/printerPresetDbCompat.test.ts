import { describe, expect, it } from "vitest";
import { getPrinterPresetBackupErrorMessage } from "./printerPresetBackup";
import { isMissingPgColumn, omitRecordKey } from "./printerPresetDbCompat";

describe("getPrinterPresetBackupErrorMessage", () => {
  it("explains permission denied for backup table", () => {
    expect(
      getPrinterPresetBackupErrorMessage({
        message: "permission denied for table printer_presets_backup",
      }),
    ).toMatch(/No permission to use label design backups/i);
  });

  it("explains missing backup table", () => {
    expect(
      getPrinterPresetBackupErrorMessage({
        message: "Could not find the table 'public.printer_presets_backup' in the schema cache",
      }),
    ).toMatch(/backup table is missing/i);
  });
});

describe("isMissingPgColumn", () => {
  it("detects missing column errors", () => {
    expect(
      isMissingPgColumn(
        { message: 'column "h_gap" of relation "printer_presets_backup" does not exist' },
        "h_gap",
      ),
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isMissingPgColumn({ message: "permission denied" }, "h_gap")).toBe(false);
  });
});

describe("omitRecordKey", () => {
  it("removes a key without mutating the original", () => {
    const row = { a: 1, h_gap: 2 };
    const next = omitRecordKey(row, "h_gap");
    expect(next).toEqual({ a: 1 });
    expect(row.h_gap).toBe(2);
  });
});
