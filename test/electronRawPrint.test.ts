import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";

/**
 * Cash drawer (Nov 2026): the desktop app sends the ESC/POS drawer kick straight to the
 * receipt printer. The printer name and bytes go in environment variables / stdin, never in
 * a command line a printer name could break out of.
 */
const require = createRequire(import.meta.url);
const { buildRawPrintCommand, sendRawToPrinter, WINDOWS_SCRIPT } = require("../electron/rawPrint.cjs") as {
  buildRawPrintCommand: (o: { platform: string; printerName: unknown; base64: unknown }) => null | {
    command: string; args: string[]; env: Record<string, string>; stdin: string | null;
  };
  sendRawToPrinter: (o: { printerName: string; base64: string; platform: string; spawnFn: unknown }) => Promise<{ success: boolean; error: string | null }>;
  WINDOWS_SCRIPT: string;
};

const KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]).toString("base64");

describe("raw print command", () => {
  it("Windows: spooler RAW job; printer name and bytes only in the environment", () => {
    const name = 'TVS RP 3160 "Gold"; Remove-Item C:\\';
    const job = buildRawPrintCommand({ platform: "win32", printerName: name, base64: KICK })!;
    expect(job.command).toBe("powershell.exe");
    expect(job.args).toContain("-EncodedCommand");
    expect(job.env).toEqual({ EZZY_RAW_PRINTER: name, EZZY_RAW_DATA: KICK });
    expect(job.args.join(" ")).not.toContain("TVS");
    const script = Buffer.from(job.args[job.args.length - 1], "base64").toString("utf16le");
    expect(script).toBe(WINDOWS_SCRIPT);
    expect(script).toContain('pDataType = "RAW"');
    expect(script).toContain("$env:EZZY_RAW_PRINTER");
  });

  it("other systems: lp raw queue, bytes on stdin", () => {
    const job = buildRawPrintCommand({ platform: "linux", printerName: "receipt", base64: KICK })!;
    expect(job).toMatchObject({ command: "lp", args: ["-d", "receipt", "-o", "raw"], stdin: KICK });
  });

  it("refuses no printer, bad or empty data, and anything too big", () => {
    expect(buildRawPrintCommand({ platform: "win32", printerName: "", base64: KICK })).toBeNull();
    expect(buildRawPrintCommand({ platform: "win32", printerName: "p", base64: "not base64!" })).toBeNull();
    expect(buildRawPrintCommand({ platform: "win32", printerName: "p", base64: "" })).toBeNull();
    const big = Buffer.alloc(70 * 1024, 1).toString("base64");
    expect(buildRawPrintCommand({ platform: "win32", printerName: "p", base64: big })).toBeNull();
  });
});

function fakeSpawn(stdout: string, code: number) {
  const calls: Array<{ cmd: string; args: string[]; env: Record<string, string> }> = [];
  const spawnFn = (cmd: string, args: string[], opts: { env: Record<string, string> }) => {
    calls.push({ cmd, args, env: opts.env });
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { end: () => void }; kill: () => void };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: () => undefined };
    child.kill = () => undefined;
    setTimeout(() => {
      child.stdout.emit("data", stdout);
      child.emit("close", code);
    }, 0);
    return child;
  };
  return { spawnFn, calls };
}

describe("sending the job", () => {
  it("OK from the spooler is success", async () => {
    const { spawnFn, calls } = fakeSpawn("OK", 0);
    await expect(sendRawToPrinter({ printerName: "receipt", base64: KICK, platform: "win32", spawnFn })).resolves.toEqual({ success: true, error: null });
    expect(calls[0].env.EZZY_RAW_PRINTER).toBe("receipt");
  });

  it("a spooler message is shown as the error", async () => {
    const { spawnFn } = fakeSpawn("Cannot open printer (1801)", 0);
    await expect(sendRawToPrinter({ printerName: "gone", base64: KICK, platform: "win32", spawnFn })).resolves.toEqual({
      success: false,
      error: "Cannot open printer (1801)",
    });
  });

  it("no printer: nothing is started", async () => {
    const { spawnFn, calls } = fakeSpawn("OK", 0);
    const res = await sendRawToPrinter({ printerName: "", base64: KICK, platform: "win32", spawnFn });
    expect(res.success).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
