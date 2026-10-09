import { describe, expect, it } from "vitest";
import { offerValidity } from "./format";

describe("offerValidity", () => {
  const now = new Date(2026, 9, 9, 15, 30); // 9 Oct 2026, afternoon

  it("counts down the last days", () => {
    expect(offerValidity("2026-10-09", now)).toEqual({ label: "Ends today", ended: false, urgent: true });
    expect(offerValidity("2026-10-10", now)).toEqual({ label: "Ends tomorrow", ended: false, urgent: true });
    expect(offerValidity("2026-10-12", now)).toEqual({ label: "Last 4 days", ended: false, urgent: true });
  });

  it("shows the date further out, and ended offers", () => {
    expect(offerValidity("2026-10-30", now)).toMatchObject({ ended: false, urgent: false });
    expect(offerValidity("2026-10-30", now)?.label).toMatch(/^Valid till /);
    expect(offerValidity("2026-10-08", now)).toEqual({ label: "Offer ended", ended: true, urgent: false });
  });

  it("ignores missing or malformed dates", () => {
    expect(offerValidity(null, now)).toBeNull();
    expect(offerValidity("tomorrow", now)).toBeNull();
  });
});
