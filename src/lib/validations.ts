import { z } from "zod";

// Auth validation schemas
export const authSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(255, "Email must be less than 255 characters"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password must be less than 128 characters"),
});

export type AuthFormData = z.infer<typeof authSchema>;

// Strong password schema for enhanced security (optional for future use)
export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be less than 128 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[a-z]/, "Must contain at least one lowercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Must contain at least one special character");

export type StrongPassword = z.infer<typeof strongPasswordSchema>;

// Validate strong password
export const validateStrongPassword = (password: string) => {
  const result = strongPasswordSchema.safeParse(password);
  if (!result.success) {
    return { success: false, errors: result.error.errors.map(e => e.message) };
  }
  return { success: true, data: result.data };
};

// Product Entry validation schemas
export const productSchema = z.object({
  product_type: z.enum(["goods", "service", "combo"]),
  product_name: z
    .string()
    .trim()
    .min(1, "Product name is required")
    .max(200, "Product name must be less than 200 characters"),
  category: z.string().max(100, "Category must be less than 100 characters").optional(),
  brand: z.string().max(100, "Brand must be less than 100 characters").optional(),
  style: z.string().max(100, "Style must be less than 100 characters").optional(),
  color: z.string().max(50, "Color must be less than 50 characters").optional(),
  size_group_id: z.string().optional(),
  hsn_code: z
    .string()
    .max(8, "HSN code must be less than 8 characters")
    .regex(/^[0-9]*$/, "HSN code must contain only numbers")
    .optional()
    .or(z.literal("")),
  gst_per: z.number().refine((val) => [0, 5, 12, 18, 28].includes(val), {
    message: "GST % must be one of: 0, 5, 12, 18, 28",
  }),
  default_pur_price: z.number({ required_error: "Purchase Price is required" }).min(0.01, "Purchase Price must be greater than 0"),
  default_sale_price: z.number({ required_error: "Sale Price is required" }).min(0.01, "Sale Price must be greater than 0"),
  default_mrp: z.number().min(0, "MRP cannot be negative").optional(),
  status: z.enum(["active", "inactive"]),
});

export type ProductFormData = z.infer<typeof productSchema>;

// Product Variant validation
export const productVariantSchema = z.object({
  size: z.string().min(1, "Size is required").max(50, "Size must be less than 50 characters"),
  pur_price: z.number().min(0, "Purchase price cannot be negative"),
  sale_price: z.number().min(0, "Sale price cannot be negative"),
  mrp: z.number().min(0, "MRP cannot be negative").nullable(),
  barcode: z.string().max(20, "Barcode must be less than 20 characters").optional(),
  active: z.boolean(),
  opening_qty: z.number().min(0, "Opening quantity cannot be negative"),
});

export type ProductVariantData = z.infer<typeof productVariantSchema>;

// Purchase Entry validation schemas
export const purchaseBillSchema = z.object({
  supplier_name: z
    .string()
    .trim()
    .min(1, "Supplier name is required")
    .max(200, "Supplier name must be less than 200 characters"),
  supplier_id: z.string().optional(),
  supplier_invoice_no: z
    .string()
    .max(50, "Invoice number must be less than 50 characters")
    .optional(),
});

export type PurchaseBillData = z.infer<typeof purchaseBillSchema>;

// Purchase Line Item validation
export const purchaseLineItemSchema = z.object({
  product_id: z.string().min(1, "Product is required"),
  sku_id: z.string().min(1, "SKU is required"),
  product_name: z.string().min(1, "Product name is required"),
  size: z.string().min(1, "Size is required"),
  qty: z.number().min(1, "Quantity must be at least 1").max(99999, "Quantity too large"),
  pur_price: z.number().min(0, "Purchase price cannot be negative"),
  sale_price: z.number().min(0, "Sale price cannot be negative"),
  gst_per: z.number().min(0).max(100, "GST must be between 0 and 100"),
  hsn_code: z.string().max(8, "HSN code must be less than 8 characters").optional(),
  barcode: z.string().max(20, "Barcode must be less than 20 characters").optional(),
  discount_percent: z.number().min(0).max(100, "Discount must be between 0 and 100"),
});

export type PurchaseLineItemData = z.infer<typeof purchaseLineItemSchema>;

// Validate auth form
export const validateAuth = (email: string, password: string) => {
  const result = authSchema.safeParse({ email, password });
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError.message };
  }
  return { success: true, data: result.data };
};

// Validate product form
export const validateProduct = (data: Partial<ProductFormData>) => {
  const result = productSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError.message };
  }
  return { success: true, data: result.data };
};

// Validate purchase bill
export const validatePurchaseBill = (data: Partial<PurchaseBillData>) => {
  const result = purchaseBillSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError.message };
  }
  return { success: true, data: result.data };
};

// Validate purchase line item
export const validatePurchaseLineItem = (data: Partial<PurchaseLineItemData>) => {
  const result = purchaseLineItemSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.errors[0];
    return { success: false, error: firstError.message };
  }
  return { success: true, data: result.data };
};
