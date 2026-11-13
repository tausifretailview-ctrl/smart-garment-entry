/**
 * Purchase Entry product description: name, then style, colour, brand and category when set
 * (a blank or "-" part is left out), joined with "-".
 */
export const formatProductDescription = (item: {
  product_name: string;
  category?: string | null;
  brand?: string | null;
  style?: string | null;
  color?: string | null;
  size?: string;
}) => {
  const parts = [item.product_name];
  if (item.style && item.style.trim() && item.style.trim() !== "-") parts.push(item.style);
  if (item.color && item.color.trim() && item.color.trim() !== "-") parts.push(item.color);
  if (item.brand && item.brand.trim() && item.brand.trim() !== "-") parts.push(item.brand);
  if (item.category && item.category.trim() && item.category.trim() !== "-") parts.push(item.category);
  return parts.join("-");
};
