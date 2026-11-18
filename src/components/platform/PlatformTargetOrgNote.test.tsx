/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PlatformTargetOrgNote, platformTargetOrgButtonLabel } from "./PlatformTargetOrgNote";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function text(org: Parameters<typeof PlatformTargetOrgNote>[0]["org"]): string {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<PlatformTargetOrgNote org={org} />));
  const out = host.textContent || "";
  act(() => root.unmount());
  return out;
}

describe("Platform Admin: the shop a login is added to is shown before saving", () => {
  it("asks for the shop when none is chosen", () => {
    expect(text(null)).toContain("Choose the shop first.");
  });

  it("shows the shop's name, number and login page", () => {
    const out = text({ name: "LAGNEE SAREES", slug: "lagnee-sarees", organization_number: 41 });
    expect(out).toContain("This login will be added to");
    expect(out).toContain("LAGNEE SAREES");
    expect(out).toContain("Shop #41 · login page /lagnee-sarees");
    // WhatsApp-only shops have no number.
    expect(text({ name: "Chat Shop", slug: "chat-shop", organization_number: null })).toContain("login page /chat-shop");
  });

  it("names the shop on the button", () => {
    expect(platformTargetOrgButtonLabel("Create user", { name: "LAGNEE SAREES" })).toBe("Create user in LAGNEE SAREES");
    expect(platformTargetOrgButtonLabel("Create user", null)).toBe("Create user");
    expect(platformTargetOrgButtonLabel("Add user", { name: "A".repeat(40) })).toBe(`Add user in ${"A".repeat(27)}…`);
  });

  it("is used by both the Create User and Assign User dialogs", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/PlatformAdmin.tsx"), "utf8");
    expect(page).toContain("<PlatformTargetOrgNote org={createTargetOrg} />");
    expect(page).toContain("<PlatformTargetOrgNote org={assignTargetOrg} />");
    expect(page).toContain('platformTargetOrgButtonLabel("Create user", createTargetOrg)');
    expect(page).toContain('platformTargetOrgButtonLabel("Add user", assignTargetOrg)');
  });
});
