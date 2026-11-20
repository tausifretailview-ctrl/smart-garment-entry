import { inflateSync } from "node:zlib";

/**
 * Text drawn in a PDF, in order. Enough for label sheets made with pdf-lib: it inflates each
 * content stream and reads `<hex> Tj` and `(literal) Tj` strings. Not a general PDF parser.
 */
export function pdfTextItems(pdf: Buffer): string[] {
  const raw = pdf.toString("latin1");
  const items: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let m = streamRe.exec(raw); m; m = streamRe.exec(raw)) {
    const bytes = Buffer.from(m[1], "latin1");
    let content: string;
    try {
      content = inflateSync(bytes).toString("latin1");
    } catch {
      content = m[1];
    }
    const textRe = /<([0-9A-Fa-f]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    for (let t = textRe.exec(content); t; t = textRe.exec(content)) {
      items.push(t[1] !== undefined ? Buffer.from(t[1], "hex").toString("latin1") : t[2].replace(/\\(.)/g, "$1"));
    }
  }
  return items;
}

/** Text drawn in a PDF with where it starts (points from the bottom-left), for pdf-lib output. */
export function pdfTextWithPositions(pdf: Buffer): Array<{ text: string; x: number; y: number }> {
  const raw = pdf.toString("latin1");
  const items: Array<{ text: string; x: number; y: number }> = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let m = streamRe.exec(raw); m; m = streamRe.exec(raw)) {
    const bytes = Buffer.from(m[1], "latin1");
    let content: string;
    try {
      content = inflateSync(bytes).toString("latin1");
    } catch {
      content = m[1];
    }
    const num = "(-?\\d+(?:\\.\\d+)?)";
    const re = new RegExp(
      `${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+Tm[\\s\\S]*?(?:<([0-9A-Fa-f]*)>|\\(((?:\\\\.|[^\\\\)])*)\\))\\s*Tj`,
      "g",
    );
    for (let t = re.exec(content); t; t = re.exec(content)) {
      const text = t[7] !== undefined ? Buffer.from(t[7], "hex").toString("latin1") : String(t[8]).replace(/\\(.)/g, "$1");
      items.push({ text, x: Number(t[5]), y: Number(t[6]) });
    }
  }
  return items;
}
