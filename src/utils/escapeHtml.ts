/**
 * Escape text for HTML built as a string (print windows, barcode labels written with
 * innerHTML / document.write). Product, customer and voucher text is typed by users or
 * imported from Excel, so it must never be read as markup in the app's own origin.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
