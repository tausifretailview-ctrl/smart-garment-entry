import { useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, Gift, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { lookupGiftVoucher, type GiftVoucherLookup } from "@/utils/giftVoucher";

/**
 * POS: type the code printed on a gift voucher. "Use on this bill" picks the voucher's customer;
 * POS then applies the voucher amount through the normal advance step.
 */
export function RedeemGiftVoucherDialog({
  open,
  onOpenChange,
  organizationId,
  customerVouchers = [],
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  /** Vouchers the customer on the bill already holds: one tap to use, no code typing. */
  customerVouchers?: GiftVoucherLookup[];
  onUse: (voucher: GiftVoucherLookup) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucher, setVoucher] = useState<GiftVoucherLookup | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const close = (o: boolean) => {
    if (!o) {
      setCode("");
      setVoucher(null);
      setMessage(null);
    }
    onOpenChange(o);
  };

  const find = async () => {
    setLoading(true);
    setVoucher(null);
    setMessage(null);
    try {
      const found = await lookupGiftVoucher(organizationId, code);
      if (!found) setMessage("No voucher with this code. Check the code and try again.");
      else setVoucher(found);
    } catch {
      setMessage("Could not check the voucher. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const used = voucher ? voucher.remaining <= 0.01 : false;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-pink-600" /> Redeem gift voucher
          </DialogTitle>
          <DialogDescription>Type the code printed on the voucher, or its receipt number.</DialogDescription>
        </DialogHeader>

        {customerVouchers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {customerVouchers[0].customerName}&apos;s gift vouchers
            </p>
            {customerVouchers.map((v) => (
              <button
                key={v.advanceId}
                type="button"
                onClick={() => {
                  onUse(v);
                  close(false);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-pink-200 bg-pink-50/70 px-3 py-2 text-left hover:bg-pink-100"
              >
                <span>
                  <span className="block font-mono text-sm font-bold tracking-widest text-pink-700">{v.code}</span>
                  {v.expiresOn && (
                    <span className={v.expired ? "text-xs font-medium text-amber-700" : "text-xs text-slate-500"}>
                      {v.expired ? "Expired on" : "Valid till"} {format(parseISO(v.expiresOn), "dd MMM yyyy")}
                    </span>
                  )}
                </span>
                <span className="text-right">
                  <span className="block text-lg font-bold text-pink-700">₹{v.remaining.toLocaleString("en-IN")}</span>
                  <span className="text-xs font-medium text-pink-600">Use on this bill</span>
                </span>
              </button>
            ))}
            <p className="pt-1 text-xs text-slate-500">Or type another voucher code:</p>
          </div>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) void find();
          }}
        >
          <Input
            id="gift-voucher-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="GV7K2M9Q"
            className="font-mono text-lg tracking-widest"
          />
          <Button type="submit" disabled={!code.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>

        {message && <p className="text-sm text-destructive">{message}</p>}

        {voucher && (
          <div className="rounded-lg border border-pink-200 bg-pink-50/70 p-3 text-sm">
            <p className="text-2xl font-bold text-pink-700">
              ₹{voucher.remaining.toLocaleString("en-IN")}
              <span className="ml-1 text-sm font-medium text-slate-500">left of ₹{voucher.amount.toLocaleString("en-IN")}</span>
            </p>
            <p className="mt-1 text-slate-700">
              For <b>{voucher.customerName}</b>
              {voucher.customerPhone ? ` · ${voucher.customerPhone}` : ""}
            </p>
            {voucher.expiresOn && (
              <p className={voucher.expired ? "mt-1 flex items-center gap-1 font-medium text-amber-700" : "mt-1 text-slate-500"}>
                {voucher.expired && <AlertTriangle className="h-4 w-4" />}
                {voucher.expired ? "Expired on" : "Valid till"} {format(parseISO(voucher.expiresOn), "dd MMM yyyy")}
              </p>
            )}
            {used && <p className="mt-1 font-medium text-destructive">This voucher is fully used.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            className="bg-pink-600 text-white hover:bg-pink-700"
            disabled={!voucher || used}
            onClick={() => {
              if (!voucher) return;
              onUse(voucher);
              close(false);
            }}
          >
            {voucher?.expired ? "Use anyway" : "Use on this bill"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
