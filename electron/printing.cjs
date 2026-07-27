const { BrowserWindow, dialog, ipcMain } = require('electron');

let getMainWindow = () => null;
let getTargetWindow = () => null;

function bindWindowAccessors({ getMainWindow: gmw, getTargetWindow: gtw }) {
  getMainWindow = gmw;
  getTargetWindow = gtw;
}

// ── Step 8: System printer pinning ─────────────────────────────────
// Lists OS printers and saves the user's pick to localStorage under the
// existing PRINT_PREF_KEYS used by src/utils/appPrint.ts — so the entire
// silent-print pipeline (invoices, thermal receipts, barcodes) picks it up
// without any web-side change.
const PRINTER_PREF_KEY = {
  invoice: 'ezzy_invoice_printer',
  receipt: 'ezzy_thermal_printer',
  barcode: 'ezzy_barcode_printer',
};
const PRINTER_LABEL = {
  invoice: 'A4 / Invoice Printer',
  receipt: 'Thermal Receipt Printer',
  barcode: 'Barcode Label Printer',
};

async function chooseDefaultPrinter(kind) {
  if (!getMainWindow() || getMainWindow().isDestroyed()) return;
  let printers = [];
  try {
    const wc = getMainWindow().webContents;
    printers =
      typeof wc.getPrintersAsync === 'function'
        ? await wc.getPrintersAsync()
        : wc.getPrinters();
  } catch {
    printers = [];
  }

  if (!printers || printers.length === 0) {
    dialog.showMessageBox(getMainWindow(), {
      type: 'info',
      title: 'Default Printer',
      message: 'No printers found',
      detail: 'Install/connect a printer in Windows Settings and try again.',
      buttons: ['OK'],
    });
    return;
  }

  const prefKey = PRINTER_PREF_KEY[kind];
  const current =
    (await getMainWindow().webContents
      .executeJavaScript(`localStorage.getItem(${JSON.stringify(prefKey)})`)
      .catch(() => '')) || '';

  const names = printers.map((p) => p.displayName || p.name);
  // showMessageBox supports up to a reasonable number of buttons; if too many
  // we still show them — Windows will scroll.
  const buttons = [...names, 'Clear', 'Cancel'];
  const result = dialog.showMessageBoxSync(getMainWindow(), {
    type: 'question',
    title: `Default ${PRINTER_LABEL[kind]}`,
    message: `Pick the ${PRINTER_LABEL[kind]}`,
    detail: current ? `Currently set: ${current}` : 'No printer pinned yet.',
    buttons,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  if (result === buttons.length - 1) return; // Cancel
  if (result === buttons.length - 2) {
    // Clear
    await getMainWindow().webContents
      .executeJavaScript(`localStorage.removeItem(${JSON.stringify(prefKey)})`)
      .catch(() => {});
    dialog.showMessageBox(getMainWindow(), {
      type: 'info',
      title: 'Default Printer',
      message: `${PRINTER_LABEL[kind]} cleared.`,
      buttons: ['OK'],
    });
    return;
  }

  const picked = printers[result];
  const pickedName = picked.name; // exact device name needed by Electron print API
  await getMainWindow().webContents
    .executeJavaScript(
      `localStorage.setItem(${JSON.stringify(prefKey)}, ${JSON.stringify(pickedName)})`,
    )
    .catch(() => {});
  dialog.showMessageBox(getMainWindow(), {
    type: 'info',
    title: 'Default Printer',
    message: `${PRINTER_LABEL[kind]} set to:`,
    detail: picked.displayName || pickedName,
    buttons: ['OK'],
  });
}



// ═══ PRINTER IPC ═══
// Silent/direct printing so the desktop app prints like Tally/Vyapar (no dialog).
// All handlers degrade gracefully and never throw across the IPC boundary.

// List connected printers
ipcMain.handle('get-printers', async () => {
  const win = getTargetWindow();
  if (!win) return [];
  try {
    const printers =
      typeof win.webContents.getPrintersAsync === 'function'
        ? await win.webContents.getPrintersAsync()
        : win.webContents.getPrinters();
    return (printers || []).map((p) => ({
      name: p.name,
      displayName: p.displayName || p.name,
      description: p.description || '',
      status: p.status,
      isDefault: !!p.isDefault,
    }));
  } catch (err) {
    return [];
  }
});

// Silent print the current page — no dialog
ipcMain.handle('silent-print', async (_event, options = {}) => {
  const win = getTargetWindow();
  if (!win) return { success: false, error: 'No window' };

  return new Promise((resolve) => {
    try {
      win.webContents.print(
        {
          silent: true,
          deviceName: options.printerName || '',
          pageSize: options.pageSize || 'A4',
          copies: options.copies || 1,
          landscape: options.landscape || false,
          margins: options.margins || { marginType: 'default' },
          scaleFactor: options.scaleFactor || 100,
          printBackground: true,
          color: options.color !== false,
        },
        (success, failureReason) => resolve({ success, error: failureReason || null }),
      );
    } catch (err) {
      resolve({ success: false, error: String(err && err.message ? err.message : err) });
    }
  });
});

// Render a PDF buffer of the current page (for preview/save)
ipcMain.handle('print-to-pdf', async (_event, options = {}) => {
  const win = getTargetWindow();
  if (!win) return null;
  try {
    const pdfData = await win.webContents.printToPDF({
      pageSize: options.pageSize || 'A4',
      landscape: options.landscape || false,
      margins: options.margins || { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
      printBackground: true,
    });
    return pdfData;
  } catch (err) {
    return null;
  }
});

// Print an arbitrary HTML string via an offscreen window (receipts/invoices/labels)
ipcMain.handle('print-html', async (_event, payload = {}) => {
  const {
    html,
    printerName,
    pageSize,
    copies,
    margins,
    landscape,
    silent,
    printKind,
    preferCSSPageSize,
  } = payload;
  if (!html) return { success: false, error: 'No HTML provided' };

  const printSilent = silent !== false;
  const isReceipt =
    printKind === 'receipt' ||
    (typeof pageSize === 'object' &&
      pageSize &&
      Number(pageSize.width) >= 58000 &&
      Number(pageSize.width) <= 82000);
  const isBarcode = printKind === 'barcode';
  const useCssPageSize = !!preferCSSPageSize || isReceipt || isBarcode;

  return new Promise((resolve) => {
    let printWin = new BrowserWindow({
      show: !printSilent,
      width: isReceipt ? 340 : 800,
      height: isReceipt ? 900 : 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    // Offscreen print surface only ever loads the provided data: URL —
    // block any window.open and any navigation away from it.
    printWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    printWin.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        if (printWin && !printWin.isDestroyed()) printWin.close();
      } catch {}
      printWin = null;
      resolve(result);
    };

    // Safety timeout so a stuck render never hangs the renderer's await
    const timeout = setTimeout(() => finish({ success: false, error: 'Print timed out' }), 15000);

    printWin.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        try {
          printWin.webContents.print(
            {
              silent: printSilent,
              deviceName: printerName || '',
              pageSize: useCssPageSize ? undefined : (pageSize || 'A4'),
              copies: copies || 1,
              landscape: landscape || false,
              margins: isReceipt || isBarcode
                ? { marginType: 'none' }
                : margins || { marginType: 'default' },
              printBackground: true,
              preferCSSPageSize: useCssPageSize,
            },
            (success, failureReason) => {
              clearTimeout(timeout);
              finish({ success, error: failureReason || null });
            },
          );
        } catch (err) {
          clearTimeout(timeout);
          finish({ success: false, error: String(err && err.message ? err.message : err) });
        }
      }, 300);
    });

    printWin
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .catch((err) => {
        clearTimeout(timeout);
        finish({ success: false, error: String(err && err.message ? err.message : err) });
      });
  });
});



function registerPrintingIpc() {
  // Handlers registered at module load above (same as original top-level ipcMain.handle).
}

module.exports = {
  bindWindowAccessors,
  chooseDefaultPrinter,
  registerPrintingIpc,
};
