import { SettingOnOffHint } from "@/components/settings/SettingOnOffHint";
import { InvoiceTemplateSelectItems } from "@/components/settings/InvoiceTemplateSelectItems";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  paperPatchesForInvoiceTemplate,
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
  pos_allow_date_change?: boolean;
  allow_pos_edit_unit_price?: boolean;
  pos_unit_price_override_confirm_pct?: number;
  pos_quick_price_code?: boolean;
  pos_retain_salesman?: boolean;
  pos_barcode_price_mode?: "mrp" | "sale_price";
  pos_bill_format?: "a4" | "a5" | "a5-vertical" | "a5-horizontal" | "thermal";
  pos_invoice_template?: InvoiceTemplateId;
};

export type PosSettingsFormState = {
  sale_settings?: SaleSlice;
  purchase_settings?: { show_mrp?: boolean };
};

type PosSettingsFormProps = {
  settings: PosSettingsFormState;
  setSettings: (next: PosSettingsFormState) => void;
  onFocusPosPreview: () => void;
};

export function PosSettingsForm({ settings, setSettings, onFocusPosPreview }: PosSettingsFormProps) {
  const sale = settings.sale_settings || {};
  const showMrp = settings.purchase_settings?.show_mrp === true;
  const mrpAsPrice = (sale.pos_barcode_price_mode || "sale_price") === "mrp";

  const patchSale = (patch: Partial<SaleSlice> | ((prev: SaleSlice) => SaleSlice)) => {
    const nextSale = typeof patch === "function" ? patch(sale) : { ...sale, ...patch };
    setSettings({
      ...settings,
      sale_settings: nextSale,
    });
  };

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>POS Settings</CardTitle>
        <CardDescription>POS billing, numbering, and bill print. Same saved keys as before — only the tab moved.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Shared Sale + POS options stay under <strong className="text-foreground">Settings → Sale</strong>: Invoice
          Preview, Totals &amp; Taxes print flags, Thermal Receipt Style, Customer Price Memory, and last-purchase
          price. Changing them there still applies to POS bills.
        </div>

        <div className="space-y-2 pt-1">
          <Label className="text-sm font-semibold">GST &amp; numbering</Label>
          <p className="text-xs text-muted-foreground">
            Sale Default GST Type is still under Settings → Sale (
            {resolveSaleDefaultTaxType(sale) === "inclusive"
              ? "Inclusive"
              : resolveSaleDefaultTaxType(sale) === "exclusive"
                ? "Exclusive"
                : "Without GST"}
            ). Leave POS as “Same as Default” unless POS needs a different mode.
          </p>
          <div className="space-y-2">
            <Label htmlFor="default_pos_tax_type">POS GST Type (optional)</Label>
            <Select
              value={
                hasExplicitPosDefaultTaxType(sale) ? resolvePosDefaultTaxType(sale) : "__same_as_sale__"
              }
              onValueChange={(v: string) => {
                onFocusPosPreview();
                if (v === "__same_as_sale__") {
                  const nextSale = { ...sale };
                  delete nextSale.default_pos_tax_type;
                  setSettings({
                    ...settings,
                    sale_settings: nextSale,
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos_numbering_format">POS Bill Numbering Format</Label>
            <Input
              id="pos_numbering_format"
              value={sale.pos_numbering_format || ""}
              onChange={(e) => patchSale({ pos_numbering_format: e.target.value })}
              placeholder="Default: POS/YY-YY/N"
            />
            <p className="text-xs text-muted-foreground">
              Placeholders: {"{YYYY}"} (year), {"{MM}"} (month), {"{####}"} (auto-increment). Leave empty for default
              POS/25-26/1.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos_series_start">POS Series Start From</Label>
            <Input
              id="pos_series_start"
              value={sale.pos_series_start || ""}
              onChange={(e) => patchSale({ pos_series_start: e.target.value })}
              placeholder="e.g., POS/36-27/11"
            />
            <p className="text-xs text-muted-foreground">
              Last POS bill number already issued (e.g. POS/26-27/50 → next is 51). Leave blank to start from 1 when no
              active POS bills exist. Deleted bills no longer reserve numbers.
            </p>
          </div>
        </div>

        <div className="space-y-2.5 pt-2 border-t">
          <Label className="text-sm font-semibold">Cashier / billing</Label>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-4">
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="pos_allow_date_change" className="text-sm font-medium">
                Allow invoice date change in POS
              </Label>
              <p className="text-xs text-muted-foreground">
                Date picker on the POS billing bar. Invoice number sequence is unaffected.
              </p>
              <SettingOnOffHint
                active={sale.pos_allow_date_change === true ? "on" : "off"}
                on="Cashiers can backdate the POS invoice date."
                off="Invoice date stays today; no date picker on POS."
              />
            </div>
            <Switch
              id="pos_allow_date_change"
              checked={sale.pos_allow_date_change === true}
              onCheckedChange={(checked) => patchSale({ pos_allow_date_change: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-4">
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="allow_pos_edit_unit_price" className="text-sm font-medium">
                Allow POS edit unit price
              </Label>
              <p className="text-xs text-muted-foreground">
                Off by default. Admins/managers always allowed when on; cashiers need the Edit POS unit price special
                right.
              </p>
              <SettingOnOffHint
                active={sale.allow_pos_edit_unit_price === true ? "on" : "off"}
                on="Permitted users can type Unit Price on the POS cart."
                off="Unit Price on POS is not editable."
              />
            </div>
            <Switch
              id="allow_pos_edit_unit_price"
              checked={sale.allow_pos_edit_unit_price === true}
              onCheckedChange={(checked) => patchSale({ allow_pos_edit_unit_price: checked })}
            />
          </div>

          {sale.allow_pos_edit_unit_price === true && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-4">
              <div className="space-y-0.5 min-w-0">
                <Label htmlFor="pos_unit_price_override_confirm_pct" className="text-sm font-medium">
                  Confirm when unit price is below MRP by (%)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Confirmation dialog when typed unit price is more than this percent below MRP. Default 30.
                </p>
              </div>
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
            </div>
          )}

          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-4">
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="pos_quick_price_code" className="text-sm font-medium">
                POS quick price-code search (no-barcode shops)
              </Label>
              <p className="text-xs text-muted-foreground">
                Type a price code like J900 or a name like Jeans. Other shops leave this off — normal POS search
                unchanged.
              </p>
              <SettingOnOffHint
                active={sale.pos_quick_price_code === true ? "on" : "off"}
                on="POS accepts price-code and name+price shortcuts (sale price, MRP, or product default)."
                off="Normal POS barcode/search only — no price-code shortcuts."
              />
            </div>
            <Switch
              id="pos_quick_price_code"
              checked={sale.pos_quick_price_code === true}
              onCheckedChange={(checked) => patchSale({ pos_quick_price_code: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 gap-4">
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="pos_retain_salesman" className="text-sm font-medium">
                Keep salesman after POS save
              </Label>
              <p className="text-xs text-muted-foreground">
                Off by default. Explicit Clear / New Sale still clears.
              </p>
              <SettingOnOffHint
                active={sale.pos_retain_salesman === true ? "on" : "off"}
                on="Selected salesperson stays for the next bill (Alt+M to change)."
                off="Salesperson clears after each save."
              />
            </div>
            <Switch
              id="pos_retain_salesman"
              checked={sale.pos_retain_salesman === true}
              onCheckedChange={(checked) => patchSale({ pos_retain_salesman: checked })}
            />
          </div>

          {showMrp ? (
            <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="pos_barcode_price_mode" className="text-sm font-medium">
                    POS barcode scan — use MRP as price
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Shown because MRP is enabled under Settings → Product. Last-purchase sale price is not applied when
                    On (KS Footwear included).
                  </p>
                  <SettingOnOffHint
                    active={mrpAsPrice ? "on" : "off"}
                    on="Every POS add (barcode, search, or pick) uses MRP as the selling rate with no line discount."
                    off="Uses Sale Price; MRP vs Sale Price discount shows when MRP is higher."
                  />
                </div>
                <Switch
                  id="pos_barcode_price_mode"
                  checked={mrpAsPrice}
                  onCheckedChange={(checked) =>
                    patchSale({ pos_barcode_price_mode: checked ? "mrp" : "sale_price" })
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              POS “use MRP as price” appears here after you enable the MRP field under Settings → Product.
            </p>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t">
          <Label className="text-sm font-semibold">POS print</Label>
          <div className="space-y-2">
            <Label htmlFor="pos_bill_format" className="text-sm font-medium">
              POS Bill Format
            </Label>
            <Select
              value={sale.pos_bill_format || "thermal"}
              onValueChange={(value) => {
                onFocusPosPreview();
                patchSale({ pos_bill_format: value as SaleSlice["pos_bill_format"] });
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
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos_invoice_template" className="text-sm font-medium">
              POS Invoice Template
            </Label>
            <Select
              value={resolvePosInvoiceTemplate(sale)}
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
                <InvoiceTemplateSelectItems currentValue={resolvePosInvoiceTemplate(sale)} />
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Grouped by A4 / A5 / Thermal. Can differ from Sale. Live preview on the right is POS.
            </p>
          </div>
          {sale.pos_bill_format === "thermal" || !sale.pos_bill_format ? (
            <p className="text-xs text-muted-foreground">
              Thermal Receipt Style is set under <strong className="text-foreground">Settings → Sale → Print Format</strong>{" "}
              (same style for sale + POS thermal). No second copy here so the saved value cannot drift.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
