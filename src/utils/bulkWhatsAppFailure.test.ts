import { describe, expect, it } from "vitest";
import { describeBulkFailure, groupBulkFailures, isRetryableBulkFailure } from "./bulkWhatsAppFailure";

describe("describeBulkFailure", () => {
  it("returns null when there is no error", () => {
    expect(describeBulkFailure(null)).toBeNull();
    expect(describeBulkFailure("  ")).toBeNull();
  });

  it("puts WhatsApp server errors in plain words", () => {
    expect(describeBulkFailure("Not on WhatsApp")?.label).toBe("Not on WhatsApp");
    expect(describeBulkFailure("Invalid phone number")?.label).toBe("Wrong number");
    expect(describeBulkFailure("rate-overlimit")?.label).toBe("WhatsApp slowed sending");
    expect(describeBulkFailure("Timed Out")?.label).toBe("WhatsApp did not answer");
    expect(describeBulkFailure("Connection Closed")?.label).toBe("Your WhatsApp disconnected");
    expect(describeBulkFailure("WhatsApp session is not connected")?.label).toBe("Your WhatsApp disconnected");
    expect(describeBulkFailure("Media upload failed on all hosts")?.label).toBe("Poster or video failed");
    expect(describeBulkFailure("Daily send limit (500) reached")?.label).toBe("Daily limit reached");
    expect(describeBulkFailure("forbidden")?.label).toBe("Blocked by WhatsApp");
  });

  it("keeps unknown errors as the hint", () => {
    expect(describeBulkFailure("something odd")).toEqual({ label: "Send failed", hint: "something odd" });
  });
});

describe("groupBulkFailures", () => {
  it("counts failed numbers per reason, biggest first, ignoring other statuses", () => {
    const groups = groupBulkFailures([
      { status: "failed", error: "Not on WhatsApp" },
      { status: "failed", error: "Timed Out" },
      { status: "failed", error: "Not on WhatsApp" },
      { status: "skipped", error: "Unsubscribed" },
      { status: "sent", error: null },
      { status: "failed", error: null },
    ]);
    expect(groups.map((g) => [g.reason.label, g.count])).toEqual([
      ["Not on WhatsApp", 2],
      ["WhatsApp did not answer", 1],
      ["Send failed", 1],
    ]);
  });
});

describe("isRetryableBulkFailure", () => {
  it("retries passing errors only", () => {
    expect(isRetryableBulkFailure("Timed Out")).toBe(true);
    expect(isRetryableBulkFailure(null)).toBe(true);
    expect(isRetryableBulkFailure("Not on WhatsApp")).toBe(false);
    expect(isRetryableBulkFailure("Unsubscribed")).toBe(false);
  });
});
