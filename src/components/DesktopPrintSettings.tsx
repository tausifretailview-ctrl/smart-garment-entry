import { useEffect, useState } from "react";
import { Monitor, Printer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useElectronPrint, type PrinterInfo } from "@/hooks/useElectronPrint";
import { appPrint, PRINT_PREF_KEYS } from "@/utils/appPrint";
import { useToast } from "@/hooks/use-toast";

const NONE_VALUE = "__default__";

/**
 * Desktop-only printer preferences. Renders nothing in a normal browser, so the
 * web app is completely unaffected. Preferences are stored in localStorage and
 * consumed by the universal `appPrint()` helper.
 *
 * Uses native &lt;select&gt; on Electron — Radix Select portals often fail to
 * receive clicks inside the desktop WebView on Windows.
 */
export function DesktopPrintSettings() {
  const { toast } = useToast();
  const { isElectron, getPrinters } = useElectronPrint();
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [invoicePrinter, setInvoicePrinter] = useState("");
  const [thermalPrinter, setThermalPrinter] = useState("");
  const [barcodePrinter, setBarcodePrinter] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const [copies, setCopies] = useState(1);

  const refreshPrinters = async () => {
    setLoading(true);
    try {
      const list = await getPrinters();
      setPrinters(list);
      if (list.length === 0) {
        toast({
          title: "No printers found",
          description: "Install a printer in Windows Settings, then click Refresh printers.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isElectron) return;
    refreshPrinters();
    setInvoicePrinter(localStorage.getItem(PRINT_PREF_KEYS.invoicePrinter) || "");
    setThermalPrinter(localStorage.getItem(PRINT_PREF_KEYS.thermalPrinter) || "");
    setBarcodePrinter(localStorage.getItem(PRINT_PREF_KEYS.barcodePrinter) || "");
    setAutoPrint(localStorage.getItem(PRINT_PREF_KEYS.autoPrint) === "true");
    setCopies(Number(localStorage.getItem(PRINT_PREF_KEYS.copies)) || 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isElectron]);

  if (!isElectron) return null;

  const persist = (key: string, value: string) => localStorage.setItem(key, value);

  const nativePrinterSelect = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    storageKey: string,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        value={value || NONE_VALUE}
        onChange={(e) => {
          const next = e.target.value === NONE_VALUE ? "" : e.target.value;
          onChange(next);
          persist(storageKey, next);
        }}
      >
        <option value={NONE_VALUE}>System default printer</option>
        {printers.map((p) => (
          <option key={p.name} value={p.name}>
            {p.displayName}
            {p.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <Card className="mb-4 border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Desktop Print Settings
        </CardTitle>
        <CardDescription>
          Silent printing for the Windows desktop app — prints straight to the chosen printer with no
          dialog. These settings only apply in the desktop app.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={refreshPrinters} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh printers
          </Button>
        </div>

        {printers.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">
            No printers detected. Make sure a printer is installed in Windows, then click Refresh.
            You can also use <strong>File → Default Printer</strong> from the menu bar.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {nativePrinterSelect(
            "Invoice Printer (A4)",
            invoicePrinter,
            setInvoicePrinter,
            PRINT_PREF_KEYS.invoicePrinter,
          )}
          {nativePrinterSelect(
            "Receipt Printer (Thermal)",
            thermalPrinter,
            setThermalPrinter,
            PRINT_PREF_KEYS.thermalPrinter,
          )}
          {nativePrinterSelect(
            "Barcode / Label Printer",
            barcodePrinter,
            setBarcodePrinter,
            PRINT_PREF_KEYS.barcodePrinter,
          )}
          <div className="space-y-2">
            <Label htmlFor="print_copies">Default Copies</Label>
            <Input
              id="print_copies"
              type="number"
              min={1}
              max={10}
              value={copies}
              onChange={(e) => {
                const n = Math.max(1, Number(e.target.value) || 1);
                setCopies(n);
                persist(PRINT_PREF_KEYS.copies, String(n));
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="space-y-0.5">
            <Label>Auto-print after save</Label>
            <p className="text-xs text-muted-foreground">
              Print the invoice/receipt automatically when a sale is saved (skip the Print button).
              Barcode Printing uses the barcode printer above for direct labels (no dialog); without it,
              Print opens the system dialog with preview.
            </p>
          </div>
          <Switch
            checked={autoPrint}
            onCheckedChange={(checked) => {
              setAutoPrint(checked);
              persist(PRINT_PREF_KEYS.autoPrint, String(checked));
            }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appPrint({
                type: "invoice",
                html: `<html><body style="font-family:Arial;padding:24px"><h2>EzzyERP — Test Invoice</h2><p>This is a test A4 invoice print.</p><p>Printer: ${invoicePrinter || "System default"}</p></body></html>`,
              })
            }
          >
            <Printer className="h-4 w-4 mr-2" />
            Test Print Invoice
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              appPrint({
                type: "receipt",
                html: `<html><body style="font-family:monospace;width:72mm;padding:4px"><div style="text-align:center"><b>EzzyERP</b><br/>Test Receipt</div><hr/><div>Thermal print OK</div></body></html>`,
              })
            }
          >
            <Printer className="h-4 w-4 mr-2" />
            Test Print Receipt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default DesktopPrintSettings;
