/**
 * Format Recycle Bin deletion actor/reason for display.
 * Automated repair batches leave notes tags but no deleted_by user.
 */

const REPAIR_TAG_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /cn_over_apply_repair/i, label: "CN over-apply repair (Jun 2026)" },
  { pattern: /phantom_cn_repair/i, label: "Phantom CN repair" },
  { pattern: /phantom credit_note_adjustment/i, label: "Phantom CN receipt cleanup" },
  { pattern: /duplicate advance application/i, label: "Duplicate advance cleanup" },
  { pattern: /\[reversed /i, label: "Reversed duplicate entry" },
  { pattern: /repair 2026/i, label: "Automated data repair" },
  { pattern: /auto-rollback/i, label: "Save rollback (empty header)" },
];

export type RecycleBinDeletionMeta = {
  deletedBy: string | null | undefined;
  notes?: string | null;
  description?: string | null;
};

/** Human-readable deletion actor. */
export function formatRecycleBinDeletedBy(meta: RecycleBinDeletionMeta): string {
  if (meta.deletedBy) return "User";
  const reason = extractRepairTag(meta.notes, meta.description);
  if (reason) return "System repair";
  return "Unknown";
}

/** Short reason extracted from notes/description tags. */
export function extractRepairTag(
  notes?: string | null,
  description?: string | null,
): string | null {
  const text = [notes, description].filter(Boolean).join("\n");
  if (!text.trim()) return null;

  for (const { pattern, label } of REPAIR_TAG_PATTERNS) {
    if (pattern.test(text)) return label;
  }

  const bracketMatch = text.match(/\[([^\]]{4,80})\]/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();

  return null;
}

/** True when restoring this row could re-introduce a double-count from a repair batch. */
export function isRepairTaggedDeletion(meta: RecycleBinDeletionMeta): boolean {
  const text = [meta.notes, meta.description].filter(Boolean).join("\n");
  if (!text.trim()) return false;
  return REPAIR_TAG_PATTERNS.some(({ pattern }) => pattern.test(text));
}
