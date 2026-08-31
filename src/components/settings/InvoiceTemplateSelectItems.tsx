import { SelectGroup, SelectItem, SelectLabel } from "@/components/ui/select";

/** Removed from picker — still printable if already saved on an org. */
const LEGACY_INVOICE_TEMPLATES: Record<string, string> = {
  professional: "Professional — Detailed GST-ready (legacy)",
  classic: "Classic — Traditional receipt style (legacy)",
  minimal: "Minimal — Simple & clean (legacy)",
  compact: "Compact — Space-saving layout (legacy)",
  detailed: "Detailed — Full product info (legacy)",
  "tax-invoice": "Tax Invoice — GST B2B compliant (legacy)",
};

type InvoiceTemplateSelectItemsProps = {
  /** Current saved value — keeps legacy templates selectable until changed. */
  currentValue?: string | null;
  /** POS thermal bill print — 80mm designs only. */
  paperGroups?: "all" | "thermal-80mm";
};

/** Shared invoice template options for Sale / POS settings selects, grouped by paper size. */
export function InvoiceTemplateSelectItems({
  currentValue,
  paperGroups = "all",
}: InvoiceTemplateSelectItemsProps = {}) {
  const thermal80Only = paperGroups === "thermal-80mm";
  const legacyLabel =
    !thermal80Only && currentValue && LEGACY_INVOICE_TEMPLATES[currentValue]
      ? LEGACY_INVOICE_TEMPLATES[currentValue]
      : null;

  const thermal80Group = (
    <SelectGroup>
      <SelectLabel>Thermal 80mm</SelectLabel>
      <SelectItem value="kids-80mm">
        <span className="flex items-center gap-2">
          <span className="text-amber-600 font-bold text-xs w-5">KID</span>
          Kids 80mm — Compact thermal receipt
        </span>
      </SelectItem>
      <SelectItem value="retail-pos-80mm">
        <span className="flex items-center gap-2">
          <span className="text-sky-700 font-bold text-xs w-5">RPS</span>
          Retail POS — Monospace 80mm (logo + UPI QR)
        </span>
      </SelectItem>
    </SelectGroup>
  );

  if (thermal80Only) {
    return thermal80Group;
  }

  return (
    <>
      {legacyLabel && currentValue ? (
        <SelectGroup>
          <SelectLabel>Currently saved (choose a new template below)</SelectLabel>
          <SelectItem value={currentValue}>
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="text-xs font-bold w-5">OLD</span>
              {legacyLabel}
            </span>
          </SelectItem>
        </SelectGroup>
      ) : null}

      <SelectGroup>
        <SelectLabel>A4 Size</SelectLabel>
        <SelectItem value="modern">
          <span className="flex items-center gap-2">
            <span className="text-violet-600 font-bold text-xs w-5">MOD</span>
            Modern — Clean gradient design
          </span>
        </SelectItem>
        <SelectItem value="modern-wholesale">
          <span className="flex items-center gap-2">
            <span className="text-teal-600 font-bold text-xs w-5">WHL</span>
            Wholesale — Size grouping (38/2, 40/3)
          </span>
        </SelectItem>
        <SelectItem value="tally-tax-invoice">
          <span className="flex items-center gap-2">
            <span className="text-amber-700 font-bold text-xs w-5">TLY</span>
            Tally Tax Invoice — Mobile/Electronics Shop
          </span>
        </SelectItem>
        <SelectItem value="gift_tally">
          <span className="flex items-center gap-2">
            <span className="text-stone-800 font-bold text-xs w-5">GFT</span>
            Gift Tally (A4 Tax Invoice)
          </span>
        </SelectItem>
        <SelectItem value="a4-gst-classic">
          <span className="flex items-center gap-2">
            <span className="text-rose-700 font-bold text-xs w-5">A4G</span>
            A4 GST Tax Invoice — Classic (with QR)
          </span>
        </SelectItem>
        <SelectItem value="a4-electronic">A4 Electronic</SelectItem>
        <SelectItem value="retail">
          <span className="flex items-center gap-2">
            <span className="text-pink-600 font-bold text-xs w-5">RET</span>
            Retail — Fixed ERP format
          </span>
        </SelectItem>
        <SelectItem value="real-tast">
          <span className="flex items-center gap-2">
            <span className="text-emerald-700 font-bold text-xs w-5">RT</span>
            Real Tast — Bill of Supply (A4)
          </span>
        </SelectItem>
        <SelectItem value="retail-erp-preprinted">
          <span className="flex items-center gap-2">
            <span className="text-violet-700 font-bold text-xs w-5">PRE</span>
            Preprinted Invoice — Retail ERP tax + 2&quot; letterhead (A4/A5)
          </span>
        </SelectItem>
      </SelectGroup>

      <SelectGroup>
        <SelectLabel>A5 Size</SelectLabel>
        <SelectItem value="retail-erp">
          <span className="flex items-center gap-2">
            <span className="text-indigo-600 font-bold text-xs w-5">ERP</span>
            Retail ERP — Tax Invoice ERP style
          </span>
        </SelectItem>
        <SelectItem value="retail-erp-dc">
          <span className="flex items-center gap-2">
            <span className="text-sky-700 font-bold text-xs w-5">DC</span>
            Retail ERP DC — Bill of Supply (no HSN / GST / Round Off)
          </span>
        </SelectItem>
        <SelectItem value="zaika">
          <span className="flex items-center gap-2">
            <span className="text-orange-700 font-bold text-xs w-5">ZK</span>
            Zaika — Tax Invoice (no Size / Barcode / Qty / Rate / Balances / Terms)
          </span>
        </SelectItem>
        <SelectItem value="gurukrupa">
          <span className="flex items-center gap-2">
            <span className="text-rose-700 font-bold text-xs w-5">GK</span>
            Gurukrupa — Retail ERP A5 (Sub Total / Discount / S/R Adjust / Bill Total)
          </span>
        </SelectItem>
        <SelectItem value="retail-tax-ezzy">
          <span className="flex items-center gap-2">
            <span className="text-slate-700 font-bold text-xs w-5">EZY</span>
            Retail Tax (Ezzy A5) — A5 vertical tax invoice
          </span>
        </SelectItem>
        <SelectItem value="wholesale-a5">
          <span className="flex items-center gap-2">
            <span className="text-stone-700 font-bold text-xs w-5">A5W</span>
            Wholesale A5 — Laser print estimate
          </span>
        </SelectItem>
      </SelectGroup>

      {thermal80Group}
    </>
  );
}
