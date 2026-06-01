import { useCallback } from "react";
import { toast } from "@/hooks/use-toast";

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
}

export interface ElectronPrintOptions {
  printerName?: string;
  pageSize?: string | { width: number; height: number };
  copies?: number;
  landscape?: boolean;
  margins?:
    | { marginType: "default" | "none" | "printableArea" | "custom" }
    | { top: number; bottom: number; left: number; right: number };
  scaleFactor?: number;
  color?: boolean;
}

interface PrintResult {
  success: boolean;
  error?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const electronAPI = (window as any).electronAPI;

/**
 * Bridge to Electron's silent-print APIs. In a normal browser every method
 * degrades gracefully (printers list is empty, prints fall back to window.print()).
 */
export function useElectronPrint() {
  const isElectron = !!electronAPI?.isElectron;

  const getPrinters = useCallback(async (): Promise<PrinterInfo[]> => {
    if (!isElectron) return [];
    try {
      return (await electronAPI.getPrinters()) ?? [];
    } catch {
      return [];
    }
  }, [isElectron]);

  const silentPrint = useCallback(
    async (options: ElectronPrintOptions = {}): Promise<PrintResult> => {
      if (!isElectron) {
        window.print();
        return { success: true };
      }
      const result: PrintResult = await electronAPI.silentPrint(options);
      if (result.success) {
        toast({ title: "Printed", description: `Sent to ${options.printerName || "default printer"}` });
      } else {
        toast({ title: "Print failed", description: result.error || "Unknown error", variant: "destructive" });
      }
      return result;
    },
    [isElectron],
  );

  const printHtml = useCallback(
    async (html: string, options: ElectronPrintOptions = {}): Promise<PrintResult> => {
      if (!isElectron) {
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          win.print();
        }
        return { success: true };
      }
      const result: PrintResult = await electronAPI.printHtml({
        html,
        printerName: options.printerName,
        pageSize: options.pageSize || "A4",
        copies: options.copies || 1,
        margins: options.margins,
        landscape: options.landscape,
      });
      if (result.success) {
        toast({
          title: "Printed",
          description: `${options.copies || 1} copy sent to ${options.printerName || "default printer"}`,
        });
      } else {
        toast({ title: "Print failed", description: result.error || "Unknown error", variant: "destructive" });
      }
      return result;
    },
    [isElectron],
  );

  const printToPdf = useCallback(
    async (options: ElectronPrintOptions = {}): Promise<Uint8Array | null> => {
      if (!isElectron) return null;
      try {
        return await electronAPI.printToPdf(options);
      } catch {
        return null;
      }
    },
    [isElectron],
  );

  return { isElectron, getPrinters, silentPrint, printHtml, printToPdf };
}
