import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { applyCreditNoteFifoToSale, getAvailableCN } from "@/utils/saleSettlement";
import { buildCreditNoteIssuanceVoucher } from "@/utils/creditNoteIssuanceVoucher";

interface CreditNoteData {
  saleId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  creditAmount: number;
  notes?: string;
  saleNumber?: string | null;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  credit_amount: number;
  used_amount: number;
  status: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  created_at: string;
}

async function writeIssuanceVoucher(params: {
  organizationId: string;
  customerId: string | null;
  creditNoteId: string | null;
  creditNoteNumber: string;
  saleNumber: string | null;
  creditAmount: number;
  createdBy: string | null;
}): Promise<void> {
  if (!params.customerId || !params.creditNoteId || !params.creditNoteNumber) return;
  const amount = Math.round(Number(params.creditAmount) * 100) / 100;
  if (!(amount > 0.005)) return;

  // Idempotency: one issuance voucher per credit note (retries/re-saves
  // must not stack duplicate linkage rows).
  const { data: existing, error: existingError } = await supabase
    .from("voucher_entries")
    .select("id, description")
    .eq("organization_id", params.organizationId)
    .eq("voucher_type", "credit_note")
    .eq("reference_type", "customer")
    .eq("reference_id", params.customerId)
    .is("deleted_at", null);
  if (existingError) throw existingError;
  if ((existing || []).some((v) => String((v as { description?: unknown }).description || "").includes(params.creditNoteNumber))) {
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: voucherNumber, error: numberError } = await supabase.rpc(
    "generate_voucher_number" as never,
    { p_type: "credit_note", p_date: today } as never,
  );
  if (numberError) throw numberError;

  const row = buildCreditNoteIssuanceVoucher({
    organizationId: params.organizationId,
    voucherNumber: String(voucherNumber || ""),
    customerId: params.customerId,
    creditNoteNumber: params.creditNoteNumber,
    saleNumber: params.saleNumber,
    creditAmount: amount,
    voucherDate: today,
    createdBy: params.createdBy,
  });
  if (!row) return;

  const { error: insertError } = await supabase.from("voucher_entries").insert(row as never);
  if (insertError) throw insertError;
}

export function useCreditNotes() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const createCreditNote = async (data: CreditNoteData) => {
    if (!currentOrganization?.id) {
      toast({
        title: "Error",
        description: "Organization not found",
        variant: "destructive",
      });
      return null;
    }

    setIsCreating(true);
    try {
      // Generate credit note number
      const { data: creditNoteNumber, error: numError } = await supabase.rpc(
        'generate_credit_note_number',
        { p_organization_id: currentOrganization.id }
      );

      if (numError) throw numError;

      // Create credit note
      const { data: creditNote, error: insertError } = await supabase
        .from('credit_notes')
        .insert({
          organization_id: currentOrganization.id,
          credit_note_number: creditNoteNumber,
          sale_id: data.saleId,
          customer_id: data.customerId || null,
          customer_name: data.customerName,
          customer_phone: data.customerPhone || null,
          credit_amount: data.creditAmount,
          used_amount: 0,
          status: 'active',
          notes: data.notes || null,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Update the sale to link the credit note
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          credit_note_id: creditNote.id,
          credit_note_amount: data.creditAmount,
        })
        .eq('id', data.saleId);

      if (updateError) throw updateError;

      // Issuance linkage: this CN has no sale_returns row, so balance paths
      // that detect CNs via the sale_returns join would never see it. Mirror
      // it into voucher_entries (type credit_note, ref customer) so the
      // bulk/calculation CN paths pick it up. Failure-isolated: voucher
      // INSERT needs admin/manager while CN issuance is member-level, so a
      // voucher failure must never fail the CN itself.
      try {
        await writeIssuanceVoucher({
          organizationId: currentOrganization.id,
          customerId: data.customerId || null,
          creditNoteId: (creditNote as { id?: string }).id || null,
          creditNoteNumber: String(
            (creditNote as { credit_note_number?: unknown }).credit_note_number || ""
          ),
          saleNumber: data.saleNumber || null,
          creditAmount: data.creditAmount,
          createdBy: user?.id || null,
        });
      } catch (voucherErr) {
        console.error("Credit note issuance voucher failed (CN issued, linkage missing):", {
          organizationId: currentOrganization.id,
          creditNoteId: (creditNote as { id?: string }).id || null,
          error: voucherErr,
        });
      }

      toast({
        title: "Credit Note Issued",
        description: `Credit Note ${creditNoteNumber} issued for ₹${data.creditAmount.toFixed(2)}`,
      });

      return creditNote;
    } catch (error: any) {
      console.error("Error creating credit note:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create credit note",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const fetchCustomerCreditNotes = async (customerId: string): Promise<CreditNote[]> => {
    if (!currentOrganization?.id) return [];

    try {
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('customer_id', customerId)
        .eq('status', 'active')
        .order('created_at', { ascending: true }); // FIFO - oldest first

      if (error) throw error;
      return (data || []) as CreditNote[];
    } catch (error: any) {
      console.error("Error fetching credit notes:", error);
      return [];
    }
  };

  const getAvailableCreditBalance = async (customerId: string): Promise<number> => {
    const notes = await fetchCustomerCreditNotes(customerId);
    return notes.reduce((sum, note) => {
      const balance = (note.credit_amount || 0) - (note.used_amount || 0);
      return sum + Math.max(0, balance);
    }, 0);
  };

  // Apply credit from customer's credit notes to a sale (FIFO)
  const applyCredit = async (
    customerId: string,
    saleId: string,
    amountToApply: number,
    idempotencyKey?: string | null,
  ): Promise<{ success: boolean; appliedAmount: number; creditNotesUsed: string[] }> => {
    if (!currentOrganization?.id || !saleId || amountToApply <= 0) {
      return { success: false, appliedAmount: 0, creditNotesUsed: [] };
    }

    setIsApplying(true);
    try {
      const { returns: cnPool } = await getAvailableCN(
        supabase,
        customerId,
        currentOrganization.id,
        { includeUnlinkedAdjusted: true },
      );
      if (!cnPool.length) {
        throw new Error("No credit note balance available for this customer");
      }

      const fifo = await applyCreditNoteFifoToSale(supabase, {
        organizationId: currentOrganization.id,
        saleId,
        amount: amountToApply,
        cnPool,
        adjustedBy: user?.id ?? null,
        notes: "POS credit apply (FIFO)",
        idempotencyKey: idempotencyKey || null,
      });

      const totalApplied = fifo.applied;
      const creditNotesUsed = fifo.chunks.map((c) => c.voucherNumber).filter(Boolean);

      if (totalApplied > 0) {
        toast({
          title: "Credit Applied",
          description: `₹${totalApplied.toFixed(2)} credit applied from ${fifo.chunks.length} allocation(s)`,
        });
      }

      return { success: true, appliedAmount: totalApplied, creditNotesUsed };
    } catch (error: any) {
      console.error("Error applying credit:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to apply credit",
        variant: "destructive",
      });
      return { success: false, appliedAmount: 0, creditNotesUsed: [] };
    } finally {
      setIsApplying(false);
    }
  };

  return {
    createCreditNote,
    fetchCustomerCreditNotes,
    getAvailableCreditBalance,
    applyCredit,
    isCreating,
    isApplying,
  };
}
