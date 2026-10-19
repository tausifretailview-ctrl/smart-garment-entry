import { useState } from "react";
import { Copy, KeyRound, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type LinkMethod = "qr" | "code";

/**
 * Two ways to link a QR-linked WhatsApp number: scan the QR, or type an 8-character code on the phone
 * (WhatsApp → Linked devices → Link a device → Link with phone number instead). Shared by Bulk WhatsApp
 * and the Ezzy ERP WhatsApp settings panel.
 */
export function WhatsAppLinkMethods({
  method,
  onMethodChange,
  qr,
  pairingCode,
  busy,
  onRequestCode,
  qrHint,
}: {
  method: LinkMethod;
  onMethodChange: (m: LinkMethod) => void;
  qr: string | null;
  pairingCode: string | null;
  busy: boolean;
  onRequestCode: (phone: string) => void;
  /** Shown on the QR tab before a QR exists, e.g. "Click Link my WhatsApp to get the QR code". */
  qrHint: string;
}) {
  const [phone, setPhone] = useState("");
  const digits = phone.replace(/\D/g, "");
  const phoneOk = digits.length >= 10 && digits.length <= 15;

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg bg-slate-100 p-1 text-xs font-medium">
        {(
          [
            ["qr", "Scan QR code", <QrCode key="q" className="h-3.5 w-3.5" />],
            ["code", "Link with phone number", <KeyRound key="k" className="h-3.5 w-3.5" />],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => onMethodChange(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
              method === id ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {method === "qr" ? (
        qr ? (
          <div className="flex flex-wrap items-start gap-4">
            <div className="rounded-md border bg-white p-2">
              <img src={qr} alt="WhatsApp link QR code" className="h-52 w-52" />
            </div>
            <ol className="max-w-sm list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Open WhatsApp on your phone</li>
              <li>Tap Settings (or ⋮) → Linked devices → Link a device</li>
              <li>Scan this QR code</li>
            </ol>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{qrHint}</p>
        )
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-full max-w-xs space-y-2">
            <label className="text-xs font-medium text-slate-600">WhatsApp number to link</label>
            <div className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="9876543210"
                maxLength={20}
                className="no-uppercase h-9"
                onKeyDown={(e) => e.key === "Enter" && phoneOk && !busy && onRequestCode(digits)}
              />
              <Button type="button" size="sm" className="h-9 shrink-0" disabled={!phoneOk || busy} onClick={() => onRequestCode(digits)}>
                {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {pairingCode ? "New code" : "Get code"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">10-digit Indian numbers get +91 added. Other countries: type the country code first.</p>
            {pairingCode && (
              <button
                type="button"
                title="Copy code"
                onClick={() =>
                  void navigator.clipboard?.writeText(pairingCode.replace("-", "")).then(
                    () => toast.success("Code copied"),
                    () => undefined,
                  )
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 py-3 font-mono text-2xl font-bold tracking-[0.25em] text-emerald-800"
              >
                {pairingCode}
                <Copy className="h-4 w-4 text-emerald-600" />
              </button>
            )}
          </div>
          <ol className="max-w-sm list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Type the number above and tap Get code</li>
            <li>On that phone open WhatsApp → Settings (or ⋮) → Linked devices → Link a device</li>
            <li>Tap "Link with phone number instead"</li>
            <li>Enter the 8-character code shown here</li>
          </ol>
        </div>
      )}
    </div>
  );
}
