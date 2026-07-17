import { describe, expect, it } from "vitest";
import { isPlatformAdminLoginIntent } from "./orgLoginRedirect";

describe("isPlatformAdminLoginIntent", () => {
  it("detects explicit platform admin intent", () => {
    expect(isPlatformAdminLoginIntent("?platform=1")).toBe(true);
    expect(isPlatformAdminLoginIntent("?admin=1")).toBe(true);
    expect(isPlatformAdminLoginIntent("")).toBe(false);
  });
});
