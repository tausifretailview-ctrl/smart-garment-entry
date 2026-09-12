import { describe, expect, it } from "vitest";
import {
  labelDesignNamesMatch,
  normalizeLabelDesignName,
  pickLatestNamedSetting,
  preferSavedLabelConfig,
} from "./labelDesignPersist";

describe("normalizeLabelDesignName", () => {
  it("treats * and × as the same size separator", () => {
    expect(normalizeLabelDesignName("rahmani 38×25")).toBe("rahmani 38*25");
    expect(normalizeLabelDesignName("  rahmani   38*25 ")).toBe("rahmani 38*25");
  });
});

describe("labelDesignNamesMatch", () => {
  it("matches rahmani 38*25 variants", () => {
    expect(labelDesignNamesMatch("rahmani 38*25", "rahmani 38×25")).toBe(true);
    expect(labelDesignNamesMatch("Rahmani 38*25", "rahmani 38*25")).toBe(true);
    expect(labelDesignNamesMatch("rahmani 38*25", "other 38*25")).toBe(false);
  });
});

describe("preferSavedLabelConfig", () => {
  it("prefers the template row over a stale printer preset", () => {
    expect(preferSavedLabelConfig({ v: "new" }, { v: "old" })).toEqual({ v: "new" });
    expect(preferSavedLabelConfig(null, { v: "old" })).toEqual({ v: "old" });
    expect(preferSavedLabelConfig(undefined, undefined)).toBeNull();
  });
});

describe("pickLatestNamedSetting", () => {
  it("keeps the newest duplicate template name so load is not the old row", () => {
    const picked = pickLatestNamedSetting([
      { setting_name: "rahmani 38*25", updated_at: "2026-01-01T00:00:00Z", id: "old" },
      { setting_name: "rahmani 38*25", updated_at: "2026-09-12T00:00:00Z", id: "new" },
      { setting_name: "other", updated_at: "2026-09-01T00:00:00Z", id: "x" },
    ]);
    expect(picked).toHaveLength(2);
    expect(picked.find((r) => r.setting_name === "rahmani 38*25")?.id).toBe("new");
  });
});
