// Generates a simple fallback tray icon (electron/tray-icon.png) so the
// desktop app always has a tray — enabling "close to tray" keep-alive even
// before the user supplies their own build/icon.png logo.
// Run with: node scripts/make-tray-icon.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const NAVY = [30, 64, 175]; // #1e40af (matches the app header / title bar)
const WHITE = [255, 255, 255];

// Build raw RGBA pixels: navy rounded-ish square with a white "receipt" block.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // +1 filter byte per scanline
let p = 0;
for (let y = 0; y < SIZE; y++) {
  raw[p++] = 0; // filter type: none
  for (let x = 0; x < SIZE; x++) {
    // Rounded corners: transparent outside a small inset radius.
    const inset = 2;
    const corner =
      (x < inset && y < inset) ||
      (x >= SIZE - inset && y < inset) ||
      (x < inset && y >= SIZE - inset) ||
      (x >= SIZE - inset && y >= SIZE - inset);

    // Centered white block (a simple "document" mark).
    const white = x >= 11 && x <= 20 && y >= 8 && y <= 23;

    if (corner) {
      raw[p++] = 0; raw[p++] = 0; raw[p++] = 0; raw[p++] = 0; // transparent
    } else if (white) {
      raw[p++] = WHITE[0]; raw[p++] = WHITE[1]; raw[p++] = WHITE[2]; raw[p++] = 255;
    } else {
      raw[p++] = NAVY[0]; raw[p++] = NAVY[1]; raw[p++] = NAVY[2]; raw[p++] = 255;
    }
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Minimal CRC32 for PNG chunks.
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = zlib.deflateSync(raw);

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'electron', 'tray-icon.png');
fs.writeFileSync(out, png);
console.log('Wrote', out, `(${png.length} bytes)`);
