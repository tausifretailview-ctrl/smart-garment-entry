import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { TemplateParam } from "@/hooks/useWhatsAppAPI";

interface MetaTemplate {
  id: string;
  organization_id: string;
  template_name: string;
  template_category: string | null;
  template_language: string;
  template_status: string;
  components: any;
  created_at: string;
  updated_at: string;
}

// Helper to detect template header type (TEXT, DOCUMENT, IMAGE, etc.)
export function getTemplateHeaderType(components: any): 'TEXT' | 'DOCUMENT' | 'IMAGE' | 'VIDEO' | 'NONE' {
  if (!components || !Array.isArray(components)) return 'NONE';
  const headerComponent = components.find((c: any) => c?.type?.toUpperCase() === 'HEADER');
  if (!headerComponent) return 'NONE';
  const format = headerComponent?.format?.toUpperCase();
  if (format === 'DOCUMENT') return 'DOCUMENT';
  if (format === 'IMAGE') return 'IMAGE';
  if (format === 'VIDEO') return 'VIDEO';
  if (format === 'TEXT') return 'TEXT';
  return 'NONE';
}

interface MetaTemplateSelectorProps {
  templateType: 'invoice' | 'quotation' | 'sale_order' | 'payment_reminder';
  selectedTemplateId: string | null;
  selectedTemplateName: string;
  params: TemplateParam[];
  onTemplateChange: (templateId: string | null, templateName: string) => void;
  onParamsChange: (params: TemplateParam[]) => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

// Available data fields for parameter mapping
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

const templateTypeLabels: Record<string, string> = {
  invoice: 'Invoice Template',
  quotation: 'Quotation Template',
  sale_order: 'Sale Order Template',
  payment_reminder: 'Payment Reminder Template',
};

// Preset template configurations for quick setup
const TEMPLATE_PRESETS: Record<string, { name: string; description: string; params: TemplateParam[] }[]> = {
  invoice: [
    {
      name: '5-Param Invoice (Standard)',
      description: 'Customer, Invoice No, Date, Amount, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'invoice_date', label: 'Invoice Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '6-Param Invoice (With Qty)',
      description: 'Customer, Invoice No, Date, Amount, Qty, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'invoice_date', label: 'Invoice Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'items_count', label: 'Items Count' },
        { index: 6, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '4-Param Invoice (Simple)',
      description: 'Customer, Invoice No, Amount, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'amount', label: 'Amount' },
        { index: 4, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '6-Param with Invoice Link',
      description: 'Customer, Invoice No, Date, Amount, Link, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'invoice_date', label: 'Invoice Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'invoice_link', label: 'Invoice Link' },
        { index: 6, field: 'organization_name', label: 'Organization Name' },
      ],
    },
  ],
  quotation: [
    {
      name: '5-Param Quotation',
      description: 'Customer, Quotation No, Date, Amount, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'quotation_number', label: 'Quotation Number' },
        { index: 3, field: 'quotation_date', label: 'Quotation Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '6-Param with Validity',
      description: 'Customer, Quotation No, Date, Amount, Valid Until, Org',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'quotation_number', label: 'Quotation Number' },
        { index: 3, field: 'quotation_date', label: 'Quotation Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'valid_until', label: 'Valid Until' },
        { index: 6, field: 'organization_name', label: 'Organization Name' },
      ],
    },
  ],
  sale_order: [
    {
      name: '5-Param Sale Order',
      description: 'Customer, Order No, Date, Amount, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'order_number', label: 'Order Number' },
        { index: 3, field: 'order_date', label: 'Order Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '6-Param with Delivery',
      description: 'Customer, Order No, Date, Amount, Delivery Date, Org',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'order_number', label: 'Order Number' },
        { index: 3, field: 'order_date', label: 'Order Date' },
        { index: 4, field: 'amount', label: 'Amount' },
        { index: 5, field: 'delivery_date', label: 'Delivery Date' },
        { index: 6, field: 'organization_name', label: 'Organization Name' },
      ],
    },
  ],
  payment_reminder: [
    {
      name: '5-Param Payment Reminder',
      description: 'Customer, Invoice No, Amount, Due Date, Org Name',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'amount', label: 'Amount' },
        { index: 4, field: 'due_date', label: 'Due Date' },
        { index: 5, field: 'organization_name', label: 'Organization Name' },
      ],
    },
    {
      name: '6-Param with Days Overdue',
      description: 'Customer, Invoice No, Amount, Due Date, Days, Org',
      params: [
        { index: 1, field: 'customer_name', label: 'Customer Name' },
        { index: 2, field: 'invoice_number', label: 'Invoice Number' },
        { index: 3, field: 'amount', label: 'Amount' },
        { index: 4, field: 'due_date', label: 'Due Date' },
        { index: 5, field: 'days_overdue', label: 'Days Overdue' },
        { index: 6, field: 'organization_name', label: 'Organization Name' },
      ],
    },
  ],
};

export const MetaTemplateSelector = ({
  templateType,
  selectedTemplateId,
  selectedTemplateName,
  params,
  onTemplateChange,
  onParamsChange,
  isOpen,
  onOpenChange,
}: MetaTemplateSelectorProps) => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const availableFields = AVAILABLE_FIELDS[templateType] || AVAILABLE_FIELDS.invoice;
  const presets = TEMPLATE_PRESETS[templateType] || [];

  // Fetch stored approved templates
  const { data: templates, isLoading: templatesLoading, refetch } = useQuery({
    queryKey: ['meta-templates', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('whatsapp_meta_templates')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('template_status', 'APPROVED')
        .order('template_name');
      
      if (error) throw error;
      return data as MetaTemplate[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Find selected template
  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId || t.template_name === selectedTemplateName);

  // Get placeholder count from template
  const getTemplateParamCount = (template: MetaTemplate): number => {
    if (!template.components) return 0;
    const bodyComponent = template.components.find?.((c: any) => c.type === 'BODY');
    if (bodyComponent?.example?.body_text?.[0]) {
      return bodyComponent.example.body_text[0].length;
    }
    const bodyText = bodyComponent?.text || '';
    const placeholderMatches = bodyText.match(/\{\{(\d+)\}\}/g);
    return placeholderMatches ? [...new Set(placeholderMatches)].length : 0;
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (template) {
      onTemplateChange(template.id, template.template_name);
      
      // Check if we already have saved params - don't reset if switching back to same template
      if (params.length > 0 && selectedTemplateName === template.template_name) {
        return; // Keep existing params
      }
      
      // Get expected param count from template
      const expectedParamCount = getTemplateParamCount(template);
      
      // If current params length matches template, keep them (user might be switching back)
      if (params.length === expectedParamCount && params.some(p => p.field)) {
        return; // Keep existing configured params
      }
      
      // Auto-generate params based on template components if available
      let newParams: TemplateParam[] = [];
      
      if (template.components) {
        const bodyComponent = template.components.find?.((c: any) => c.type === 'BODY');
        if (bodyComponent?.example?.body_text?.[0]) {
          const exampleParams = bodyComponent.example.body_text[0];
          newParams = exampleParams.map((text: string, idx: number) => ({
            index: idx + 1,
            field: '',
            label: `Parameter ${idx + 1}`,
            customValue: undefined,
          }));
        } else {
          // Count placeholders in body text like {{1}}, {{2}}, etc.
          const bodyText = bodyComponent?.text || '';
          const placeholderMatches = bodyText.match(/\{\{(\d+)\}\}/g);
          if (placeholderMatches) {
            const uniqueNumbers = [...new Set(placeholderMatches.map((m: string) => parseInt(m.replace(/[{}]/g, ''))))];
            newParams = uniqueNumbers.sort((a: number, b: number) => a - b).map((num: number) => ({
              index: num,
              field: '',
              label: `Parameter ${num}`,
              customValue: undefined,
            }));
          }
        }
      }
      
      // Only update params if we generated new ones
      if (newParams.length > 0) {
        onParamsChange(newParams);
      }
    }
  };

  const handlePresetSelect = (preset: { name: string; params: TemplateParam[] }) => {
    onParamsChange([...preset.params]);
    toast.success(`Applied preset: ${preset.name}`);
  };

  const addParameter = () => {
    const newIndex = params.length + 1;
    onParamsChange([
      ...params,
      { index: newIndex, field: '', label: `Parameter ${newIndex}` },
    ]);
  };

  const removeParameter = (index: number) => {
    const updated = params
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, index: i + 1 }));
    onParamsChange(updated);
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
    onParamsChange(updated);
  };

  const updateCustomValue = (index: number, value: string) => {
    const updated = params.map((p, i) =>
      i === index ? { ...p, customValue: value } : p
    );
    onParamsChange(updated);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted">
          <div className="flex items-center gap-2">
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span className="font-medium">{templateTypeLabels[templateType]}</span>
            {selectedTemplateName && (
              <Badge variant="secondary" className="text-xs">
                {selectedTemplateName}
              </Badge>
            )}
          </div>
          <Badge variant={params.length > 0 ? "default" : "outline"}>
            {params.length} params
          </Badge>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-3 space-y-4">
        {/* Template Selection Dropdown */}
        <div className="space-y-2">
          <Label>Select Approved Template</Label>
          <Select
            value={selectedTemplateId || selectedTemplateName || ''}
            onValueChange={handleTemplateSelect}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a template from Meta Business Manager" />
            </SelectTrigger>
            <SelectContent>
              {templatesLoading ? (
                <div className="p-2 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading templates...
                </div>
              ) : templates && templates.length > 0 ? (
                templates.map((template) => {
                  const headerType = getTemplateHeaderType(template.components);
                  return (
                    <SelectItem key={template.id} value={template.id}>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-green-600" />
                        <span>{template.template_name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({template.template_language})
                        </span>
                        {headerType === 'DOCUMENT' && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-100 text-orange-700 border-orange-300">
                            PDF
                          </Badge>
                        )}
                        {headerType === 'TEXT' && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-100 text-green-700 border-green-300">
                            TEXT
                          </Badge>
                        )}
                        {headerType === 'NONE' && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 bg-gray-100 text-gray-600 border-gray-300">
                            UTILITY
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  );
                })
              ) : (
                <div className="p-2 text-center text-muted-foreground text-sm">
                  No approved templates found. Add templates manually below.
                </div>
              )}
            </SelectContent>
          </Select>
          
          {/* Manual template name entry as fallback */}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Or enter manually:</span>
            <Input
              placeholder="e.g., invoice_notification"
              value={selectedTemplateName}
              onChange={(e) => onTemplateChange(null, e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        {/* Template Parameters */}
        {selectedTemplateName && (
          <div className="space-y-3 border-t pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Template Parameters</Label>
              <span className="text-xs text-muted-foreground">
                {params.length} parameter{params.length !== 1 ? 's' : ''} configured
              </span>
            </div>

            {/* Quick Preset Selection */}
            {presets.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Quick Presets:</Label>
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetSelect(preset)}
                      className="text-xs h-7"
                      title={preset.description}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

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
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default MetaTemplateSelector;
