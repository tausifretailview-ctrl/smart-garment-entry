/**
 * Send raw printer bytes (ESC/POS) to a printer — used to kick the cash drawer that is
 * cabled to the thermal receipt printer (Nov 2026).
 *
 * The drawer used to go through QZ Tray, which the app stopped loading long ago, so it never
 * opened. Windows: the bytes go to the printer queue with datatype RAW through the spooler
 * (winspool.drv, from a short PowerShell script — no native module to build). Other systems:
 * `lp -o raw`.
 *
 * The printer name and the bytes travel in environment variables, never in the command line,
 * so a printer name can never be read as part of the command.
 */
const { spawn } = require('child_process');

const RAW_PRINT_TIMEOUT_MS = 20000;
/** A drawer kick is 5 bytes; anything bigger than a receipt is refused. */
const MAX_RAW_BYTES = 64 * 1024;

const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class EzzyRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "Cannot open printer (" + Marshal.GetLastWin32Error() + ")";
    try {
      DOCINFO info = new DOCINFO();
      info.pDocName = "EzzyERP cash drawer";
      info.pDataType = "RAW";
      if (StartDocPrinter(h, 1, info) == 0) return "Printer refused the job (" + Marshal.GetLastWin32Error() + ")";
      try {
        StartPagePrinter(h);
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length) return "Write failed (" + Marshal.GetLastWin32Error() + ")";
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
    return "OK";
  }
}
"@
[Console]::Out.Write([EzzyRawPrint]::Send($env:EZZY_RAW_PRINTER, [Convert]::FromBase64String($env:EZZY_RAW_DATA)))
`;

/** PowerShell -EncodedCommand takes UTF-16LE base64. */
function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/**
 * The process to start for one raw job (pure: tested without a printer).
 * Returns null when the input is not acceptable.
 */
function buildRawPrintCommand({ platform, printerName, base64 }) {
  const name = typeof printerName === 'string' ? printerName.trim() : '';
  if (!name || name.length > 256) return null;
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const size = Buffer.from(base64, 'base64').length;
  if (size === 0 || size > MAX_RAW_BYTES) return null;

  if (platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(WINDOWS_SCRIPT)],
      env: { EZZY_RAW_PRINTER: name, EZZY_RAW_DATA: base64 },
      stdin: null,
    };
  }
  // macOS / Linux: CUPS raw queue. The name is one argv entry (no shell).
  return { command: 'lp', args: ['-d', name, '-o', 'raw'], env: {}, stdin: base64 };
}

/** Run the job. Resolves { success, error }; never rejects. */
function sendRawToPrinter({ printerName, base64, platform = process.platform, spawnFn = spawn }) {
  const job = buildRawPrintCommand({ platform, printerName, base64 });
  if (!job) return Promise.resolve({ success: false, error: 'No printer chosen, or nothing to send.' });

  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    let child;
    try {
      child = spawnFn(job.command, job.args, {
        env: { ...process.env, ...job.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      finish({ success: false, error: String(e && e.message ? e.message : e) });
      return;
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ success: false, error: 'The printer did not answer in time.' });
    }, RAW_PRINT_TIMEOUT_MS);
    child.stdout && child.stdout.on('data', (d) => (out += String(d)));
    child.stderr && child.stderr.on('data', (d) => (err += String(d)));
    child.on('error', (e) => finish({ success: false, error: String(e && e.message ? e.message : e) }));
    child.on('close', (code) => {
      if (platform === 'win32') {
        const msg = out.trim();
        finish(msg === 'OK' ? { success: true, error: null } : { success: false, error: msg || err.trim() || `Exit ${code}` });
      } else {
        finish(code === 0 ? { success: true, error: null } : { success: false, error: err.trim() || `Exit ${code}` });
      }
    });
    if (job.stdin != null && child.stdin) {
      child.stdin.end(Buffer.from(job.stdin, 'base64'));
    } else if (child.stdin) {
      child.stdin.end();
    }
  });
}

module.exports = { buildRawPrintCommand, sendRawToPrinter, MAX_RAW_BYTES, WINDOWS_SCRIPT };
