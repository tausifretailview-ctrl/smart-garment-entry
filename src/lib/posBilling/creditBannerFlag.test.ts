import { describe, expect, it } from "vitest";
import { POS_APPLY_CREDIT_BANNER_ENABLED } from "./creditBannerFlag";

describe("POS apply-credit banner flag", () => {
  it("stays off so the unsaved Apply banner cannot redeem credit", () => {
    expect(POS_APPLY_CREDIT_BANNER_ENABLED).toBe(false);
  });
});
