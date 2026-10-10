import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  findDuplicateSizeGroup,
  friendlySizeGroupError,
  sizesMissingFromTarget,
} from "@/lib/sizeGroupActions";

const groups = [
  { id: "a", group_name: "1-3" },
  { id: "b", group_name: "S-XXL" },
];

describe("findDuplicateSizeGroup", () => {
  it("matches names ignoring case and extra spaces", () => {
    expect(findDuplicateSizeGroup(groups, "  s-xxl ")?.id).toBe("b");
  });

  it("ignores the group being renamed", () => {
    expect(findDuplicateSizeGroup(groups, "S-XXL", "b")).toBeUndefined();
  });

  it("returns nothing for a new name", () => {
    expect(findDuplicateSizeGroup(groups, "1-5")).toBeUndefined();
  });
});

describe("sizesMissingFromTarget", () => {
  it("lists sizes the target group lacks", () => {
    expect(sizesMissingFromTarget(["11", "12", "13"], ["11", "12"])).toEqual(["13"]);
    expect(sizesMissingFromTarget(["s", "M"], ["S", "m", "L"])).toEqual([]);
  });
});

describe("friendlySizeGroupError", () => {
  it("explains a foreign key block on delete", () => {
    const msg = friendlySizeGroupError(
      {
        code: "23503",
        message:
          'update or delete on table "size_groups" violates foreign key constraint "products_size_group_id_fkey" on table "products"',
      },
      "x",
    );
    expect(msg).toMatch(/still used by products/);
  });

  it("explains a duplicate name", () => {
    expect(friendlySizeGroupError({ code: "23505", message: "duplicate key" }, "x")).toMatch(
      /already exists/,
    );
  });

  it("falls back to the raw message, then the fallback", () => {
    expect(friendlySizeGroupError({ message: "boom" }, "x")).toBe("boom");
    expect(friendlySizeGroupError(null, "x")).toBe("x");
  });
});
