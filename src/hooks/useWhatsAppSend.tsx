import { useCallback } from "react";
import { toast } from "sonner";

/**
 * Reusable hook for sending WhatsApp messages with improved clipboard fallback
 * for Desktop app compatibility
 */
export const useWhatsAppSend = () => {
  /**
   * Format phone number for WhatsApp API
   * Ensures 91 country code prefix for Indian numbers
   */
  const formatPhoneNumber = useCallback((phone: string): string => {
    if (!phone) return "";
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, "");
    
    // Add 91 prefix if not present (for Indian numbers)
    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }
    
    // If already has country code, return as is
    return cleaned;
  }, []);

  /**
   * Get keyboard shortcut based on OS
   */
  const getKeyboardShortcut = useCallback((): string => {
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0 ||
                  navigator.userAgent?.toUpperCase().indexOf("MAC") >= 0;
    return isMac ? "Cmd+V" : "Ctrl+V";
  }, []);

  /**
   * Copy text to clipboard with error handling
   */
  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      return false;
    }
  }, []);

  /**
   * Send WhatsApp message with clipboard fallback for Desktop app
   * @param phone - Phone number to send message to
   * @param message - Message content
   * @param openInNewTab - Whether to open in new tab (default: true for better UX)
   */
  const sendWhatsApp = useCallback(async (
    phone: string, 
    message: string, 
    openInNewTab: boolean = true
  ): Promise<void> => {
    if (!phone) {
      toast.error("Phone number is required");
      return;
    }

    const shortcut = getKeyboardShortcut();
    const formattedPhone = formatPhoneNumber(phone);
    
    // Copy message to clipboard first
    const copied = await copyToClipboard(message);
    
    if (copied) {
      toast.success(`✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill`, {
        duration: 5000,
      });
    } else {
      toast.warning("Couldn't copy to clipboard automatically. Please copy the message manually.", {
        duration: 5000,
      });
    }

    // Build WhatsApp URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    // Small delay to ensure toast is visible before redirect
    setTimeout(() => {
      if (openInNewTab) {
        window.open(whatsappUrl, "_blank");
      } else {
        window.location.href = whatsappUrl;
      }
    }, 300);
  }, [formatPhoneNumber, getKeyboardShortcut, copyToClipboard]);

  /**
   * Copy invoice link to clipboard
   * @param invoiceUrl - URL to copy
   */
  const copyInvoiceLink = useCallback(async (invoiceUrl: string): Promise<void> => {
    const copied = await copyToClipboard(invoiceUrl);
    
    if (copied) {
      toast.success("Invoice link copied to clipboard!");
    } else {
      toast.error("Failed to copy link to clipboard");
    }
  }, [copyToClipboard]);

  return {
    sendWhatsApp,
    copyInvoiceLink,
    formatPhoneNumber,
    copyToClipboard,
    getKeyboardShortcut,
  };
};
