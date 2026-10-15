import { describe, expect, it } from "vitest";
import { resolveDefaultSizeGroupId } from "./defaultSizeGroup";

describe("resolveDefaultSizeGroupId", () => {
  it("treats a never-saved setting as None, like Settings shows it", () => {
    expect(resolveDefaultSizeGroupId(null)).toBe("none");
    expect(resolveDefaultSizeGroupId({})).toBe("none");
    expect(resolveDefaultSizeGroupId({ default_size_group: "" })).toBe("none");
  });

  it("keeps an explicit None or group id", () => {
    expect(resolveDefaultSizeGroupId({ default_size_group: "none" })).toBe("none");
    expect(resolveDefaultSizeGroupId({ default_size_group: "abc-123" })).toBe("abc-123");
  });

  it("returns null for 'last used' so the last product's group stays", () => {
    expect(resolveDefaultSizeGroupId({ default_size_group: "last" })).toBeNull();
  });

  it("leaves Mobile ERP locked-size shops alone when unset", () => {
    expect(resolveDefaultSizeGroupId({ mobile_erp: { enabled: true } })).toBeNull();
    expect(
      resolveDefaultSizeGroupId({ mobile_erp: { enabled: true, locked_size_qty: false } }),
    ).toBe("none");
  });
});
