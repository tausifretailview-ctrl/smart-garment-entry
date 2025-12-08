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

export function useCreditNotes() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

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

  const fetchCustomerCreditNotes = async (customerId: string) => {
    if (!currentOrganization?.id) return [];

    try {
      const { data, error } = await supabase
        .from('credit_notes')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('customer_id', customerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error("Error fetching credit notes:", error);
      return [];
    }
  };

  const getAvailableCreditBalance = async (customerId: string) => {
    const notes = await fetchCustomerCreditNotes(customerId);
    return notes.reduce((sum, note) => {
      const balance = (note.credit_amount || 0) - (note.used_amount || 0);
      return sum + Math.max(0, balance);
    }, 0);
  };

  return {
    createCreditNote,
    fetchCustomerCreditNotes,
    getAvailableCreditBalance,
    isCreating,
  };
}
