import { describe, expect, it } from "vitest";
import {
  istYmdOfTimestamp,
  posPickerDayFromSaleDate,
  samePickerDay,
  ymdToDdMmYyyy,
} from "./posInvoiceDate";

describe("posInvoiceDate", () => {
  it("reads the IST business day of a +05:30 sale_date", () => {
    expect(istYmdOfTimestamp("2026-10-31T14:15:00.000+05:30")).toBe("2026-10-31");
    // 00:30 IST on 1 Nov is still 31 Oct in UTC — business day must be 1 Nov.
    expect(istYmdOfTimestamp("2026-10-31T19:00:00.000Z")).toBe("2026-11-01");
    expect(istYmdOfTimestamp("2026-10-30")).toBe("2026-10-30");
    expect(istYmdOfTimestamp(null)).toBe("");
    expect(istYmdOfTimestamp("garbage")).toBe("");
  });

  it("builds a local picker date for the bill day", () => {
    const d = posPickerDayFromSaleDate("2026-10-31T14:15:00.000+05:30");
    expect(d && [d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 9, 31]);
    expect(posPickerDayFromSaleDate(undefined)).toBeNull();
  });

  it("compares calendar days and formats dd/MM/yyyy", () => {
    expect(samePickerDay(new Date(2026, 9, 31, 9), new Date(2026, 9, 31, 22))).toBe(true);
    expect(samePickerDay(new Date(2026, 9, 31), new Date(2026, 10, 1))).toBe(false);
    expect(samePickerDay(null, new Date())).toBe(false);
    expect(ymdToDdMmYyyy("2026-10-31")).toBe("31/10/2026");
  });
});
