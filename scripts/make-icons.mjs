// Fallback icon generator: converts build/icon.png -> build/icon.ico
// Only needed if electron-builder fails to auto-convert the PNG.
//
// Usage:
//   npm install --save-dev png-to-ico
//   node scripts/make-icons.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'build', 'icon.png');
const out = path.join(root, 'build', 'icon.ico');

if (!existsSync(src)) {
  console.error(`Missing source logo: ${src}\nDrop a square 512x512 PNG at build/icon.png first.`);
  process.exit(1);
}

let pngToIco;
try {
  pngToIco = (await import('png-to-ico')).default;
} catch {
  console.error('png-to-ico is not installed. Run: npm install --save-dev png-to-ico');
  process.exit(1);
}

const buf = await pngToIco(src);
writeFileSync(out, buf);
console.log(`Wrote ${out}`);
