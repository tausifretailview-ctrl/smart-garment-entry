// Precision Pro TSC — 102×50mm footwear label (box + 2 pair labels)
// TSC TTP-244 Pro / 245 at 203 DPI (8 dots/mm → 816×400 dots)

export interface PrecisionProTSCLabelData {
  businessName: string;
  barcode: string;
  productName: string;
  style: string;
  brand: string;
  color: string;
  size: string;
  salePrice: number;
  mrp: number;
  category?: string;
}

const esc = (s: string) => s.replace(/"/g, '\\"');

export function generatePrecisionProTSCLabel(
  data: PrecisionProTSCLabelData,
  copies: number = 1,
): string {
  const {
    businessName,
    barcode,
    productName,
    style,
    brand,
    color,
    size,
    mrp,
    category,
  } = data;

  const orgTrunc = (businessName || '').slice(0, 20);
  const productTrunc = (productName || '').slice(0, 12);
  const styleTrunc = (style || '').slice(0, 18);
  const brandTrunc = (brand || '').slice(0, 10);
  const colorTrunc = (color || '').slice(0, 10);
  const categoryTrunc = (category || '').slice(0, 8);

  return `
SIZE 102 mm, 50 mm
GAP 2 mm, 0 mm
DIRECTION 1
REFERENCE 0,0
CODEPAGE UTF-8
CLS

TEXT 10,10,"3",0,1,1,"${esc(orgTrunc)}"
BARCODE 10,45,"128",60,1,0,2,2,"${barcode}"
TEXT 10,115,"2",0,1,1,"${barcode}"
TEXT 10,140,"2",0,1,1,"MRP: Rs.${mrp}/-"
TEXT 10,165,"4",0,1,1,"${esc(productTrunc)}"
TEXT 10,205,"3",0,1,1,"${esc(styleTrunc)}"
TEXT 10,235,"2",0,1,1,"${esc(brandTrunc)}"
TEXT 220,235,"2",0,1,1,"${esc(categoryTrunc)}"
TEXT 10,260,"2",0,1,1,"${esc(colorTrunc)}"
TEXT 320,195,"5",0,2,2,"${size}"
BAR 495,0,2,400

BARCODE 505,5,"128",40,1,0,2,2,"${barcode}"
TEXT 505,50,"1",0,1,1,"${barcode}"
TEXT 505,70,"2",0,1,1,"${esc(productTrunc)}"
TEXT 720,70,"2",0,1,1,"${size}"
TEXT 505,95,"2",0,1,1,"${esc(brandTrunc)}"
TEXT 505,120,"2",0,1,1,"${esc(colorTrunc)}"

BAR 497,195,315,2

BARCODE 505,200,"128",40,1,0,2,2,"${barcode}"
TEXT 505,245,"1",0,1,1,"${barcode}"
TEXT 505,265,"2",0,1,1,"${esc(productTrunc)}"
TEXT 720,265,"2",0,1,1,"${size}"
TEXT 505,290,"2",0,1,1,"${esc(brandTrunc)}"
TEXT 505,315,"2",0,1,1,"${esc(colorTrunc)}"

PRINT 1,${copies}
`.trim();
}

export function generatePrecisionProTSCBatch(
  items: PrecisionProTSCLabelData[],
  copiesPerItem: number = 1,
): string {
  return items
    .map((item) => generatePrecisionProTSCLabel(item, copiesPerItem))
    .join('\n');
}
