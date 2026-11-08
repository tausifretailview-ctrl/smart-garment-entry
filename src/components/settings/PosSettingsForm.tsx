import { useEffect, type Dispatch, type SetStateAction } from "react";
import { SettingOnOffHint } from "@/components/settings/SettingOnOffHint";
import { InvoiceTemplateSelectItems } from "@/components/settings/InvoiceTemplateSelectItems";
import { CategoryTierPricingSettings } from "@/components/settings/CategoryTierPricingSettings";
import { SettingsField, SettingsGrid, SettingsSection, SettingsToggle } from "@/components/settings/settingsLayout";
import { Percent, Printer, Receipt, ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isPosThermalBillFormat,
  isThermal80mmInvoiceTemplate,
  paperPatchesForInvoiceTemplate,
  posInvoiceTemplateForBillFormat,
  resolvePosInvoiceTemplate,
  type InvoiceTemplateId,
} from "@/utils/invoicePrintFormat";
import {
  hasExplicitPosDefaultTaxType,
  resolvePosDefaultTaxType,
  resolveSaleDefaultTaxType,
  type GstTaxType,
} from "@/utils/gstRegisterUtils";

type SaleSlice = {
  default_tax_type?: GstTaxType;
  default_pos_tax_type?: GstTaxType;
  pos_numbering_format?: string;
  pos_series_start?: string;
  default_discount?: number;
  default_discount_in_rupees?: boolean;
  pos_allow_date_change?: boolean;
  allow_pos_edit_unit_price?: boolean;
  pos_unit_price_override_confirm_pct?: number;
  pos_quick_price_code?: boolean;
  pos_retain_salesman?: boolean;
  pos_per_line_salesman?: boolean;
  pos_barcode_price_mode?: "mrp" | "sale_price";
  pos_goods_ask_qty_dialog?: boolean;
  /** POS Dashboard expanded Sale Items: P.Code column. Default false. */
  pos_dashboard_show_purchase_code?: boolean;
  pos_category_tier_pricing?: boolean;
  /** Festival leftover pricing for discount schemes. Default false = leftover at Single (₹). */
  pos_scheme_auto_calculate_discount?: boolean;
  pos_bill_format?: "a4" | "a5" | "a5-vertical" | "a5-horizontal" | "thermal";
  pos_invoice_template?: InvoiceTemplateId;
  print_logo_on_preprinted_letterhead?: boolean;
  thermal_receipt_style?: "classic" | "compact" | "modern" | "tvs" | "new-design";
};

export type PosSettingsFormState = {
  sale_settings?: SaleSlice;
  purchase_settings?: { show_mrp?: boolean };
};

type PosSettingsFormProps<T extends PosSettingsFormState> = {
  settings: T;
  setSettings: Dispatch<SetStateAction<T>>;
  onFocusPosPreview: () => void;
};

export function PosSettingsForm<T extends PosSettingsFormState>({
  settings,
  setSettings,
  onFocusPosPreview,
}: PosSettingsFormProps<T>) {
  const sale = settings.sale_settings || {};
  const showMrp = settings.purchase_settings?.show_mrp === true;
  const mrpAsPrice = (sale.pos_barcode_price_mode || "sale_price") === "mrp";
  const flatDiscount = sale.default_discount_in_rupees === true;

  const patchSale = (patch: Partial<SaleSlice> | ((prev: SaleSlice) => SaleSlice)) => {
    setSettings((prev) => {
      const current = prev.sale_settings || {};
      const nextSale = typeof patch === "function" ? patch(current) : { ...current, ...patch };
      return { ...prev, sale_settings: nextSale };
    });
  };

  const posThermal = isPosThermalBillFormat(sale.pos_bill_format);
  const resolvedPosTemplate = resolvePosInvoiceTemplate(sale);

  useEffect(() => {
    if (!posThermal) return;
    const nextTemplate = posInvoiceTemplateForBillFormat(sale.pos_bill_format || "thermal", resolvedPosTemplate);
    if (nextTemplate && nextTemplate !== sale.pos_invoice_template) {
      patchSale({ pos_invoice_template: nextTemplate as InvoiceTemplateId });
    }
    // Only coerce when thermal POS is on and the resolved template is not 80mm.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patchSale is inline
  }, [posThermal, resolvedPosTemplate, sale.pos_bill_format, sale.pos_invoice_template]);

  return (
    <div className="space-y-3 min-w-0">
      <SettingsSection
        title="GST & bill numbers"
        subtitle="Shared Sale + POS print options (totals, preview, price memory) stay in the Sale tab"
        icon={Receipt}
        tone="blue"
      >
        <SettingsGrid cols={3}>
          <SettingsField
            label="POS GST Type"
            htmlFor="default_pos_tax_type"
            help={`Sale tab GST Type is ${
              resolveSaleDefaultTaxType(sale) === "inclusive"
                ? "Inclusive"
                : resolveSaleDefaultTaxType(sale) === "exclusive"
                  ? "Exclusive"
                  : "Without GST"
            }. Keep “Same as Sale” unless POS needs a different mode.`}
          >
            <Select
              value={
                hasExplicitPosDefaultTaxType(sale) ? resolvePosDefaultTaxType(sale) : "__same_as_sale__"
              }
              onValueChange={(v: string) => {
                onFocusPosPreview();
                if (v === "__same_as_sale__") {
                  patchSale((prev) => {
                    const nextSale = { ...prev };
                    delete nextSale.default_pos_tax_type;
                    return nextSale;
                  });
                  return;
                }
                patchSale({ default_pos_tax_type: v as GstTaxType });
              }}
            >
              <SelectTrigger id="default_pos_tax_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__same_as_sale__">Same as Default GST Type (Sale tab)</SelectItem>
                <SelectItem value="inclusive">GST Inclusive (MRP-style, GST bifurcated)</SelectItem>
                <SelectItem value="exclusive">GST Exclusive (taxable + GST at bottom)</SelectItem>
                <SelectItem value="no_gst">Without GST (no tax on bill)</SelectItem>
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField
            label="POS bill numbering format"
            htmlFor="pos_numbering_format"
            help={`{YYYY} year, {MM} month, {####} number. Blank = POS/25-26/1.`}
          >
            <Input
              id="pos_numbering_format"
              value={sale.pos_numbering_format || ""}
              onChange={(e) => patchSale({ pos_numbering_format: e.target.value })}
              placeholder="Default: POS/YY-YY/N"
            />
          </SettingsField>
          <SettingsField
            label="POS series start from"
            htmlFor="pos_series_start"
            help="Last POS bill already issued (POS/26-27/50 → next 51). Blank starts from 1."
          >
            <Input
              id="pos_series_start"
              value={sale.pos_series_start || ""}
              onChange={(e) => patchSale({ pos_series_start: e.target.value })}
              placeholder="e.g., POS/36-27/11"
            />
          </SettingsField>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Default discount" subtitle="Filled in on every new POS bill" icon={Percent} tone="amber">
        <SettingsGrid cols={2}>
          <SettingsField
            label={`Default discount (${flatDiscount ? "₹" : "%"})`}
            htmlFor="default_discount"
            important
          >
            <Input
              id="default_discount"
              type="number"
              min="0"
              max={flatDiscount ? undefined : 100}
              step="0.01"
              value={sale.default_discount || ""}
              onChange={(e) => patchSale({ default_discount: parseFloat(e.target.value) || 0 })}
              placeholder={flatDiscount ? "e.g., 50" : "e.g., 5"}
              className="max-w-[10rem]"
            />
          </SettingsField>
          <SettingsToggle
            id="default_discount_in_rupees"
            label="Discount in rupees (₹)"
            checked={flatDiscount}
            onCheckedChange={(checked) => patchSale({ default_discount_in_rupees: checked })}
          >
            <SettingOnOffHint
              compact
              active={flatDiscount ? "on" : "off"}
              on="New POS bills start with a rupee discount."
              off="New POS bills start with a percent discount."
            />
          </SettingsToggle>
        </SettingsGrid>
      </SettingsSection>

      <SettingsSection title="Cashier & billing" subtitle="What cashiers can do on the POS screen" icon={ScanLine} tone="emerald">
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <SettingsToggle
            id="pos_allow_date_change"
            label="Allow invoice date change"
            checked={sale.pos_allow_date_change === true}
            onCheckedChange={(checked) => patchSale({ pos_allow_date_change: checked })}
          >
            <SettingOnOffHint
              compact
              active={sale.pos_allow_date_change === true ? "on" : "off"}
              on="Cashiers can backdate the POS invoice date."
              off="Invoice date stays today; no date picker on POS."
            />
          </SettingsToggle>

          <SettingsToggle
            id="allow_pos_edit_unit_price"
            label="Allow editing unit price"
            description="Cashiers also need the Edit POS unit price right."
            checked={sale.allow_pos_edit_unit_price === true}
            onCheckedChange={(checked) => patchSale({ allow_pos_edit_unit_price: checked })}
          >
            {sale.allow_pos_edit_unit_price === true ? (
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor="pos_unit_price_override_confirm_pct" className="text-xs font-semibold text-slate-700">
                  Confirm when below MRP by
                </label>
                <Input
                  id="pos_unit_price_override_confirm_pct"
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  className="w-16 h-8 text-right"
                  value={sale.pos_unit_price_override_confirm_pct ?? 30}
                  onChange={(e) => {
                    const raw = parseFloat(e.target.value);
                    const pct = Number.isFinite(raw) ? Math.min(99, Math.max(1, Math.round(raw))) : 30;
                    patchSale({ pos_unit_price_override_confirm_pct: pct });
                  }}
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            ) : null}
          </SettingsToggle>

          <SettingsToggle
            id="pos_quick_price_code"
            label="Quick price-code search"
            description="For no-barcode shops: type J900 or Jeans."
            checked={sale.pos_quick_price_code === true}
            onCheckedChange={(checked) => patchSale({ pos_quick_price_code: checked })}
          >
            <SettingOnOffHint
              compact
              active={sale.pos_quick_price_code === true ? "on" : "off"}
              on="POS accepts price-code and name+price shortcuts."
              off="Normal POS barcode/search only."
            />
          </SettingsToggle>

          <SettingsToggle
            id="pos_goods_ask_qty_dialog"
            label="Ask qty / discount on scan"
            description="IMEI scans and service codes (1–9) are not affected."
            checked={sale.pos_goods_ask_qty_dialog === true}
            onCheckedChange={(checked) => patchSale({ pos_goods_ask_qty_dialog: checked })}
          >
            <SettingOnOffHint
              compact
              active={sale.pos_goods_ask_qty_dialog === true ? "on" : "off"}
              on="Search picks and barcode scans ask qty and discount first."
              off="Search picks and barcode scans add the item at once."
            />
          </SettingsToggle>

          <SettingsToggle
            id="pos_retain_salesman"
            label="Keep salesman after save"
            checked={sale.pos_retain_salesman === true}
            onCheckedChange={(checked) => patchSale({ pos_retain_salesman: checked })}
          >
            <SettingOnOffHint
              compact
              active={sale.pos_retain_salesman === true ? "on" : "off"}
              on="Salesperson stays for the next bill (Alt+M to change)."
              off="Salesperson clears after each save."
            />
          </SettingsToggle>

          <SettingsToggle
            id="pos_per_line_salesman"
            label="Salesperson on each cart line"
            checked={sale.pos_per_line_salesman === true}
            onCheckedChange={(checked) => patchSale({ pos_per_line_salesman: checked })}
          >
            <SettingOnOffHint
              compact
              active={sale.pos_per_line_salesman === true ? "on" : "off"}
              on="Each line can have its own salesperson."
              off="One salesperson per bill."
            />
          </SettingsToggle>

          {showMrp ? (
            <SettingsToggle
              id="pos_barcode_price_mode"
              label="Use MRP as selling price"
              description="Last-purchase sale price is not used when on."
              checked={mrpAsPrice}
              onCheckedChange={(checked) => patchSale({ pos_barcode_price_mode: checked ? "mrp" : "sale_price" })}
            >
              <SettingOnOffHint
                compact
                active={mrpAsPrice ? "on" : "off"}
                on="Every POS add uses MRP with no line discount."
                off="Uses Sale Price; MRP discount shows when MRP is higher."
              />
            </SettingsToggle>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-xs text-slate-500">
              “Use MRP as selling price” shows here after you turn on the MRP field in Settings → Purchase.
            </div>
          )}

          <SettingsToggle
            id="pos_dashboard_show_purchase_code"
            label="P.Code on POS Dashboard"
            description="Coded purchase price in Sale Items on the POS Dashboard. Never printed."
            checked={sale.pos_dashboard_show_purchase_code === true}
            onCheckedChange={(checked) => patchSale({ pos_dashboard_show_purchase_code: checked })}
          />
        </div>
        <div className="border-t border-slate-100 px-4 py-3">
          <CategoryTierPricingSettings
            enabled={sale.pos_category_tier_pricing === true}
            onEnabledChange={(checked) =>
              patchSale({
                pos_category_tier_pricing: checked,
                ...(checked ? {} : { pos_scheme_auto_calculate_discount: false }),
              })
            }
            autoCalculateDiscount={sale.pos_scheme_auto_calculate_discount === true}
            onAutoCalculateDiscountChange={(checked) => patchSale({ pos_scheme_auto_calculate_discount: checked })}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="POS print" subtitle="Bill paper and design. The preview on the right updates live." icon={Printer} tone="violet">
        <SettingsGrid cols={3}>
          <SettingsField label="POS bill format" htmlFor="pos_bill_format" important>
            <Select
              value={sale.pos_bill_format || "thermal"}
              onValueChange={(value) => {
                onFocusPosPreview();
                const nextFormat = value as SaleSlice["pos_bill_format"];
                const currentTemplate = resolvePosInvoiceTemplate(sale);
                const nextTemplate = posInvoiceTemplateForBillFormat(value, currentTemplate);
                patchSale({
                  pos_bill_format: nextFormat,
                  ...(nextTemplate ? { pos_invoice_template: nextTemplate as InvoiceTemplateId } : {}),
                });
              }}
            >
              <SelectTrigger id="pos_bill_format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>A4 Size</SelectLabel>
                  <SelectItem value="a4">A4</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>A5 Size</SelectLabel>
                  <SelectItem value="a5-vertical">A5 Portrait</SelectItem>
                  <SelectItem value="a5-horizontal">A5 Landscape</SelectItem>
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Thermal</SelectLabel>
                  <SelectItem value="thermal">Thermal 80mm — Most common</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsField>
          <SettingsField
            label="POS invoice template"
            htmlFor="pos_invoice_template"
            span={2}
            help="An A4 design (Klear, Wholesale GST) sets the bill format to A4."
          >
            <Select
              value={resolvedPosTemplate}
              onValueChange={(value) => {
                onFocusPosPreview();
                const paper = paperPatchesForInvoiceTemplate(value, "pos");
                // A full-page design picked while POS Bill Format is Thermal: leave thermal,
                // otherwise the thermal guard above snaps the choice back to Kids 80mm.
                const leaveThermal =
                  posThermal && !isThermal80mmInvoiceTemplate(value) && !paper.pos_bill_format
                    ? { pos_bill_format: (/a5/i.test(value) ? "a5-vertical" : "a4") as SaleSlice["pos_bill_format"] }
                    : {};
                patchSale({
                  pos_invoice_template: value as InvoiceTemplateId,
                  ...paper,
                  ...leaveThermal,
                });
              }}
            >
              <SelectTrigger id="pos_invoice_template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <InvoiceTemplateSelectItems currentValue={resolvedPosTemplate} />
              </SelectContent>
            </Select>
          </SettingsField>
          {resolvedPosTemplate === "retail-erp-preprinted" && (
            <SettingsToggle
              id="pos_print_logo_on_preprinted_letterhead"
              label="Print shop logo on letterhead"
              description="Off keeps the 2-inch top blank for printed letterpad paper."
              className="col-span-full"
              checked={sale.print_logo_on_preprinted_letterhead === true}
              onCheckedChange={(checked) => {
                onFocusPosPreview();
                patchSale({ print_logo_on_preprinted_letterhead: checked });
              }}
            />
          )}
        </SettingsGrid>
      </SettingsSection>
    </div>
  );
}
