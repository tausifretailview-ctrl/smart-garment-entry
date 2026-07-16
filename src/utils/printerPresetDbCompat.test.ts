import { describe, expect, it } from "vitest";
import { isMissingPgColumn, omitRecordKey } from "./printerPresetDbCompat";

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
