import { useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isValidPosMobile, normalizePosMobile } from "@/utils/posRequiredMobile";

type Props = {
  open: boolean;
  /** Number already on the bill (shown for correction). */
  initialPhone: string;
  onCancel: () => void;
  /** Called with a valid 10-digit mobile; the bill then saves. */
  onSubmit: (mobile: string) => void;
};

/** POS "Mobile number compulsory": asked after a payment mode is chosen, before the bill saves. */
export function PosMobileRequiredDialog({ open, initialPhone, onCancel, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue(String(initialPhone || "").replace(/\D/g, "").slice(-10));
    setTouched(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, initialPhone]);

  const valid = isValidPosMobile(value);
  const submit = () => {
    setTouched(true);
    if (valid) onSubmit(normalizePosMobile(value));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Enter mobile number
          </DialogTitle>
          <DialogDescription>Customer mobile is required to save this bill.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-2"
        >
          <Input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            placeholder="10-digit mobile"
            maxLength={14}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^\d+]/g, ""))}
            className="h-12 text-center text-lg tracking-widest"
            aria-invalid={touched && !valid}
          />
          {touched && !valid && (
            <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>
          )}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit">Save bill</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
