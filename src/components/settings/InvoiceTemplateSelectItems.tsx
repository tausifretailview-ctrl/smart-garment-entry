import { SelectItem } from "@/components/ui/select";

/** Shared invoice template options for Sale / POS settings selects. */
export function InvoiceTemplateSelectItems() {
  return (
    <>
      <SelectItem value="professional">
        <span className="flex items-center gap-2">
          <span className="text-blue-600 font-bold text-xs w-5">PRO</span>
          Professional — Detailed GST-ready
        </span>
      </SelectItem>
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
      <SelectItem value="classic">
        <span className="flex items-center gap-2">
          <span className="text-gray-600 font-bold text-xs w-5">CLS</span>
          Classic — Traditional receipt style
        </span>
      </SelectItem>
      <SelectItem value="minimal">
        <span className="flex items-center gap-2">
          <span className="text-slate-500 font-bold text-xs w-5">MIN</span>
          Minimal — Simple &amp; clean
        </span>
      </SelectItem>
      <SelectItem value="compact">
        <span className="flex items-center gap-2">
          <span className="text-orange-600 font-bold text-xs w-5">CMP</span>
          Compact — Space-saving layout
        </span>
      </SelectItem>
      <SelectItem value="detailed">
        <span className="flex items-center gap-2">
          <span className="text-green-600 font-bold text-xs w-5">DET</span>
          Detailed — Full product info
        </span>
      </SelectItem>
      <SelectItem value="tax-invoice">
        <span className="flex items-center gap-2">
          <span className="text-red-600 font-bold text-xs w-5">TAX</span>
          Tax Invoice — GST B2B compliant
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
      <SelectItem value="retail-erp">
        <span className="flex items-center gap-2">
          <span className="text-indigo-600 font-bold text-xs w-5">ERP</span>
          Retail ERP — Tax Invoice ERP style
        </span>
      </SelectItem>
      <SelectItem value="retail-erp-dc">
        <span className="flex items-center gap-2">
          <span className="text-sky-700 font-bold text-xs w-5">DC</span>
          Retail ERP style DC — no HSN / GST details
        </span>
      </SelectItem>
      <SelectItem value="retail-erp-preprinted">
        <span className="flex items-center gap-2">
          <span className="text-violet-700 font-bold text-xs w-5">PRE</span>
          Preprinted Invoice — Retail ERP tax + 2&quot; letterhead (A4/A5)
        </span>
      </SelectItem>
      <SelectItem value="real-tast">
        <span className="flex items-center gap-2">
          <span className="text-emerald-700 font-bold text-xs w-5">RT</span>
          Real Tast — Bill of Supply (A4)
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
      <SelectItem value="kids-80mm">
        <span className="flex items-center gap-2">
          <span className="text-amber-600 font-bold text-xs w-5">KID</span>
          Kids 80mm — Compact thermal receipt
        </span>
      </SelectItem>
    </>
  );
}
