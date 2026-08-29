import { PRINT_NESTED_STYLE_TAG_HIDE_CSS } from "@/utils/printNestedStyleTagSafety";

/** Restore table layout when print visibility CSS uses broad selectors (sale return / credit note). */
export const CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS = `
  @media print {
    body .credit-note-print table {
      display: table !important;
      width: 100% !important;
      table-layout: fixed !important;
      border-collapse: collapse !important;
    }
    body .credit-note-print thead {
      display: table-header-group !important;
    }
    body .credit-note-print tbody {
      display: table-row-group !important;
    }
    body .credit-note-print tr {
      display: table-row !important;
    }
    body .credit-note-print th,
    body .credit-note-print td {
      display: table-cell !important;
      vertical-align: middle !important;
      word-wrap: break-word !important;
      overflow-wrap: anywhere !important;
    }
  }
  ${PRINT_NESTED_STYLE_TAG_HIDE_CSS}
`;

/** Beat InvoicePrint.css `body * { visibility: hidden }` for credit notes / sale returns. */
export const CREDIT_NOTE_PRINT_VISIBILITY_CSS = `
  @media print {
    body .credit-note-print-source,
    body .credit-note-print-source *,
    body .credit-note-print,
    body .credit-note-print *,
    body .sale-return-thermal,
    body .sale-return-thermal * {
      visibility: visible !important;
      opacity: 1 !important;
    }
  }
`;

export const CREDIT_NOTE_DOCUMENT_PRINT_CSS = `
  ${CREDIT_NOTE_PRINT_TABLE_LAYOUT_CSS}
  ${CREDIT_NOTE_PRINT_VISIBILITY_CSS}
`;
