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
  return typeof window !== 'undefined' && window.qz !== undefined && window.qz.websocket?.isActive?.();
};

/**
 * Connect to QZ Tray if not already connected
 */
export const ensureQZConnection = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !window.qz) return false;
  
  try {
    if (window.qz.websocket.isActive()) return true;
    await window.qz.websocket.connect();
    return true;
  } catch (err) {
    console.error('QZ Tray connection failed:', err);
    return false;
  }
};

/**
 * Get list of available printers from QZ Tray
 */
export const getQZPrinters = async (): Promise<string[]> => {
  if (!isQZReady()) {
    const connected = await ensureQZConnection();
    if (!connected) return [];
  }
  
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
 * Clones the element and wraps with necessary styles for standalone printing.
 */
export const extractInvoiceHTML = (ref: HTMLDivElement): string => {
  const clone = ref.cloneNode(true) as HTMLElement;
  
  // Force visibility - parent container may have opacity:0 for off-screen rendering
  clone.style.opacity = '1';
  clone.style.visibility = 'visible';
  clone.style.position = 'static';
  clone.style.pointerEvents = 'auto';
  
  // Get all stylesheets from the page (skip cross-origin ones)
  const styles = Array.from(document.styleSheets)
    .map(sheet => {
      try {
        return Array.from(sheet.cssRules)
          .map(rule => rule.cssText)
          .join('\n');
      } catch {
        // Cross-origin stylesheet - skip it
        return '';
      }
    })
    .join('\n');

  // Build standalone HTML with forced visibility
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${styles}</style>
  <style>
    body { margin: 0; padding: 0; opacity: 1 !important; visibility: visible !important; }
    * { opacity: 1 !important; visibility: visible !important; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>${clone.outerHTML}</body>
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
