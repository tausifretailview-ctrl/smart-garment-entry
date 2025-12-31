import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

export interface ChequeFormat {
  id: string;
  organization_id: string;
  bank_name: string;
  account_number?: string;
  date_top_mm: number;
  date_left_mm: number;
  date_spacing_mm: number;
  date_format: string;
  name_top_mm: number;
  name_left_mm: number;
  name_width_mm: number;
  words_top_mm: number;
  words_left_mm: number;
  words_line2_offset_mm: number;
  amount_top_mm: number;
  amount_left_mm: number;
  font_size_pt: number;
  cheque_width_mm: number;
  cheque_height_mm: number;
  show_ac_payee: boolean;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ChequeFormatInput = Omit<ChequeFormat, 'id' | 'organization_id' | 'created_at' | 'updated_at'>;

// Preset bank formats for common Indian banks
export const bankPresets: Record<string, ChequeFormatInput> = {
  "ICICI Bank": {
    bank_name: "ICICI Bank",
    date_top_mm: 7,
    date_left_mm: 160,
    date_spacing_mm: 4.5,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 27,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 165,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "HDFC Bank": {
    bank_name: "HDFC Bank",
    date_top_mm: 6,
    date_left_mm: 162,
    date_spacing_mm: 6.4,
    date_format: "DD/MM/YYYY",
    name_top_mm: 21,
    name_left_mm: 25,
    name_width_mm: 135,
    words_top_mm: 30,
    words_left_mm: 38,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 172,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "State Bank of India": {
    bank_name: "State Bank of India",
    date_top_mm: 8,
    date_left_mm: 155,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 22,
    name_left_mm: 25,
    name_width_mm: 125,
    words_top_mm: 30,
    words_left_mm: 30,
    words_line2_offset_mm: 6,
    amount_top_mm: 36,
    amount_left_mm: 160,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Axis Bank": {
    bank_name: "Axis Bank",
    date_top_mm: 7,
    date_left_mm: 158,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 28,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 165,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Kotak Mahindra Bank": {
    bank_name: "Kotak Mahindra Bank",
    date_top_mm: 7,
    date_left_mm: 160,
    date_spacing_mm: 4.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 28,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 33.5,
    amount_left_mm: 160,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Punjab National Bank": {
    bank_name: "Punjab National Bank",
    date_top_mm: 8,
    date_left_mm: 158,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 22,
    name_left_mm: 25,
    name_width_mm: 125,
    words_top_mm: 30,
    words_left_mm: 32,
    words_line2_offset_mm: 6,
    amount_top_mm: 35,
    amount_left_mm: 162,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Bank of Baroda": {
    bank_name: "Bank of Baroda",
    date_top_mm: 7,
    date_left_mm: 157,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 21,
    name_left_mm: 25,
    name_width_mm: 128,
    words_top_mm: 29,
    words_left_mm: 33,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 163,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Yes Bank": {
    bank_name: "Yes Bank",
    date_top_mm: 7,
    date_left_mm: 160,
    date_spacing_mm: 4.5,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 27,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 33,
    amount_left_mm: 165,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Union Bank of India": {
    bank_name: "Union Bank of India",
    date_top_mm: 8,
    date_left_mm: 156,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 22,
    name_left_mm: 25,
    name_width_mm: 125,
    words_top_mm: 30,
    words_left_mm: 32,
    words_line2_offset_mm: 6,
    amount_top_mm: 35,
    amount_left_mm: 160,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "IDFC First Bank": {
    bank_name: "IDFC First Bank",
    date_top_mm: 7,
    date_left_mm: 160,
    date_spacing_mm: 4.5,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 27,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 165,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
  "Custom": {
    bank_name: "Custom",
    date_top_mm: 7,
    date_left_mm: 160,
    date_spacing_mm: 5.0,
    date_format: "DD/MM/YYYY",
    name_top_mm: 20,
    name_left_mm: 25,
    name_width_mm: 130,
    words_top_mm: 28,
    words_left_mm: 35,
    words_line2_offset_mm: 6,
    amount_top_mm: 34,
    amount_left_mm: 165,
    font_size_pt: 12,
    cheque_width_mm: 203,
    cheque_height_mm: 89,
    show_ac_payee: true,
    is_default: false,
  },
};

export function useChequeFormats() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: formats, isLoading } = useQuery({
    queryKey: ["cheque-formats", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cheque_formats")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .order("bank_name");
      if (error) throw error;
      return data as ChequeFormat[];
    },
    enabled: !!currentOrganization?.id,
  });

  const createFormat = useMutation({
    mutationFn: async (input: ChequeFormatInput) => {
      const { data, error } = await supabase
        .from("cheque_formats")
        .insert({
          ...input,
          organization_id: currentOrganization?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-formats"] });
      toast.success("Cheque format created");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create format: ${error.message}`);
    },
  });

  const updateFormat = useMutation({
    mutationFn: async ({ id, ...input }: Partial<ChequeFormat> & { id: string }) => {
      const { data, error } = await supabase
        .from("cheque_formats")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-formats"] });
      toast.success("Cheque format updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update format: ${error.message}`);
    },
  });

  const deleteFormat = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cheque_formats")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-formats"] });
      toast.success("Cheque format deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete format: ${error.message}`);
    },
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      // First remove default from all
      await supabase
        .from("cheque_formats")
        .update({ is_default: false })
        .eq("organization_id", currentOrganization?.id);

      // Then set the new default
      const { error } = await supabase
        .from("cheque_formats")
        .update({ is_default: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cheque-formats"] });
      toast.success("Default format updated");
    },
    onError: (error: Error) => {
      toast.error(`Failed to set default: ${error.message}`);
    },
  });

  const defaultFormat = formats?.find(f => f.is_default) || formats?.[0];

  return {
    formats: formats || [],
    isLoading,
    createFormat,
    updateFormat,
    deleteFormat,
    setDefault,
    defaultFormat,
    bankPresets,
  };
}
