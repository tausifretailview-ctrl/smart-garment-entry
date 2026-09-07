import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUTH_ADMIN_LIST_USERS_PER_PAGE,
  accumulateAuthUserPages,
  shouldFetchNextAuthUserPage,
} from "./authAdminListUsersPaging";

const here = dirname(fileURLToPath(import.meta.url));

describe("shouldFetchNextAuthUserPage", () => {
  it("keeps paging while the page is full", () => {
    expect(shouldFetchNextAuthUserPage(50, 50)).toBe(true);
    expect(shouldFetchNextAuthUserPage(1000, AUTH_ADMIN_LIST_USERS_PER_PAGE)).toBe(true);
    expect(shouldFetchNextAuthUserPage(81, 1000)).toBe(false);
    expect(shouldFetchNextAuthUserPage(0, 1000)).toBe(false);
  });
});

describe("accumulateAuthUserPages", () => {
  it("collects every page — 81 users at the default 50-user cap would have dropped mobility@gmail.com", async () => {
    const pages = [
      Array.from({ length: 50 }, (_, i) => ({ id: `u${i + 1}` })),
      Array.from({ length: 31 }, (_, i) => ({ id: `u${i + 51}` })),
    ];
    const seen: number[] = [];
    const users = await accumulateAuthUserPages(async (page, perPage) => {
      seen.push(page);
      expect(perPage).toBe(50);
      return pages[page - 1] ?? [];
    }, 50);
    expect(seen).toEqual([1, 2]);
    expect(users).toHaveLength(81);
    expect(users[80]?.id).toBe("u81");
  });

  it("keeps paging at 1000-per-page instead of treating one full page as the whole directory", async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: `u${i + 1}` })),
      Array.from({ length: 1000 }, (_, i) => ({ id: `u${i + 1001}` })),
      Array.from({ length: 1 }, () => ({ id: "u2001" })),
    ];
    const seen: number[] = [];
    const users = await accumulateAuthUserPages(async (page, perPage) => {
      seen.push(page);
      expect(perPage).toBe(AUTH_ADMIN_LIST_USERS_PER_PAGE);
      return pages[page - 1] ?? [];
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(users).toHaveLength(2001);
    expect(users[2000]?.id).toBe("u2001");
  });
});

const GET_USERS_FRONTEND_CONSUMERS = [
  "src/pages/POSDashboard.tsx",
  "src/pages/EmployeeMaster.tsx",
  "src/pages/UserRights.tsx",
  "src/pages/SalesInvoiceDashboard.tsx",
  "src/pages/ItemWiseSalesReport.tsx",
  "src/pages/PlatformAdmin.tsx",
  "src/pages/OrganizationManagement.tsx",
  "src/components/UserManagement.tsx",
] as const;

describe("get-users edge function paging", () => {
  it("pages listUsers instead of the default 50-user call", () => {
    const fn = readFileSync(resolve(here, "../../supabase/functions/get-users/index.ts"), "utf8");
    expect(fn).toContain("accumulateAuthUserPages");
    expect(fn).toMatch(/listUsers\(\{\s*page,\s*perPage,/);
    expect(fn).not.toMatch(/admin\.listUsers\(\s*\)/);
  });

  it("is the shared directory for every listed frontend consumer", () => {
    const root = resolve(here, "../..");
    for (const rel of GET_USERS_FRONTEND_CONSUMERS) {
      const src = readFileSync(resolve(root, rel), "utf8");
      expect(src, rel).toMatch(/get-users/);
    }
  });

  it("keeps the Deno helper in lockstep with the unit-tested paging helper", () => {
    const app = readFileSync(resolve(here, "authAdminListUsersPaging.ts"), "utf8");
    const edge = readFileSync(
      resolve(here, "../../supabase/functions/_shared/listAllAuthUsers.ts"),
      "utf8",
    );
    const strip = (src: string) =>
      src
        .replace(/\/\*\*[\s\S]*?\*\//g, "")
        .replace(/^\s*export /gm, "")
        .trim();
    expect(strip(edge)).toContain("function accumulateAuthUserPages");
    expect(strip(app).replace(/^[\s\S]*?(const AUTH_ADMIN)/, "$1")).toBe(
      strip(edge).replace(/^[\s\S]*?(const AUTH_ADMIN)/, "$1"),
    );
  });
});
