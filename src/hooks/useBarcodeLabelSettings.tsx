import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

interface LabelFieldConfig {
  show: boolean;
  fontSize: number;
  bold: boolean;
  fontFamily?: string;
  textAlign?: 'left' | 'center' | 'right';
}

interface LabelDesignConfig {
  brand: LabelFieldConfig;
  productName: LabelFieldConfig;
  color: LabelFieldConfig;
  style: LabelFieldConfig;
  size: LabelFieldConfig;
  price: LabelFieldConfig;
  barcode: LabelFieldConfig;
  barcodeText: LabelFieldConfig;
  billNumber: LabelFieldConfig;
  supplierCode: LabelFieldConfig;
  purchaseCode: LabelFieldConfig;
  fieldOrder: Array<keyof Omit<LabelDesignConfig, 'fieldOrder' | 'barcodeHeight' | 'barcodeWidth'>>;
  barcodeHeight?: number;
  barcodeWidth?: number;
}

interface LabelTemplate {
  name: string;
  config: LabelDesignConfig;
}

interface MarginPreset {
  name: string;
  topOffset: number;
  leftOffset: number;
  bottomOffset: number;
  rightOffset: number;
  description?: string;
}

interface CustomPreset {
  name: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  gap: number;
  scale?: number;
}

interface DefaultFormat {
  defaultTemplate?: string | null;
  sheetType?: string;
  labelConfig?: LabelDesignConfig;
  topOffset?: number;
  leftOffset?: number;
  bottomOffset?: number;
  rightOffset?: number;
  printScale?: number;
  customPresetName?: string;
  customDimensions?: {
    width: number;
    height: number;
    cols: number;
    rows: number;
    gap: number;
    scale?: number;
  };
}

export function useBarcodeLabelSettings() {
  const { currentOrganization } = useOrganization();
  const [labelTemplates, setLabelTemplates] = useState<LabelTemplate[]>([]);
  const [marginPresets, setMarginPresets] = useState<MarginPreset[]>([]);
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [defaultFormat, setDefaultFormat] = useState<DefaultFormat | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all settings from database
  const fetchSettings = useCallback(async () => {
    if (!currentOrganization?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("barcode_label_settings")
        .select("*")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      const templates: LabelTemplate[] = [];
      const margins: MarginPreset[] = [];
      const customs: CustomPreset[] = [];
      let defaultFmt: DefaultFormat | null = null;

      data?.forEach((row) => {
        const settingData = row.setting_data as any;
        
        switch (row.setting_type) {
          case "label_template":
            templates.push({
              name: row.setting_name,
              config: settingData.config,
            });
            break;
          case "margin_preset":
            margins.push({
              name: row.setting_name,
              ...settingData,
            });
            break;
          case "sheet_preset":
            customs.push({
              name: row.setting_name,
              ...settingData,
            });
            break;
          case "default_format":
            defaultFmt = settingData;
            break;
        }
      });

      setLabelTemplates(templates);
      setMarginPresets(margins);
      setCustomPresets(customs);
      setDefaultFormat(defaultFmt);
    } catch (error) {
      console.error("Failed to fetch barcode settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrganization?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save label template
  const saveLabelTemplate = async (template: LabelTemplate): Promise<boolean> => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return false;
    }

    try {
      const { error } = await supabase
        .from("barcode_label_settings")
        .upsert({
          organization_id: currentOrganization.id,
          setting_type: "label_template",
          setting_name: template.name,
          setting_data: { config: template.config } as any,
        } as any, {
          onConflict: "organization_id,setting_type,setting_name",
        });

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to save label template:", error);
      toast.error("Failed to save template");
      return false;
    }
  };

  // Delete label template
  const deleteLabelTemplate = async (templateName: string): Promise<boolean> => {
    if (!currentOrganization?.id) return false;

    try {
      const { error } = await supabase
        .from("barcode_label_settings")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("setting_type", "label_template")
        .eq("setting_name", templateName);

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to delete label template:", error);
      toast.error("Failed to delete template");
      return false;
    }
  };

  // Save margin preset
  const saveMarginPreset = async (preset: MarginPreset): Promise<boolean> => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return false;
    }

    try {
      const { name, ...presetData } = preset;
      const { error } = await supabase
        .from("barcode_label_settings")
        .upsert({
          organization_id: currentOrganization.id,
          setting_type: "margin_preset",
          setting_name: name,
          setting_data: presetData as any,
        } as any, {
          onConflict: "organization_id,setting_type,setting_name",
        });

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to save margin preset:", error);
      toast.error("Failed to save margin preset");
      return false;
    }
  };

  // Delete margin preset
  const deleteMarginPreset = async (presetName: string): Promise<boolean> => {
    if (!currentOrganization?.id) return false;

    try {
      const { error } = await supabase
        .from("barcode_label_settings")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("setting_type", "margin_preset")
        .eq("setting_name", presetName);

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to delete margin preset:", error);
      toast.error("Failed to delete margin preset");
      return false;
    }
  };

  // Save custom sheet preset
  const saveCustomPreset = async (preset: CustomPreset): Promise<boolean> => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return false;
    }

    try {
      const { name, ...presetData } = preset;
      const { error } = await supabase
        .from("barcode_label_settings")
        .upsert({
          organization_id: currentOrganization.id,
          setting_type: "sheet_preset",
          setting_name: name,
          setting_data: presetData as any,
        } as any, {
          onConflict: "organization_id,setting_type,setting_name",
        });

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to save custom preset:", error);
      toast.error("Failed to save sheet preset");
      return false;
    }
  };

  // Delete custom sheet preset
  const deleteCustomPreset = async (presetName: string): Promise<boolean> => {
    if (!currentOrganization?.id) return false;

    try {
      const { error } = await supabase
        .from("barcode_label_settings")
        .delete()
        .eq("organization_id", currentOrganization.id)
        .eq("setting_type", "sheet_preset")
        .eq("setting_name", presetName);

      if (error) throw error;

      await fetchSettings();
      return true;
    } catch (error) {
      console.error("Failed to delete sheet preset:", error);
      toast.error("Failed to delete sheet preset");
      return false;
    }
  };

  // Save default format
  const saveDefaultFormat = async (format: DefaultFormat): Promise<boolean> => {
    if (!currentOrganization?.id) {
      toast.error("No organization selected");
      return false;
    }

    try {
      const { error } = await supabase
        .from("barcode_label_settings")
        .upsert({
          organization_id: currentOrganization.id,
          setting_type: "default_format",
          setting_name: "default",
          setting_data: format as any,
          is_default: true,
        } as any, {
          onConflict: "organization_id,setting_type,setting_name",
        });

      if (error) throw error;

      setDefaultFormat(format);
      return true;
    } catch (error) {
      console.error("Failed to save default format:", error);
      toast.error("Failed to save default format");
      return false;
    }
  };

  return {
    labelTemplates,
    marginPresets,
    customPresets,
    defaultFormat,
    isLoading,
    saveLabelTemplate,
    deleteLabelTemplate,
    saveMarginPreset,
    deleteMarginPreset,
    saveCustomPreset,
    deleteCustomPreset,
    saveDefaultFormat,
    refetch: fetchSettings,
  };
}
