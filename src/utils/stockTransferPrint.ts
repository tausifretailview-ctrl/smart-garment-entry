import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { appPrint } from "@/utils/appPrint";
import { buildTransferNoteHtml, transferStatus } from "@/utils/stockTransfer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const STATUS_TEXT = {
  pending: "WAITING TO BE RECEIVED",
  accepted: null,
  rejected: "REJECTED",
  cancelled: "CANCELLED",
} as const;

/** A4 transfer note for one transfer (Entry after send, Dashboard print button). */
export async function printStockTransferNote(transferId: string, shopName: (id: string) => string): Promise<void> {
  const [{ data: t, error: tErr }, { data: items, error: iErr }] = await Promise.all([
    db.from("stock_transfers").select("*").eq("id", transferId).single(),
    db
      .from("stock_transfer_items")
      .select("product_name, barcode, size, color, qty, unit_cost, line_value")
      .eq("transfer_id", transferId)
      .order("created_at"),
  ]);
  if (tErr || iErr || !t) {
    toast.error("Could not load the transfer for printing");
    return;
  }
  const status = transferStatus(t);
  const html = buildTransferNoteHtml({
    transfer_number: t.transfer_number,
    transfer_date: t.transfer_date,
    from_name: shopName(t.from_organization_id),
    to_name: shopName(t.to_organization_id),
    notes: t.notes,
    cancelled: status === "cancelled",
    status_text: STATUS_TEXT[status],
    items: items || [],
  });
  const res = await appPrint({ type: "report", html, silent: false });
  if (!res.success && res.error) toast.error(res.error);
}
