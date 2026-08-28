export type WebsiteStockStatus = "in_stock" | "low_stock" | "out_of_stock";

export type WebsiteSettings = {
  organization_id: string;
  slug: string;
  whatsapp_number: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  theme_accent_color: string | null;
  is_published: boolean;
  custom_domain: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WebsiteProduct = {
  id: string;
  organization_id: string;
  product_id: string;
  variant_id: string | null;
  display_price: number | null;
  photo_urls: string[];
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WebsiteEnquiryStatus = "new" | "contacted" | "converted" | "closed";

export type WebsiteEnquiry = {
  id: string;
  organization_id: string;
  product_id: string | null;
  customer_name: string;
  customer_phone: string;
  message: string | null;
  status: WebsiteEnquiryStatus;
  created_at: string;
};

export type PublicStorefrontShop = {
  name: string;
  slug: string;
  /** Preferred trading name from company profile when available. */
  display_name?: string | null;
  logo_url?: string | null;
  address?: string | null;
  whatsapp_number?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  theme_accent_color?: string | null;
  /** From org bill_barcode_settings — used for storefront UPI checkout. */
  upi_id?: string | null;
  upi_business_name?: string | null;
};

export type PublicStorefrontVariant = {
  id: string;
  size: string | null;
  color: string | null;
  display_price: number | null;
  stock_status: WebsiteStockStatus;
  stock_left: number | null;
};

export type PublicStorefrontProduct = {
  id: string;
  product_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  display_order: number;
  display_price: number | null;
  photo_urls: string[];
  stock_status: WebsiteStockStatus;
  stock_left: number | null;
  variants: PublicStorefrontVariant[];
};

export type PublicStorefrontPayload = {
  published: boolean;
  shop?: PublicStorefrontShop;
  products?: PublicStorefrontProduct[];
};
