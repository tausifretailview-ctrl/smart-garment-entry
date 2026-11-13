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
