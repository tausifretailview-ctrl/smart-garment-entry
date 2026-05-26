/** Matches `journal_entries.reference_type` CHECK constraint. */
export type JournalReferenceType =
  | "Sale"
  | "Purchase"
  | "Payment"
  | "StudentFeeReceipt"
  | "StudentFeeBalanceAdjustment"
  | "ExpenseVoucher"
  | "SalaryVoucher"
  | "CustomerReceipt"
  | "SupplierPayment"
  | "CustomerAdvanceApplication"
  | "CustomerCreditNoteApplication"
  | "CustomerAdvanceReceipt"
  | "CustomerAdvanceRefund"
  | "SaleReturn"
  | "PurchaseReturn"
  | "ManualJournal"
  | "Contra"
  | "RoundOff";

export type PartyType = "customer" | "supplier";

export type PostJournalLineInput = {
  accountId: string;
  debitAmount: number;
  creditAmount: number;
  partyType?: PartyType | null;
  partyId?: string | null;
  partyNameSnapshot?: string | null;
};

export type PostJournalEntryInput = {
  organizationId: string;
  date: string;
  referenceType: JournalReferenceType;
  referenceId: string;
  description: string;
  lines: PostJournalLineInput[];
  client?: any;
};

export type PostJournalEntryResult =
  | { status: "created"; journalEntryId: string }
  | { status: "already_exists"; journalEntryId: string };
