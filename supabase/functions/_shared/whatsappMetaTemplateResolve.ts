/** Resolve Meta template language/components from synced whatsapp_meta_templates rows. */

export type WhatsAppMetaTemplateRow = {
  template_name?: string | null;
  template_language?: string | null;
  template_status?: string | null;
  components?: unknown;
};

export function isApprovedMetaTemplateStatus(status?: string | null): boolean {
  if (!status) return true;
  return String(status).trim().toUpperCase() === "APPROVED";
}

/**
 * Prefer APPROVED + en_US, then en, then any remaining row.
 * Returns null when the named template was never synced (do not guess en_US).
 */
export function pickSyncedWhatsAppMetaTemplate(
  rows: WhatsAppMetaTemplateRow[] | null | undefined,
): WhatsAppMetaTemplateRow | null {
  if (!rows?.length) return null;
  const approved = rows.filter((r) => isApprovedMetaTemplateStatus(r.template_status));
  const pool = approved.length > 0 ? approved : rows;
  return (
    pool.find((r) => r.template_language === "en_US") ||
    pool.find((r) => r.template_language === "en") ||
    pool[0]
  );
}

export function missingWhatsAppTemplateError(templateName: string): string {
  const name = templateName.trim() || "(blank)";
  return (
    `WhatsApp template "${name}" was not found on this Business Account. ` +
    `Open Settings → WhatsApp, click Sync Templates, then select an Approved invoice template. ` +
    `Meta rejects sends when the name/language (often invoice_1 + en_US) does not exist.`
  );
}
