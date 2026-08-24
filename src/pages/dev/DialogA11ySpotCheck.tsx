/**
 * DEV-only visual harness for Dialog description fallback.
 * Route: /__dev__/dialog-a11y
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MixPaymentDialog } from "@/components/MixPaymentDialog";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { PriceSelectionDialog } from "@/components/PriceSelectionDialog";

export default function DialogA11ySpotCheck() {
  const [mixOpen, setMixOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background p-8 space-y-4">
      <h1 className="text-xl font-semibold">Dialog a11y spot-check</h1>
      <p className="text-sm text-muted-foreground max-w-xl">
        Opens four real dialogs: Mix Payment (no description), Keyboard Shortcuts
        (description nested in header), Select Price (description nested in header),
        New Customer (header title only).
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setMixOpen(true)}>Mix Payment (no desc)</Button>
        <Button onClick={() => setKeysOpen(true)}>Keyboard shortcuts (nested desc)</Button>
        <Button onClick={() => setPriceOpen(true)}>Select Price (nested desc)</Button>
        <Button onClick={() => setCustomerOpen(true)}>New Customer (no desc)</Button>
      </div>

      <MixPaymentDialog open={mixOpen} onOpenChange={setMixOpen} billAmount={681} />
      <KeyboardShortcutsModal open={keysOpen} onOpenChange={setKeysOpen} context="general" />
      <PriceSelectionDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        productName="FL505"
        size="7"
        masterPrice={{ sale_price: 258.65, mrp: 369.5 }}
        lastPurchasePrice={{ sale_price: 230.65, mrp: 329.5 }}
        onSelect={() => setPriceOpen(false)}
      />
      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <p className="text-sm">Phone and name fields would go here.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
