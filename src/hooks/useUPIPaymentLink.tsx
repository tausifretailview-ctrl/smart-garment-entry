import { useCallback } from "react";
import { useSettings } from "@/hooks/useSettings";
import { resolveCompanyUpiId } from "@/utils/companyUpi";

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
  // Fetch settings to get UPI ID and business name
  const { data: settings } = useSettings();

  const upiId = resolveCompanyUpiId(settings?.bill_barcode_settings as any);
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

      // Ensure amount is a valid number
      const validAmount = isNaN(amount) || amount === null || amount === undefined ? 0 : amount;

      // Build transaction note
      const txnNote = description || 
        (invoiceNumber 
          ? `Payment for ${invoiceNumber}` 
          : `Payment from ${customerName}`);

      // Build UPI URL parameters
      const params = new URLSearchParams({
        pa: upiId,
        pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
        am: validAmount.toFixed(2),
        cu: "INR",
        tn: txnNote.substring(0, 50),
      });

      return `upi://pay?${params.toString()}`;
    },
    [upiId, businessName]
  );

  /**
   * Generate a clickable web payment page URL
   * This URL opens a payment page with a "Pay Now" button that triggers UPI
   */
  const generateWebPaymentLink = useCallback(
    ({ amount, invoiceNumber, description }: UPILinkParams): string | null => {
      if (!upiId) {
        return null;
      }

      // Ensure amount is a valid number
      const validAmount = isNaN(amount) || amount === null || amount === undefined ? 0 : amount;

      const txnNote = description || 
        (invoiceNumber 
          ? `Payment for ${invoiceNumber}` 
          : "Payment");

      // Build URL for the public payment page
      const params = new URLSearchParams({
        pa: upiId,
        pn: businessName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 50),
        am: validAmount.toFixed(2),
        tn: txnNote.substring(0, 50),
      });

      // Get the base URL of the app
      const baseUrl = window.location.origin;
      
      return `${baseUrl}/pay?${params.toString()}`;
    },
    [upiId, businessName]
  );

  /**
   * Check if UPI is configured
   */
  const isUPIConfigured = !!upiId;

  return {
    generateUPILink,
    generateWebPaymentLink,
    isUPIConfigured,
    upiId,
    businessName,
  };
};
