import { describe, expect, it } from "vitest";
import {
  ddMmYyyyDigitsToYmd,
  formatDateDMY,
  formatDateTimeDMY,
  maskDdMmYyyyDigits,
  ymdToDdMmYyyy,
} from "./dateDisplay";

describe("dateDisplay", () => {
  it("shows yyyy-MM-dd as dd/mm/yyyy", () => {
    expect(ymdToDdMmYyyy("2026-11-01")).toBe("01/11/2026");
    expect(ymdToDdMmYyyy("")).toBe("");
    expect(ymdToDdMmYyyy(null)).toBe("");
  });

  it("masks typed digits", () => {
    expect(maskDdMmYyyyDigits("0")).toBe("0");
    expect(maskDdMmYyyyDigits("011")).toBe("01/1");
    expect(maskDdMmYyyyDigits("01112026")).toBe("01/11/2026");
    expect(maskDdMmYyyyDigits("011120269")).toBe("01/11/2026");
  });

  it("parses typed dd/mm/yyyy, rejecting impossible days", () => {
    expect(ddMmYyyyDigitsToYmd("31102026")).toBe("2026-10-31");
    expect(ddMmYyyyDigitsToYmd("31112026")).toBeNull();
    expect(ddMmYyyyDigitsToYmd("29022027")).toBeNull();
    expect(ddMmYyyyDigitsToYmd("29022028")).toBe("2028-02-29");
    expect(ddMmYyyyDigitsToYmd("1311202")).toBeNull();
    expect(ddMmYyyyDigitsToYmd("01132026")).toBeNull();
  });

  it("formats dates day-first without timezone drift for plain days", () => {
    expect(formatDateDMY("2026-10-31")).toBe("31/10/2026");
    expect(formatDateDMY(new Date(2026, 0, 5))).toBe("05/01/2026");
    expect(formatDateDMY(null)).toBe("");
    expect(formatDateDMY("nope")).toBe("");
    expect(formatDateTimeDMY(new Date(2026, 10, 1, 14, 5))).toBe("01/11/2026 02:05 PM");
  });
});
