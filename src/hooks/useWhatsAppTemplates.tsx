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

  const getTemplate = (templateType: string) => {
    return templates?.find((t) => t.template_type === templateType);
  };

  const formatMessage = (templateType: string, invoice: Invoice, items?: string) => {
    const template = getTemplate(templateType);
    if (!template) {
      // Return default message if no template found
      return getDefaultMessage(templateType, invoice, items);
    }

    let message = template.message_template;

    // Calculate pending amount for payment reminders
    const paidAmount = invoice.paid_amount || 0;
    const pendingAmount = invoice.net_amount - paidAmount;

    // Replace placeholders
    message = message
      .replace(/{customer_name}/g, invoice.customer_name || "Customer")
      .replace(/{invoice_number}/g, invoice.sale_number)
      .replace(/{invoice_date}/g, format(new Date(invoice.sale_date), "dd MMM yyyy"))
      .replace(/{amount}/g, `₹${Number(invoice.net_amount).toLocaleString("en-IN")}`)
      .replace(/{payment_status}/g, invoice.payment_status)
      .replace(/{invoice_items}/g, items || "")
      .replace(/{paid_amount}/g, `₹${Number(paidAmount).toLocaleString("en-IN")}`)
      .replace(/{pending_amount}/g, `₹${Number(pendingAmount).toLocaleString("en-IN")}`)
      .replace(/{due_date}/g, invoice.due_date ? format(new Date(invoice.due_date), "dd MMM yyyy") : "Not specified");

    return message;
  };

  const getDefaultMessage = (templateType: string, invoice: Invoice, items?: string) => {
    const deliveryStatusText = invoice.delivery_status === "delivered" 
      ? "delivered successfully" 
      : invoice.delivery_status === "in_process"
      ? "being processed"
      : "pending delivery";

    return `Hello ${invoice.customer_name},

Your order details:
Invoice: ${invoice.sale_number}
Date: ${format(new Date(invoice.sale_date), "dd MMM yyyy")}
Amount: ₹${Number(invoice.net_amount).toLocaleString("en-IN")}
Payment Status: ${invoice.payment_status}
${invoice.delivery_status ? `Delivery Status: ${deliveryStatusText}` : ""}

${items || ""}

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
💰 Total Amount: ₹${Number(order.net_amount).toLocaleString("en-IN")}
📦 Status: ${order.status}
📅 Expected Delivery: ${order.expected_delivery_date ? format(new Date(order.expected_delivery_date), "dd MMM yyyy") : "To be confirmed"}

${items || ""}

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