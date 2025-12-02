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

  return {
    templates,
    getTemplate,
    formatMessage,
  };
};