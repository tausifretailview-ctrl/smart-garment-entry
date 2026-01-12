import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface TemplateParam {
  index: number;
  field: string;
  label: string;
  customValue?: string;
}

interface TemplateParamMapperProps {
  templateType: 'invoice' | 'quotation' | 'sale_order' | 'payment_reminder';
  templateName: string;
  params: TemplateParam[];
  onChange: (params: TemplateParam[]) => void;
}

// Available data fields for each template type
const AVAILABLE_FIELDS: Record<string, { key: string; label: string; description: string }[]> = {
  invoice: [
    { key: 'customer_name', label: 'Customer Name', description: 'Customer\'s name' },
    { key: 'invoice_number', label: 'Invoice Number', description: 'Invoice/Sale number' },
    { key: 'invoice_date', label: 'Invoice Date', description: 'Formatted date (e.g., 11 Jan 2026)' },
    { key: 'amount', label: 'Amount', description: 'Net amount (e.g., 15,000)' },
    { key: 'gross_amount', label: 'Gross Amount', description: 'Amount before discounts' },
    { key: 'discount', label: 'Discount Amount', description: 'Total discount applied' },
    { key: 'payment_status', label: 'Payment Status', description: 'Paid / Pending / Partial' },
    { key: 'organization_name', label: 'Organization Name', description: 'Your business name' },
    { key: 'items_count', label: 'Items Count', description: 'Total quantity of items in invoice' },
    { key: 'due_date', label: 'Due Date', description: 'Payment due date' },
    { key: 'salesman', label: 'Salesman', description: 'Salesperson name' },
    { key: 'invoice_link', label: 'Invoice Link', description: 'Public URL to view invoice online' },
    { key: 'payment_link', label: 'Payment Link', description: 'UPI/Payment gateway URL' },
    { key: 'website', label: 'Website', description: 'Organization website URL' },
    { key: 'instagram', label: 'Instagram', description: 'Instagram profile link' },
    { key: 'facebook', label: 'Facebook', description: 'Facebook page link' },
    { key: 'custom_text', label: 'Custom Text', description: 'Enter your own static text' },
  ],
  quotation: [
    { key: 'customer_name', label: 'Customer Name', description: 'Customer\'s name' },
    { key: 'quotation_number', label: 'Quotation Number', description: 'Quotation reference number' },
    { key: 'quotation_date', label: 'Quotation Date', description: 'Formatted date' },
    { key: 'amount', label: 'Amount', description: 'Net amount' },
    { key: 'valid_until', label: 'Valid Until', description: 'Quotation validity date' },
    { key: 'organization_name', label: 'Organization Name', description: 'Your business name' },
    { key: 'items_count', label: 'Items Count', description: 'Total quantity of items' },
    { key: 'salesman', label: 'Salesman', description: 'Salesperson name' },
    { key: 'custom_text', label: 'Custom Text', description: 'Enter your own static text' },
  ],
  sale_order: [
    { key: 'customer_name', label: 'Customer Name', description: 'Customer\'s name' },
    { key: 'order_number', label: 'Order Number', description: 'Sale order reference number' },
    { key: 'order_date', label: 'Order Date', description: 'Formatted date' },
    { key: 'amount', label: 'Amount', description: 'Net amount' },
    { key: 'delivery_date', label: 'Delivery Date', description: 'Expected delivery date' },
    { key: 'organization_name', label: 'Organization Name', description: 'Your business name' },
    { key: 'items_count', label: 'Items Count', description: 'Total quantity of items' },
    { key: 'salesman', label: 'Salesman', description: 'Salesperson name' },
    { key: 'custom_text', label: 'Custom Text', description: 'Enter your own static text' },
  ],
  payment_reminder: [
    { key: 'customer_name', label: 'Customer Name', description: 'Customer\'s name' },
    { key: 'invoice_number', label: 'Invoice Number', description: 'Invoice reference' },
    { key: 'amount', label: 'Outstanding Amount', description: 'Amount due' },
    { key: 'due_date', label: 'Due Date', description: 'Payment due date' },
    { key: 'days_overdue', label: 'Days Overdue', description: 'Number of days past due' },
    { key: 'organization_name', label: 'Organization Name', description: 'Your business name' },
    { key: 'contact_number', label: 'Contact Number', description: 'Your business phone' },
    { key: 'custom_text', label: 'Custom Text', description: 'Enter your own static text' },
  ],
};

export const TemplateParamMapper = ({
  templateType,
  templateName,
  params,
  onChange,
}: TemplateParamMapperProps) => {
  const availableFields = AVAILABLE_FIELDS[templateType] || AVAILABLE_FIELDS.invoice;

  const addParameter = () => {
    const newIndex = params.length + 1;
    onChange([
      ...params,
      { index: newIndex, field: '', label: `Parameter ${newIndex}` },
    ]);
  };

  const removeParameter = (index: number) => {
    const updated = params
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, index: i + 1 }));
    onChange(updated);
  };

  const updateParameter = (index: number, field: string, customValue?: string) => {
    const fieldInfo = availableFields.find((f) => f.key === field);
    const updated = params.map((p, i) =>
      i === index
        ? {
            ...p,
            field,
            label: fieldInfo?.label || field,
            customValue: field === 'custom_text' ? customValue : undefined,
          }
        : p
    );
    onChange(updated);
  };

  const updateCustomValue = (index: number, value: string) => {
    const updated = params.map((p, i) =>
      i === index ? { ...p, customValue: value } : p
    );
    onChange(updated);
  };

  if (!templateName) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Enter a template name above to configure its parameters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Template Parameters</Label>
        <span className="text-xs text-muted-foreground">
          {params.length} parameter{params.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2">
        {params.map((param, index) => (
          <div
            key={index}
            className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
          >
            <div className="flex items-center justify-center w-6 h-6 bg-primary/10 rounded text-xs font-medium text-primary">
              {index + 1}
            </div>
            
            <Select
              value={param.field}
              onValueChange={(value) => updateParameter(index, value)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select data field" />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((field) => (
                  <SelectItem key={field.key} value={field.key}>
                    <div className="flex flex-col">
                      <span>{field.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {field.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {param.field === 'custom_text' && (
              <Input
                placeholder="Enter custom text"
                value={param.customValue || ''}
                onChange={(e) => updateCustomValue(index, e.target.value)}
                className="w-40"
              />
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeParameter(index)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addParameter}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Parameter
      </Button>

      <p className="text-xs text-muted-foreground">
        Match parameters exactly as defined in your Meta template. The order must match.
      </p>
    </div>
  );
};

export default TemplateParamMapper;
