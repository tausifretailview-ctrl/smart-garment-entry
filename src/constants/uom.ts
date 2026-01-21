// Unit of Measurement (UOM) options
export const UOM_OPTIONS = [
  { value: 'NOS', label: 'NOS - Numbers/Pieces' },
  { value: 'KG', label: 'KG - Kilograms' },
  { value: 'GMS', label: 'GMS - Grams' },
  { value: 'LTR', label: 'LTR - Litres' },
  { value: 'MTR', label: 'MTR - Metres' },
  { value: 'DZN', label: 'DZN - Dozen' },
  { value: 'HLF_DZN', label: '1/2 DZN - Half Dozen' },
  { value: 'BOX', label: 'BOX - Box' },
  { value: 'PCS', label: 'PCS - Pieces' },
  { value: 'SET', label: 'SET - Set' },
  { value: 'PAIR', label: 'PAIR - Pair' },
  { value: 'ROLL', label: 'ROLL - Roll' },
  { value: 'PKT', label: 'PKT - Packet' },
] as const;

export type UOMType = typeof UOM_OPTIONS[number]['value'];

export const DEFAULT_UOM: UOMType = 'NOS';

// Get UOM label for display
export const getUOMLabel = (uom: string | null | undefined): string => {
  if (!uom) return 'NOS';
  const option = UOM_OPTIONS.find(o => o.value === uom);
  return option ? option.value : uom;
};

// Get full UOM description
export const getUOMFullLabel = (uom: string | null | undefined): string => {
  if (!uom) return 'NOS - Numbers/Pieces';
  const option = UOM_OPTIONS.find(o => o.value === uom);
  return option ? option.label : uom;
};
