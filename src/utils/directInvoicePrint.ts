import { toast } from 'sonner';

declare global {
  interface Window {
    qz: any;
  }
}

interface PrintConfig {
  printerName: string;
  paperSize?: '58mm' | '80mm' | 'A4' | 'A5';
  copies?: number;
}

/**
 * Check if QZ Tray is available and connected
 */
export const isQZReady = (): boolean => {
  if (typeof window === 'undefined' || !window.qz) return false;
  return window.qz.websocket?.isActive?.() === true;
};

/**
 * Wait for the QZ Tray script to fully load (max 8 seconds).
 * The script is loaded async in index.html, so window.qz
 * may not exist immediately when the app boots.
 */
export const waitForQZ = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && window.qz) {
      resolve(true);
      return;
    }
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (typeof window !== 'undefined' && window.qz) {
        clearInterval(interval);
        resolve(true);
      } else if (attempts >= 40) { // 40 × 200ms = 8s timeout
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
};

/**
 * Connect to QZ Tray if not already connected.
 * Sets up required security callbacks for QZ Tray 2.x.
 */
export const ensureQZConnection = async (): Promise<boolean> => {
  // Wait for QZ script to load first
  const qzLoaded = await waitForQZ();
  if (!qzLoaded) {
    console.warn('QZ Tray script not loaded after 8s');
    return false;
  }

  try {
    const qz = window.qz;

    // REQUIRED: Set up unsigned certificate mode.
    // QZ Tray 2.x rejects connections without these callbacks.
    // For self-hosted/intranet use, empty cert + empty sig is
    // the standard approach — QZ Tray will prompt for approval
    // once and remember it.
    if (!qz.security._certSet) {
      qz.security.setCertificatePromise((resolve: Function) => {
        resolve(''); // empty = unsigned mode
      });
      qz.security.setSignatureAlgorithm('SHA512');
      qz.security.setSignaturePromise((_toSign: string) => {
        return new Promise<string>((resolve) => resolve(''));
      });
      // Mark as set so we don't re-register on every call
      qz.security._certSet = true;
    }

    if (qz.websocket.isActive()) return true;

    await qz.websocket.connect({ retries: 2, delay: 1 });
    return true;
  } catch (err: any) {
    console.error('QZ Tray connection failed:', err);
    return false;
  }
};

/**
 * Get list of available printers from QZ Tray
 */
export const getQZPrinters = async (): Promise<string[]> => {
  const connected = await ensureQZConnection();
  if (!connected) return [];

  try {
    return await window.qz.printers.find();
  } catch (err) {
    console.error('Failed to get printers:', err);
    return [];
  }
};

/**
 * Core function: Print HTML via QZ Tray pixel printing mode.
 * This reuses existing invoice templates rendered as HTML.
 */
export const printViaQZTray = async (
  html: string,
  config: PrintConfig
): Promise<boolean> => {
  if (!config.printerName) {
    toast.error('No printer selected for direct printing');
    return false;
  }

  // Ensure QZ connection
  const connected = await ensureQZConnection();
  if (!connected) {
    toast.error('QZ Tray is not connected. Please install QZ Tray from https://qz.io/download/');
    return false;
  }

  try {
    const qz = window.qz;

    // Determine print config based on paper size
    let qzConfig: any;
    const paperSize = config.paperSize || '80mm';

    if (paperSize === '80mm' || paperSize === '58mm') {
      // Thermal printer config
      const widthMm = paperSize === '80mm' ? 72 : 48; // printable width
      qzConfig = qz.configs.create(config.printerName, {
        size: { width: widthMm, height: null }, // auto height
        units: 'mm',
        rasterize: true,
        scaleContent: true,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        copies: config.copies || 1,
      });
    } else if (paperSize === 'A5') {
      qzConfig = qz.configs.create(config.printerName, {
        size: { width: 148, height: 210 },
        units: 'mm',
        rasterize: true,
        scaleContent: true,
        margins: { top: 5, right: 5, bottom: 5, left: 5 },
        copies: config.copies || 1,
      });
    } else {
      // A4
      qzConfig = qz.configs.create(config.printerName, {
        size: { width: 210, height: 297 },
        units: 'mm',
        rasterize: true,
        scaleContent: true,
        margins: { top: 5, right: 5, bottom: 5, left: 5 },
        copies: config.copies || 1,
      });
    }

    const printData = [{
      type: 'pixel',
      format: 'html',
      data: html,
    }];

    await qz.print(qzConfig, printData);
    return true;
  } catch (err: any) {
    console.error('QZ Tray print error:', err);
    toast.error(err?.message || 'Direct printing failed');
    return false;
  }
};

/**
 * Extract the rendered HTML from an invoice ref element.
 * Injects the app's full stylesheets so Tailwind classes render
 * correctly in QZ Tray's headless Chromium instance.
 */
export const extractInvoiceHTML = (ref: HTMLDivElement): string => {
  // Get the current app's stylesheet content to inject inline
  const getPageStylesheets = (): string => {
    const styles: string[] = [];
    try {
      const sheets = document.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        try {
          const rules = sheets[i].cssRules;
          if (rules) {
            for (let j = 0; j < rules.length; j++) {
              styles.push(rules[j].cssText);
            }
          }
        } catch (e) {
          // Cross-origin stylesheet — skip
        }
      }
    } catch (e) {
      console.warn('Could not extract stylesheets:', e);
    }
    return styles.join('\n');
  };

  const outerHTML = ref.outerHTML;
  const allStyles = getPageStylesheets();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { margin: 0; }
    ${allStyles}
  </style>
</head>
<body>
  ${outerHTML}
</body>
</html>`;
};

/**
 * Print a test receipt to verify printer connectivity
 */
export const printTestReceipt = async (printerName: string, paperSize: '58mm' | '80mm' | 'A4' | 'A5' = '80mm'): Promise<boolean> => {
  const testHtml = `
    <div style="font-family: Arial, sans-serif; padding: 10px; text-align: center;">
      <h2 style="margin: 0 0 8px 0; font-size: 16px;">🖨️ QZ Tray Test Print</h2>
      <hr style="border: 1px dashed #000; margin: 8px 0;" />
      <p style="margin: 4px 0; font-size: 13px;"><strong>Printer:</strong> ${printerName}</p>
      <p style="margin: 4px 0; font-size: 13px;"><strong>Paper:</strong> ${paperSize}</p>
      <p style="margin: 4px 0; font-size: 13px;"><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <hr style="border: 1px dashed #000; margin: 8px 0;" />
      <p style="margin: 4px 0; font-size: 12px;">Direct printing is working!</p>
      <p style="margin: 4px 0; font-size: 11px; color: #666;">EzzyERP - Smart Billing</p>
    </div>
  `;

  return printViaQZTray(testHtml, { printerName, paperSize });
};
