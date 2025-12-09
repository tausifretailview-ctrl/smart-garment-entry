/**
 * PRN Template Parser for Perfect Label Printing
 * 
 * This utility parses PRN/TSPL template files and replaces placeholders
 * with actual product data for pixel-perfect label printing.
 */

export interface LabelDataForPRN {
  productName?: string;
  brand?: string;
  size?: string;
  color?: string;
  mrp?: number;
  salePrice?: number;
  barcode?: string;
  billNumber?: string;
  purchaseCode?: string;
  supplierCode?: string;
  style?: string;
}

export interface PRNTemplate {
  id?: string;
  name: string;
  content: string;
  placeholders: string[];
  description?: string;
  createdAt?: string;
}

// Supported placeholders in PRN templates
export const SUPPORTED_PLACEHOLDERS = [
  '{BRAND}',
  '{PRODUCT}',
  '{PRODUCTNAME}',
  '{SIZE}',
  '{COLOR}',
  '{STYLE}',
  '{MRP}',
  '{PRICE}',
  '{SALEPRICE}',
  '{BARCODE}',
  '{BILLNO}',
  '{BILLNUMBER}',
  '{PURCHASECODE}',
  '{SUPPLIERCODE}',
] as const;

/**
 * Detect all placeholders used in a PRN template
 */
export const detectPlaceholders = (templateContent: string): string[] => {
  const placeholders: string[] = [];
  const regex = /\{([A-Z]+)\}/gi;
  let match;
  
  while ((match = regex.exec(templateContent)) !== null) {
    const placeholder = `{${match[1].toUpperCase()}}`;
    if (!placeholders.includes(placeholder)) {
      placeholders.push(placeholder);
    }
  }
  
  return placeholders;
};

/**
 * Replace placeholders in PRN template with actual data
 */
export const mergePRNTemplate = (
  template: string,
  data: LabelDataForPRN
): string => {
  let result = template;
  
  // Replace each placeholder with corresponding data
  result = result.replace(/\{BRAND\}/gi, data.brand || '');
  result = result.replace(/\{PRODUCT\}/gi, data.productName || '');
  result = result.replace(/\{PRODUCTNAME\}/gi, data.productName || '');
  result = result.replace(/\{SIZE\}/gi, data.size || '');
  result = result.replace(/\{COLOR\}/gi, data.color || '');
  result = result.replace(/\{STYLE\}/gi, data.style || '');
  result = result.replace(/\{MRP\}/gi, data.mrp ? `₹${data.mrp}` : '');
  result = result.replace(/\{PRICE\}/gi, data.salePrice ? `₹${data.salePrice}` : '');
  result = result.replace(/\{SALEPRICE\}/gi, data.salePrice ? `₹${data.salePrice}` : '');
  result = result.replace(/\{BARCODE\}/gi, data.barcode || '');
  result = result.replace(/\{BILLNO\}/gi, data.billNumber || '');
  result = result.replace(/\{BILLNUMBER\}/gi, data.billNumber || '');
  result = result.replace(/\{PURCHASECODE\}/gi, data.purchaseCode || '');
  result = result.replace(/\{SUPPLIERCODE\}/gi, data.supplierCode || '');
  
  return result;
};

/**
 * Generate multiple labels from a PRN template
 */
export const generatePRNBatch = (
  template: string,
  items: Array<{ data: LabelDataForPRN; quantity: number }>
): string => {
  const commands: string[] = [];
  
  items.forEach(item => {
    for (let i = 0; i < item.quantity; i++) {
      // For each copy, merge the template with data
      const merged = mergePRNTemplate(template, item.data);
      commands.push(merged);
    }
  });
  
  return commands.join('\n');
};

/**
 * Validate PRN template format
 */
export const validatePRNTemplate = (content: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Check for basic TSPL commands
  if (!content.includes('SIZE') && !content.includes('size')) {
    errors.push('Template should include SIZE command');
  }
  
  if (!content.includes('PRINT') && !content.includes('print')) {
    errors.push('Template should include PRINT command');
  }
  
  // Check for at least one placeholder
  const placeholders = detectPlaceholders(content);
  if (placeholders.length === 0) {
    errors.push('Template should include at least one placeholder (e.g., {BRAND}, {PRICE})');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Sample PRN templates for different label sizes
 */
export const SAMPLE_PRN_TEMPLATES: PRNTemplate[] = [
  {
    name: '50x25mm - Standard',
    description: 'Standard retail label with barcode',
    content: `SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 4,2,"2",0,1,1,"{BRAND}"
TEXT 4,18,"1",0,1,1,"{PRODUCT}"
TEXT 4,32,"2",0,1,1,"{SIZE}"
TEXT 140,32,"2",0,1,1,"{PRICE}"
BARCODE 30,48,"128",40,0,0,2,2,"{BARCODE}"
TEXT 60,92,"1",0,1,1,"{BARCODE}"
PRINT 1,1
`,
    placeholders: ['{BRAND}', '{PRODUCT}', '{SIZE}', '{PRICE}', '{BARCODE}'],
  },
  {
    name: '50x25mm - Barcode Top',
    description: 'Barcode at top with details below',
    content: `SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
BARCODE 30,4,"128",35,0,0,2,2,"{BARCODE}"
TEXT 60,42,"1",0,1,1,"{BARCODE}"
TEXT 4,56,"2",0,1,1,"{BRAND}"
TEXT 4,72,"1",0,1,1,"{PRODUCT}"
TEXT 4,86,"2",0,1,1,"{SIZE}"
TEXT 140,86,"2",0,1,1,"{PRICE}"
PRINT 1,1
`,
    placeholders: ['{BARCODE}', '{BRAND}', '{PRODUCT}', '{SIZE}', '{PRICE}'],
  },
  {
    name: '50x30mm - Detailed',
    description: 'Larger label with all fields',
    content: `SIZE 50 mm, 30 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 4,2,"2",0,1,1,"{BRAND}"
TEXT 4,18,"1",0,1,1,"{PRODUCT}"
TEXT 4,32,"1",0,1,1,"{STYLE}"
TEXT 4,46,"2",0,1,1,"{SIZE}"
TEXT 100,46,"2",0,1,1,"{COLOR}"
TEXT 140,46,"2",0,1,1,"{PRICE}"
BARCODE 30,62,"128",40,0,0,2,2,"{BARCODE}"
TEXT 60,106,"1",0,1,1,"{BARCODE}"
PRINT 1,1
`,
    placeholders: ['{BRAND}', '{PRODUCT}', '{STYLE}', '{SIZE}', '{COLOR}', '{PRICE}', '{BARCODE}'],
  },
  {
    name: '38x25mm - Compact',
    description: 'Compact label for small items',
    content: `SIZE 38 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 4,2,"1",0,1,1,"{BRAND}"
TEXT 4,16,"2",0,1,1,"{SIZE}"
TEXT 100,16,"2",0,1,1,"{PRICE}"
BARCODE 20,32,"128",35,0,0,2,2,"{BARCODE}"
TEXT 40,70,"1",0,1,1,"{BARCODE}"
PRINT 1,1
`,
    placeholders: ['{BRAND}', '{SIZE}', '{PRICE}', '{BARCODE}'],
  },
  {
    name: '50x25mm - Price Focus',
    description: 'Large price display with barcode',
    content: `SIZE 50 mm, 25 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 4,2,"1",0,1,1,"{BRAND}"
TEXT 4,16,"3",0,1,1,"{PRICE}"
TEXT 4,42,"2",0,1,1,"{SIZE}"
BARCODE 30,58,"128",30,0,0,2,2,"{BARCODE}"
TEXT 60,92,"1",0,1,1,"{BARCODE}"
PRINT 1,1
`,
    placeholders: ['{BRAND}', '{PRICE}', '{SIZE}', '{BARCODE}'],
  },
];

/**
 * Get sample template by name
 */
export const getSampleTemplate = (name: string): PRNTemplate | undefined => {
  return SAMPLE_PRN_TEMPLATES.find(t => t.name === name);
};

/**
 * Parse file content and determine if it's a valid PRN/TSPL template
 */
export const parsePRNFile = (content: string): PRNTemplate | null => {
  const validation = validatePRNTemplate(content);
  
  if (!validation.valid) {
    console.warn('PRN validation warnings:', validation.errors);
  }
  
  const placeholders = detectPlaceholders(content);
  
  return {
    name: 'Uploaded Template',
    content: content.trim(),
    placeholders,
  };
};
