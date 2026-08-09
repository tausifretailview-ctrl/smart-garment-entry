import { describe, expect, it } from "vitest";
import { isAdvanceNumberUniqueViolation } from "@/utils/createCustomerAdvance";

describe("createCustomerAdvance helpers", () => {
  it("detects uq_customer_advances_org_number collisions", () => {
    expect(
      isAdvanceNumberUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_customer_advances_org_number"',
      }),
    ).toBe(true);
    expect(isAdvanceNumberUniqueViolation({ code: "23503", message: "fk" })).toBe(false);
  });
});
