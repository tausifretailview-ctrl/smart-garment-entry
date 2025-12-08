import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";

interface CreditNoteData {
  saleId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  creditAmount: number;
  notes?: string;
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
  const applyCredit = async (customerId: string, amountToApply: number): Promise<{ success: boolean; appliedAmount: number; creditNotesUsed: string[] }> => {
    if (!currentOrganization?.id || amountToApply <= 0) {
      return { success: false, appliedAmount: 0, creditNotesUsed: [] };
    }

    setIsApplying(true);
    try {
      // Fetch active credit notes for customer (ordered by creation date - FIFO)
      const creditNotes = await fetchCustomerCreditNotes(customerId);
      
      let remainingToApply = amountToApply;
      let totalApplied = 0;
      const creditNotesUsed: string[] = [];

      // Apply to each credit note in FIFO order
      for (const note of creditNotes) {
        if (remainingToApply <= 0) break;

        const availableBalance = note.credit_amount - note.used_amount;
        if (availableBalance <= 0) continue;

        const amountFromThisNote = Math.min(remainingToApply, availableBalance);
        const newUsedAmount = note.used_amount + amountFromThisNote;
        
        // Determine new status
        let newStatus = 'active';
        if (newUsedAmount >= note.credit_amount) {
          newStatus = 'fully_used';
        } else if (newUsedAmount > 0) {
          newStatus = 'partially_used';
        }

        // Update credit note
        const { error } = await supabase
          .from('credit_notes')
          .update({
            used_amount: newUsedAmount,
            status: newStatus,
          })
          .eq('id', note.id);

        if (error) {
          console.error("Error updating credit note:", error);
          continue;
        }

        totalApplied += amountFromThisNote;
        remainingToApply -= amountFromThisNote;
        creditNotesUsed.push(note.credit_note_number);
      }

      if (totalApplied > 0) {
        toast({
          title: "Credit Applied",
          description: `₹${totalApplied.toFixed(2)} credit applied from ${creditNotesUsed.length} credit note(s)`,
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
