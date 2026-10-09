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
  section_id?: string | null;
  /** Website-only name; null shows the ERP product name. */
  display_name?: string | null;
  /** Shown on the store's product page. */
  description?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type WebsiteEnquiryStatus = "new" | "contacted" | "converted" | "closed";

export type WebsiteEnquiryBookedPiece = {
  variant_id?: string | null;
  product_id?: string | null;
  size?: string | null;
  barcode?: string | null;
};

export type WebsiteEnquiry = {
  id: string;
  organization_id: string;
  product_id: string | null;
  /** Set once the storefront enquiry records the booked variant. */
  variant_id?: string | null;
  size?: string | null;
  barcode?: string | null;
  booked_pieces?: WebsiteEnquiryBookedPiece[] | null;
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
  /** ERP product name when a website name replaced `name`. */
  erp_name?: string | null;
  description?: string | null;
  brand: string | null;
  category: string | null;
  display_order: number;
  display_price: number | null;
  photo_urls: string[];
  stock_status: WebsiteStockStatus;
  stock_left: number | null;
  variants: PublicStorefrontVariant[];
  section_id?: string | null;
  section_slug?: string | null;
  section_label?: string | null;
};

export type PublicStorefrontMenu = {
  id: string;
  label: string;
  category_filter: string | null;
  display_order: number;
  children?: PublicStorefrontMenu[];
};

export type PublicStorefrontMenuFlat = PublicStorefrontMenu & {
  parent_id: string | null;
};

export type WebsiteMenu = {
  id: string;
  organization_id: string;
  parent_id: string | null;
  label: string;
  category_filter: string | null;
  display_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PublicStorefrontPayload = {
  published: boolean;
  shop?: PublicStorefrontShop;
  products?: PublicStorefrontProduct[];
  menus?: PublicStorefrontMenuFlat[];
  sections?: {
    id: string;
    slug: string;
    label: string;
    display_order: number;
  }[];
};
