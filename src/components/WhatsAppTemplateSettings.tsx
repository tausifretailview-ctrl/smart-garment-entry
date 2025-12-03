import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { MessageCircle, Save } from "lucide-react";

interface Template {
  id: string;
  template_type: string;
  template_name: string;
  message_template: string;
  is_active: boolean;
}

const defaultTemplates = {
  delivery_delivered: `Hello {customer_name},

Your order has been delivered successfully! ✅

Order Details:
📋 Invoice: {invoice_number}
📅 Date: {invoice_date}
💰 Amount: {amount}
💳 Payment: {payment_status}

Thank you for your business!`,
  
  delivery_in_process: `Hello {customer_name},

Your order is currently being processed 🚚

Order Details:
📋 Invoice: {invoice_number}
📅 Date: {invoice_date}
💰 Amount: {amount}
💳 Payment: {payment_status}

We will update you once it's out for delivery.`,
  
  delivery_undelivered: `Hello {customer_name},

Your order is pending delivery 📦

Order Details:
📋 Invoice: {invoice_number}
📅 Date: {invoice_date}
💰 Amount: {amount}
💳 Payment: {payment_status}

We will deliver it soon. Thank you for your patience!`,
  
  sales_invoice: `Hello {customer_name},

Thank you for your purchase! 🛍️

Invoice Details:
📋 Invoice: {invoice_number}
📅 Date: {invoice_date}
💰 Total Amount: {amount}
💳 Payment Status: {payment_status}

{invoice_items}

We appreciate your business!`,
  
  payment_reminder: `Hello {customer_name},

This is a friendly reminder regarding your pending payment 💳

Invoice Details:
📋 Invoice: {invoice_number}
📅 Invoice Date: {invoice_date}
💰 Total Amount: {amount}
💵 Paid Amount: {paid_amount}
⚠️ Pending Amount: {pending_amount}
📅 Due Date: {due_date}

Please make the payment at your earliest convenience.

Thank you for your cooperation!`,

  quotation: `Hello {customer_name},

Thank you for your interest! 📝

Here is your quotation:
📋 Quotation No: {quotation_number}
📅 Date: {quotation_date}
💰 Total Amount: {amount}
📅 Valid Until: {valid_until}

{quotation_items}

Please let us know if you'd like to proceed with this order.

Thank you!`,

  sale_order: `Hello {customer_name},

Your order has been confirmed! 🎉

Order Details:
📋 Order No: {order_number}
📅 Date: {order_date}
💰 Total Amount: {amount}
📦 Status: {status}
📅 Expected Delivery: {expected_delivery}

{order_items}

We will update you once it's ready for delivery.

Thank you for your order!`
};

const templateLabels = {
  delivery_delivered: "Delivery Completed Message",
  delivery_in_process: "Delivery In Process Message",
  delivery_undelivered: "Delivery Pending Message",
  sales_invoice: "Sales Invoice / POS Billing Message",
  payment_reminder: "Payment Reminder Message",
  quotation: "Quotation Message",
  sale_order: "Sale Order Message"
};

export const WhatsAppTemplateSettings = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState<Record<string, string>>({});

  // Fetch existing templates
  const { data: existingTemplates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      // Initialize state with existing or default templates
      const templateState: Record<string, string> = {};
      Object.keys(defaultTemplates).forEach((type) => {
        const existing = data?.find((t) => t.template_type === type);
        templateState[type] = existing?.message_template || defaultTemplates[type as keyof typeof defaultTemplates];
      });
      setTemplates(templateState);

      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Save/Update template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async ({ templateType, message }: { templateType: string; message: string }) => {
      if (!currentOrganization?.id) throw new Error("No organization selected");

      // Check if template exists
      const existing = existingTemplates?.find((t) => t.template_type === templateType);

      if (existing) {
        // Update existing template
        const { error } = await supabase
          .from("whatsapp_templates")
          .update({
            message_template: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Insert new template
        const { error } = await supabase
          .from("whatsapp_templates")
          .insert({
            organization_id: currentOrganization.id,
            template_type: templateType,
            template_name: templateLabels[templateType as keyof typeof templateLabels],
            message_template: message,
            is_active: true,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast.success("Template saved successfully");
    },
    onError: (error) => {
      console.error("Error saving template:", error);
      toast.error("Failed to save template");
    },
  });

  const handleSaveTemplate = (templateType: string) => {
    const message = templates[templateType];
    if (!message?.trim()) {
      toast.error("Template message cannot be empty");
      return;
    }

    saveTemplateMutation.mutate({ templateType, message });
  };

  const handleResetTemplate = (templateType: string) => {
    setTemplates((prev) => ({
      ...prev,
      [templateType]: defaultTemplates[templateType as keyof typeof defaultTemplates],
    }));
    toast.success("Template reset to default");
  };

  if (isLoading) {
    return <div>Loading templates...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <CardTitle>WhatsApp Message Templates</CardTitle>
        </div>
        <CardDescription>
          Customize WhatsApp messages for delivery updates, invoices, quotations, sale orders, and payment reminders. Available placeholders: {"{customer_name}"}, {"{invoice_number}"}, {"{amount}"}, {"{payment_status}"}, {"{invoice_date}"}, {"{invoice_items}"}, {"{paid_amount}"}, {"{pending_amount}"}, {"{due_date}"}, {"{quotation_number}"}, {"{quotation_date}"}, {"{valid_until}"}, {"{quotation_items}"}, {"{order_number}"}, {"{order_date}"}, {"{expected_delivery}"}, {"{order_items}"}, {"{status}"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(templateLabels).map(([type, label]) => (
          <div key={type} className="space-y-3">
            <Label htmlFor={type} className="text-base font-semibold">
              {label}
            </Label>
            <Textarea
              id={type}
              value={templates[type] || ""}
              onChange={(e) =>
                setTemplates((prev) => ({ ...prev, [type]: e.target.value }))
              }
              rows={10}
              className="font-mono text-sm"
              placeholder="Enter your message template..."
            />
            <div className="flex gap-2">
              <Button
                onClick={() => handleSaveTemplate(type)}
                disabled={saveTemplateMutation.isPending}
                size="sm"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Template
              </Button>
              <Button
                onClick={() => handleResetTemplate(type)}
                variant="outline"
                size="sm"
              >
                Reset to Default
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};