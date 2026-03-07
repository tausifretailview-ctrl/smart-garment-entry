import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format } from "date-fns";

interface Invoice {
  sale_number: string;
  customer_name: string;
  customer_phone: string;
  sale_date: string;
  net_amount: number;
  payment_status: string;
  delivery_status?: string;
  paid_amount?: number;
  due_date?: string;
  cash_amount?: number;
  card_amount?: number;
  upi_amount?: number;
  customer_id?: string;
  organization_id?: string;
  // Points information
  points_earned?: number;
  points_redeemed?: number;
  points_discount?: number;
  points_balance?: number;
}

interface Quotation {
  quotation_number: string;
  customer_name: string;
  customer_phone: string;
  quotation_date: string;
  net_amount: number;
  valid_until?: string;
  status: string;
}

interface SaleOrder {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  order_date: string;
  net_amount: number;
  status: string;
  expected_delivery_date?: string;
}

interface SocialLinks {
  instagram_link?: string;
  website_link?: string;
  google_review_link?: string;
}

export const useWhatsAppTemplates = () => {
  const { currentOrganization } = useOrganization();

  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("is_active", true);

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch social links from settings
  const { data: settings } = useQuery({
    queryKey: ["settings-social-links", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("settings")
        .select("bill_barcode_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) throw error;
      return data?.bill_barcode_settings as SocialLinks | null;
    },
    enabled: !!currentOrganization?.id,
  });

  const getTemplate = (templateType: string) => {
    return templates?.find((t) => t.template_type === templateType);
  };

  const buildSocialLinksText = () => {
    const links: string[] = [];
    if (settings?.instagram_link) {
      links.push(`📷 Instagram: ${settings.instagram_link}`);
    }
    if (settings?.website_link) {
      links.push(`🌐 Website: ${settings.website_link}`);
    }
    if (settings?.google_review_link) {
      links.push(`⭐ Leave a Review: ${settings.google_review_link}`);
    }
    return links.length > 0 ? `Follow us:\n${links.join('\n')}` : '';
  };

  const buildPointsText = (invoice: Invoice) => {
    const parts: string[] = [];
    if (invoice.points_earned && invoice.points_earned > 0) {
      parts.push(`🎁 Points Earned: ${invoice.points_earned} pts`);
    }
    if (invoice.points_redeemed && invoice.points_redeemed > 0) {
      parts.push(`💫 Points Redeemed: ${invoice.points_redeemed} pts (₹${Number(invoice.points_discount || invoice.points_redeemed).toLocaleString("en-IN")} discount)`);
    }
    if (invoice.points_balance !== undefined && invoice.points_balance >= 0) {
      parts.push(`💰 Points Balance: ${invoice.points_balance} pts`);
    }
    return parts.length > 0 ? parts.join("\n") : "";
  };

  const formatMessage = (templateType: string, invoice: Invoice, items?: string, customerBalance?: number, extraData?: { invoiceLink?: string; organizationName?: string }) => {
    const template = getTemplate(templateType);
    if (!template) {
      // Return default message if no template found
      return getDefaultMessage(templateType, invoice, items, customerBalance, extraData);
    }

    let message = template.message_template;

    // Calculate pending amount for payment reminders
    const paidAmount = invoice.paid_amount || 0;
    const pendingAmount = invoice.net_amount - paidAmount;

    // Build social links text
    const socialLinksText = buildSocialLinksText();

    // Build payment breakdown text
    const paymentBreakdown = buildPaymentBreakdown(invoice);

    // Build points text
    const pointsText = buildPointsText(invoice);

    // Outstanding amount (customer balance)
    const outstandingAmount = customerBalance || 0;

    // Replace placeholders
    message = message
      .replace(/{customer_name}/g, invoice.customer_name || "Customer")
      .replace(/{invoice_number}/g, invoice.sale_number)
      .replace(/{invoice_date}/g, format(new Date(invoice.sale_date), "dd MMM yyyy"))
      .replace(/{amount}/g, `₹${Number(invoice.net_amount).toLocaleString("en-IN")}`)
      .replace(/{payment_status}/g, invoice.payment_status)
      .replace(/{invoice_items}/g, items || "")
      .replace(/{invoice_link}/g, extraData?.invoiceLink || "")
      .replace(/{organization_name}/g, extraData?.organizationName || "")
      .replace(/{paid_amount}/g, `₹${Number(paidAmount).toLocaleString("en-IN")}`)
      .replace(/{pending_amount}/g, `₹${Number(pendingAmount).toLocaleString("en-IN")}`)
      .replace(/{due_date}/g, invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "Not specified")
      .replace(/{social_links}/g, socialLinksText)
      .replace(/{instagram_link}/g, settings?.instagram_link || "")
      .replace(/{website_link}/g, settings?.website_link || "")
      .replace(/{google_review_link}/g, settings?.google_review_link || "")
      .replace(/{payment_breakdown}/g, paymentBreakdown)
      .replace(/{outstanding_amount}/g, `₹${Number(outstandingAmount).toLocaleString("en-IN")}`)
      .replace(/{points_earned}/g, invoice.points_earned?.toString() || "0")
      .replace(/{points_redeemed}/g, invoice.points_redeemed?.toString() || "0")
      .replace(/{points_discount}/g, `₹${Number(invoice.points_discount || 0).toLocaleString("en-IN")}`)
      .replace(/{points_balance}/g, invoice.points_balance?.toString() || "0")
      .replace(/{points_info}/g, pointsText);

    return message;
  };

  const buildPaymentBreakdown = (invoice: Invoice) => {
    const parts: string[] = [];
    if (invoice.cash_amount && invoice.cash_amount > 0) {
      parts.push(`Cash: ₹${Number(invoice.cash_amount).toLocaleString("en-IN")}`);
    }
    if (invoice.card_amount && invoice.card_amount > 0) {
      parts.push(`Card: ₹${Number(invoice.card_amount).toLocaleString("en-IN")}`);
    }
    if (invoice.upi_amount && invoice.upi_amount > 0) {
      parts.push(`UPI: ₹${Number(invoice.upi_amount).toLocaleString("en-IN")}`);
    }
    return parts.length > 0 ? parts.join(" | ") : "";
  };

  const getDefaultMessage = (templateType: string, invoice: Invoice, items?: string, customerBalance?: number) => {
    const deliveryStatusText = invoice.delivery_status === "delivered" 
      ? "delivered successfully" 
      : invoice.delivery_status === "in_process"
      ? "being processed"
      : "pending delivery";

    const socialLinksText = buildSocialLinksText();
    const paymentBreakdown = buildPaymentBreakdown(invoice);
    const pointsText = buildPointsText(invoice);
    const outstandingAmount = customerBalance || 0;

    let paymentInfo = `Payment Status: ${invoice.payment_status}`;
    if (paymentBreakdown) {
      paymentInfo += `\nPayment: ${paymentBreakdown}`;
    }
    if (outstandingAmount > 0) {
      paymentInfo += `\n💰 Outstanding Balance: ₹${Number(outstandingAmount).toLocaleString("en-IN")}`;
    }

    return `Hello ${invoice.customer_name},

Your order details:
Invoice: ${invoice.sale_number}
Date: ${format(new Date(invoice.sale_date), "dd MMM yyyy")}
Amount: ₹${Number(invoice.net_amount).toLocaleString("en-IN")}
${paymentInfo}
${invoice.delivery_status ? `Delivery Status: ${deliveryStatusText}` : ""}
${pointsText ? `\n${pointsText}` : ""}
${items || ""}${socialLinksText ? `\n${socialLinksText}` : ''}
Thank you for your business!`;
  };

  const formatQuotationMessage = (quotation: Quotation, items?: string) => {
    const template = getTemplate("quotation");
    let message = template?.message_template || getDefaultQuotationMessage(quotation, items);

    message = message
      .replace(/{customer_name}/g, quotation.customer_name || "Customer")
      .replace(/{quotation_number}/g, quotation.quotation_number)
      .replace(/{quotation_date}/g, format(new Date(quotation.quotation_date), "dd MMM yyyy"))
      .replace(/{amount}/g, `₹${Number(quotation.net_amount).toLocaleString("en-IN")}`)
      .replace(/{valid_until}/g, quotation.valid_until ? format(new Date(quotation.valid_until), "dd MMM yyyy") : "Not specified")
      .replace(/{status}/g, quotation.status)
      .replace(/{quotation_items}/g, items || "");

    return message;
  };

  const getDefaultQuotationMessage = (quotation: Quotation, items?: string) => {
    return `Hello ${quotation.customer_name},

Thank you for your interest! 📝

Here is your quotation:
📋 Quotation No: ${quotation.quotation_number}
📅 Date: ${format(new Date(quotation.quotation_date), "dd MMM yyyy")}
💰 Total Amount: ₹${Number(quotation.net_amount).toLocaleString("en-IN")}
📅 Valid Until: ${quotation.valid_until ? format(new Date(quotation.valid_until), "dd MMM yyyy") : "Not specified"}

${items || ""}

Please let us know if you'd like to proceed with this order.

Thank you!`;
  };

  const formatSaleOrderMessage = (order: SaleOrder, items?: string) => {
    const template = getTemplate("sale_order");
    let message = template?.message_template || getDefaultSaleOrderMessage(order, items);

    message = message
      .replace(/{customer_name}/g, order.customer_name || "Customer")
      .replace(/{order_number}/g, order.order_number)
      .replace(/{order_date}/g, format(new Date(order.order_date), "dd MMM yyyy"))
      .replace(/{amount}/g, `₹${Number(order.net_amount).toLocaleString("en-IN")}`)
      .replace(/{status}/g, order.status)
      .replace(/{expected_delivery}/g, order.expected_delivery_date ? format(new Date(order.expected_delivery_date), "dd MMM yyyy") : "To be confirmed")
      .replace(/{order_items}/g, items || "");

    return message;
  };

  const getDefaultSaleOrderMessage = (order: SaleOrder, items?: string) => {
    return `Hello ${order.customer_name},

Your order has been confirmed! 🎉

Order Details:
📋 Order No: ${order.order_number}
📅 Date: ${format(new Date(order.order_date), "dd MMM yyyy")}
📦 ${items || ""}
💰 Total Amount: ₹${Number(order.net_amount).toLocaleString("en-IN")}

We will update you once it's ready for delivery.

Thank you for your order!`;
  };

  return {
    templates,
    getTemplate,
    formatMessage,
    formatQuotationMessage,
    formatSaleOrderMessage,
  };
};