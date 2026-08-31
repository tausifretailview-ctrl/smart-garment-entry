import { describe, expect, it } from "vitest";
import { isReservedAppPathSegment } from "./reservedAppPaths";

describe("reservedAppPathSegment", () => {
  it("treats organization-setup as an app route, not a shop", () => {
    expect(isReservedAppPathSegment("organization-setup")).toBe(true);
    expect(isReservedAppPathSegment("auth")).toBe(true);
    expect(isReservedAppPathSegment("trendzo")).toBe(false);
  });
});
