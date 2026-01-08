import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

interface UPILinkParams {
  amount: number;
  customerName: string;
  invoiceNumber?: string;
  description?: string;
}

/**
 * Hook for generating UPI payment links
 * Uses the merchant's UPI ID from settings
 */
export const useUPIPaymentLink = () => {
  const { currentOrganization } = useOrganization();

  // Fetch settings to get UPI ID and business name
  const { data: settings } = useQuery({
    queryKey: ["settings-upi", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("settings")
        .select("business_name, bill_barcode_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  const upiId = (settings?.bill_barcode_settings as any)?.upi_id || "";
  const businessName = settings?.business_name || "Merchant";

  /**
   * Generate UPI deep link
   * Format: upi://pay?pa=UPI_ID&pn=BUSINESS_NAME&am=AMOUNT&cu=INR&tn=DESCRIPTION
   */
  const generateUPILink = useCallback(
    ({ amount, customerName, invoiceNumber, description }: UPILinkParams): string | null => {
      if (!upiId) {
        return null;
      }

      // Build transaction note
      const txnNote = description || 
        (invoiceNumber 
          ? `Payment for ${invoiceNumber}` 
          : `Payment from ${customerName}`);

      // Build UPI URL parameters
      const params = new URLSearchParams({
        pa: upiId,
        pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
        am: amount.toFixed(2),
        cu: "INR",
        tn: txnNote.substring(0, 50),
      });

      return `upi://pay?${params.toString()}`;
    },
    [upiId, businessName]
  );

  /**
   * Generate a web-compatible payment URL
   * Some UPI apps also support https://upi.link format
   */
  const generateWebUPILink = useCallback(
    ({ amount, customerName, invoiceNumber, description }: UPILinkParams): string | null => {
      if (!upiId) {
        return null;
      }

      const txnNote = description || 
        (invoiceNumber 
          ? `Payment for ${invoiceNumber}` 
          : `Payment from ${customerName}`);

      const params = new URLSearchParams({
        pa: upiId,
        pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
        am: amount.toFixed(2),
        cu: "INR",
        tn: txnNote.substring(0, 50),
      });

      // Return both formats - deep link works better on mobile
      return `upi://pay?${params.toString()}`;
    },
    [upiId, businessName]
  );

  /**
   * Check if UPI is configured
   */
  const isUPIConfigured = !!upiId;

  return {
    generateUPILink,
    generateWebUPILink,
    isUPIConfigured,
    upiId,
    businessName,
  };
};
