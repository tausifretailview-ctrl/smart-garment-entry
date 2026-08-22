import { describe, expect, it } from "vitest";
import {
  extractRepairTag,
  formatRecycleBinDeletedBy,
  isRepairTaggedDeletion,
} from "@/utils/recycleBinDeletionReason";

describe("recycleBinDeletionReason", () => {
  it("labels system repair when notes carry cn_over_apply tag", () => {
    const meta = {
      deletedBy: null,
      notes:
        "[cn_over_apply_repair_20260606] phantom credit_note_adjustment receipt removed",
    };
    expect(formatRecycleBinDeletedBy(meta)).toBe("System repair");
    expect(extractRepairTag(meta.notes)).toBe("CN over-apply repair (Jun 2026)");
    expect(isRepairTaggedDeletion(meta)).toBe(true);
  });

  it("labels user when deleted_by is set", () => {
    const meta = {
      deletedBy: "user-uuid",
      notes: "[cn_over_apply_repair_20260606] should not win",
    };
    expect(formatRecycleBinDeletedBy(meta)).toBe("User");
  });

  it("returns unknown for blank metadata", () => {
    expect(formatRecycleBinDeletedBy({ deletedBy: null })).toBe("Unknown");
    expect(isRepairTaggedDeletion({ deletedBy: null })).toBe(false);
  });
});
