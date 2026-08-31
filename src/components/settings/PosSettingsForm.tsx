import { useEffect, type Dispatch, type SetStateAction } from "react";
import { SettingOnOffHint } from "@/components/settings/SettingOnOffHint";
import { InvoiceTemplateSelectItems } from "@/components/settings/InvoiceTemplateSelectItems";
import { CategoryTierPricingSettings } from "@/components/settings/CategoryTierPricingSettings";
import { SettingsFieldBlock, SettingsRow, SettingsSection } from "@/components/settings/settingsLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  pos_barcode_price_mode?: "mrp" | "sale_price";
  pos_goods_ask_qty_dialog?: boolean;
  pos_category_tier_pricing?: boolean;
  /** Festival leftover pricing for discount schemes. Default false = leftover at Single (₹). */
  pos_scheme_auto_calculate_discount?: boolean;
  pos_bill_format?: "a4" | "a5" | "a5-vertical" | "a5-horizontal" | "thermal";
  pos_invoice_template?: InvoiceTemplateId;
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
    <Card className="h-fit settings-panel-card">
      <CardHeader>
        <CardTitle>POS Settings</CardTitle>
        <CardDescription>
          POS billing, discount, numbering, and bill print. Same saved keys as before — only the tab moved.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
          Shared Sale + POS options stay under <strong className="text-foreground">Settings → Sale</strong>: Invoice
          Preview, Totals &amp; Taxes print flags, Customer Price Memory, and last-purchase price. Thermal Receipt
          Style is on this tab. Changing Sale options still applies to POS bills.
        </div>

        <SettingsSection title="GST & numbering">
          <SettingsFieldBlock
            label="POS GST Type (optional)"
            htmlFor="default_pos_tax_type"
            description={`Sale Default GST Type is still under Settings → Sale (${
              resolveSaleDefaultTaxType(sale) === "inclusive"
                ? "Inclusive"
                : resolveSaleDefaultTaxType(sale) === "exclusive"
                  ? "Exclusive"
                  : "Without GST"
            }). Leave POS as “Same as Default” unless POS needs a different mode.`}
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
          </SettingsFieldBlock>
          <SettingsFieldBlock
            label="POS Bill Numbering Format"
            htmlFor="pos_numbering_format"
            description={`Placeholders: {YYYY} (year), {MM} (month), {####} (auto-increment). Leave empty for default POS/25-26/1.`}
          >
            <Input
              id="pos_numbering_format"
              value={sale.pos_numbering_format || ""}
              onChange={(e) => patchSale({ pos_numbering_format: e.target.value })}
              placeholder="Default: POS/YY-YY/N"
            />
          </SettingsFieldBlock>
          <SettingsFieldBlock
            label="POS Series Start From"
            htmlFor="pos_series_start"
            description="Last POS bill number already issued (e.g. POS/26-27/50 → next is 51). Leave blank to start from 1 when no active POS bills exist. Deleted bills no longer reserve numbers."
          >
            <Input
              id="pos_series_start"
              value={sale.pos_series_start || ""}
              onChange={(e) => patchSale({ pos_series_start: e.target.value })}
              placeholder="e.g., POS/36-27/11"
            />
          </SettingsFieldBlock>
        </SettingsSection>

        <SettingsSection title="Default discount">
          <SettingsRow
            label="Default POS flat discount in rupees"
            htmlFor="default_discount_in_rupees"
            description="Off by default — the value below is a percentage. When enabled, it is a fixed ₹ discount on new POS bills."
            hint={
              <SettingOnOffHint
                active={flatDiscount ? "on" : "off"}
                on="New POS bills start with a rupee discount."
                off="New POS bills start with a percent discount."
              />
            }
          >
            <Switch
              id="default_discount_in_rupees"
              checked={flatDiscount}
              onCheckedChange={(checked) => patchSale({ default_discount_in_rupees: checked })}
            />
          </SettingsRow>
          <SettingsFieldBlock
            label={`Default Discount (${flatDiscount ? "₹" : "%"})`}
            htmlFor="default_discount"
            description="Applied on new POS bills. Sale Invoice numbering and GST stay under Settings → Sale."
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
            />
          </SettingsFieldBlock>
        </SettingsSection>

        <SettingsSection title="Cashier / billing">
          <SettingsRow
            label="Allow invoice date change in POS"
            htmlFor="pos_allow_date_change"
            description="Date picker on the POS billing bar. Invoice number sequence is unaffected."
            hint={
              <SettingOnOffHint
                active={sale.pos_allow_date_change === true ? "on" : "off"}
                on="Cashiers can backdate the POS invoice date."
                off="Invoice date stays today; no date picker on POS."
              />
            }
          >
            <Switch
              id="pos_allow_date_change"
              checked={sale.pos_allow_date_change === true}
              onCheckedChange={(checked) => patchSale({ pos_allow_date_change: checked })}
            />
          </SettingsRow>

          <SettingsRow
            label="Allow POS edit unit price"
            htmlFor="allow_pos_edit_unit_price"
            description="Off by default. Admins/managers always allowed when on; cashiers need the Edit POS unit price special right."
            hint={
              <SettingOnOffHint
                active={sale.allow_pos_edit_unit_price === true ? "on" : "off"}
                on="Permitted users can type Unit Price on the POS cart."
                off="Unit Price on POS is not editable."
              />
            }
          >
            <Switch
              id="allow_pos_edit_unit_price"
              checked={sale.allow_pos_edit_unit_price === true}
              onCheckedChange={(checked) => patchSale({ allow_pos_edit_unit_price: checked })}
            />
          </SettingsRow>

          {sale.allow_pos_edit_unit_price === true && (
            <SettingsRow
              label="Confirm when unit price is below MRP by (%)"
              htmlFor="pos_unit_price_override_confirm_pct"
              description="Confirmation dialog when typed unit price is more than this percent below MRP. Default 30."
            >
              <Input
                id="pos_unit_price_override_confirm_pct"
                type="number"
                min={1}
                max={99}
                step={1}
                className="w-20 h-9 text-right"
                value={sale.pos_unit_price_override_confirm_pct ?? 30}
                onChange={(e) => {
                  const raw = parseFloat(e.target.value);
                  const pct = Number.isFinite(raw) ? Math.min(99, Math.max(1, Math.round(raw))) : 30;
                  patchSale({ pos_unit_price_override_confirm_pct: pct });
                }}
              />
            </SettingsRow>
          )}

          <SettingsRow
            label="POS quick price-code search (no-barcode shops)"
            htmlFor="pos_quick_price_code"
            description="Type a price code like J900 or a name like Jeans. Other shops leave this off — normal POS search unchanged."
            hint={
              <SettingOnOffHint
                active={sale.pos_quick_price_code === true ? "on" : "off"}
                on="POS accepts price-code and name+price shortcuts (sale price, MRP, or product default)."
                off="Normal POS barcode/search only — no price-code shortcuts."
              />
            }
          >
            <Switch
              id="pos_quick_price_code"
              checked={sale.pos_quick_price_code === true}
              onCheckedChange={(checked) => patchSale({ pos_quick_price_code: checked })}
            />
          </SettingsRow>

          <SettingsRow
            label="Keep salesman after POS save"
            htmlFor="pos_retain_salesman"
            description="Off by default. Explicit Clear / New Sale still clears."
            hint={
              <SettingOnOffHint
                active={sale.pos_retain_salesman === true ? "on" : "off"}
                on="Selected salesperson stays for the next bill (Alt+M to change)."
                off="Salesperson clears after each save."
              />
            }
          >
            <Switch
              id="pos_retain_salesman"
              checked={sale.pos_retain_salesman === true}
              onCheckedChange={(checked) => patchSale({ pos_retain_salesman: checked })}
            />
          </SettingsRow>

          {showMrp ? (
            <SettingsRow
              label="POS barcode scan — use MRP as price"
              htmlFor="pos_barcode_price_mode"
              description="Shown because MRP is enabled under Settings → Product. Last-purchase sale price is not applied when On (KS Footwear included)."
              hint={
                <SettingOnOffHint
                  active={mrpAsPrice ? "on" : "off"}
                  on="Every POS add (barcode, search, or pick) uses MRP as the selling rate with no line discount."
                  off="Uses Sale Price; MRP vs Sale Price discount shows when MRP is higher."
                />
              }
            >
              <Switch
                id="pos_barcode_price_mode"
                checked={mrpAsPrice}
                onCheckedChange={(checked) =>
                  patchSale({ pos_barcode_price_mode: checked ? "mrp" : "sale_price" })
                }
              />
            </SettingsRow>
          ) : (
            <div className="px-3 py-2.5 text-xs text-muted-foreground border-b border-slate-100">
              POS “use MRP as price” appears here after you enable the MRP field under Settings → Product.
            </div>
          )}

          <SettingsRow
            label="POS goods qty / discount dialog (search dropdown)"
            htmlFor="pos_goods_ask_qty_dialog"
            description="When enabled, picking a regular product from the POS search dropdown opens a Quantity + Price + Discount (₹) dialog. Barcode scans and service codes (1–9) are unchanged."
            hint={
              <SettingOnOffHint
                active={sale.pos_goods_ask_qty_dialog === true ? "on" : "off"}
                on="Search-dropdown picks ask qty and discount before adding to cart."
                off="Search-dropdown picks add the item immediately."
              />
            }
          >
            <Switch
              id="pos_goods_ask_qty_dialog"
              checked={sale.pos_goods_ask_qty_dialog === true}
              onCheckedChange={(checked) => patchSale({ pos_goods_ask_qty_dialog: checked })}
            />
          </SettingsRow>

          <div className="px-3 py-2.5">
            <CategoryTierPricingSettings
              enabled={sale.pos_category_tier_pricing === true}
              onEnabledChange={(checked) =>
                patchSale({
                  pos_category_tier_pricing: checked,
                  ...(checked ? {} : { pos_scheme_auto_calculate_discount: false }),
                })
              }
              autoCalculateDiscount={sale.pos_scheme_auto_calculate_discount === true}
              onAutoCalculateDiscountChange={(checked) =>
                patchSale({ pos_scheme_auto_calculate_discount: checked })
              }
            />
          </div>
        </SettingsSection>

        <SettingsSection title="POS print">
          <SettingsFieldBlock label="POS Bill Format" htmlFor="pos_bill_format">
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
          </SettingsFieldBlock>
          <SettingsFieldBlock
            label="POS Invoice Template"
            htmlFor="pos_invoice_template"
            description={
              posThermal
                ? "Thermal POS bills use 80mm designs only (Kids 80mm or Retail POS). Switch POS Bill Format to A4/A5 for laser templates."
                : "Grouped by A4 / A5 / Thermal. Can differ from Sale. Live preview on the right is POS."
            }
          >
            <Select
              value={
                posThermal
                  ? posInvoiceTemplateForBillFormat("thermal", resolvedPosTemplate) ?? resolvedPosTemplate
                  : resolvedPosTemplate
              }
              onValueChange={(value) => {
                onFocusPosPreview();
                patchSale({
                  pos_invoice_template: value as InvoiceTemplateId,
                  ...paperPatchesForInvoiceTemplate(value, "pos"),
                });
              }}
            >
              <SelectTrigger id="pos_invoice_template">
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <InvoiceTemplateSelectItems
                  currentValue={resolvedPosTemplate}
                  paperGroups={posThermal ? "thermal-80mm" : "all"}
                />
              </SelectContent>
            </Select>
          </SettingsFieldBlock>
          <SettingsFieldBlock
            label="Thermal Receipt Style"
            htmlFor="thermal_receipt_style"
            description="Applies to thermal printers (sale + POS). Same saved value as before — only the tab moved."
          >
            <Select
              value={sale.thermal_receipt_style || "classic"}
              onValueChange={(value) => {
                onFocusPosPreview();
                patchSale({
                  thermal_receipt_style: value as SaleSlice["thermal_receipt_style"],
                });
              }}
            >
              <SelectTrigger id="thermal_receipt_style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">Classic — Professional 80mm retail</SelectItem>
                <SelectItem value="compact">Compact — Sans-serif, denser</SelectItem>
                <SelectItem value="modern">Modern — Stylish, pill headers</SelectItem>
                <SelectItem value="tvs">TVS 80mm — Bold columns, clear print</SelectItem>
                <SelectItem value="new-design">New Design — Clean sans-serif, restaurant style</SelectItem>
              </SelectContent>
            </Select>
          </SettingsFieldBlock>
        </SettingsSection>
      </CardContent>
    </Card>
  );
}
