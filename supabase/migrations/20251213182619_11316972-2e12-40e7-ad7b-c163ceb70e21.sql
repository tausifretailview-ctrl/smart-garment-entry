-- Add soft delete columns to all critical tables

-- Customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Suppliers
ALTER TABLE public.suppliers 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Employees
ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Product Variants
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Purchase Bills
ALTER TABLE public.purchase_bills 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Purchase Items
ALTER TABLE public.purchase_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Purchase Returns
ALTER TABLE public.purchase_returns 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Purchase Return Items
ALTER TABLE public.purchase_return_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sales
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sale Items
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sale Returns
ALTER TABLE public.sale_returns 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sale Return Items
ALTER TABLE public.sale_return_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sale Orders
ALTER TABLE public.sale_orders 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Sale Order Items
ALTER TABLE public.sale_order_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Quotations
ALTER TABLE public.quotations 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Quotation Items
ALTER TABLE public.quotation_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Voucher Entries
ALTER TABLE public.voucher_entries 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Voucher Items
ALTER TABLE public.voucher_items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Credit Notes
ALTER TABLE public.credit_notes 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deleted_by UUID NULL;

-- Create indexes for soft delete queries
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_at ON public.suppliers(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employees_deleted_at ON public.employees(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON public.products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_deleted_at ON public.product_variants(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_bills_deleted_at ON public.purchase_bills(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at ON public.sales(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_returns_deleted_at ON public.sale_returns(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_returns_deleted_at ON public.purchase_returns(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_orders_deleted_at ON public.sale_orders(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotations_deleted_at ON public.quotations(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voucher_entries_deleted_at ON public.voucher_entries(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_notes_deleted_at ON public.credit_notes(deleted_at) WHERE deleted_at IS NOT NULL;

-- Function to soft delete a purchase bill (without triggering stock changes)
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Soft delete the purchase items first
  UPDATE purchase_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE bill_id = p_bill_id AND deleted_at IS NULL;
  
  -- Soft delete the purchase bill
  UPDATE purchase_bills
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_bill_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a purchase bill
CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Restore the purchase bill
  UPDATE purchase_bills
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_bill_id AND deleted_at IS NOT NULL;
  
  -- Restore the purchase items
  UPDATE purchase_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE bill_id = p_bill_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a sale (without triggering stock changes)
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Soft delete the sale items first
  UPDATE sale_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE sale_id = p_sale_id AND deleted_at IS NULL;
  
  -- Soft delete the sale
  UPDATE sales
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_sale_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a sale
CREATE OR REPLACE FUNCTION public.restore_sale(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Restore the sale
  UPDATE sales
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_sale_id AND deleted_at IS NOT NULL;
  
  -- Restore the sale items
  UPDATE sale_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE sale_id = p_sale_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a sale return
CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE sale_return_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE return_id = p_return_id AND deleted_at IS NULL;
  
  UPDATE sale_returns
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_return_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a sale return
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE sale_returns
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_return_id AND deleted_at IS NOT NULL;
  
  UPDATE sale_return_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE return_id = p_return_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a purchase return
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_return(p_return_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE purchase_return_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE return_id = p_return_id AND deleted_at IS NULL;
  
  UPDATE purchase_returns
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_return_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a purchase return
CREATE OR REPLACE FUNCTION public.restore_purchase_return(p_return_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE purchase_returns
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_return_id AND deleted_at IS NOT NULL;
  
  UPDATE purchase_return_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE return_id = p_return_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a sale order
CREATE OR REPLACE FUNCTION public.soft_delete_sale_order(p_order_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE sale_order_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE order_id = p_order_id AND deleted_at IS NULL;
  
  UPDATE sale_orders
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_order_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a sale order
CREATE OR REPLACE FUNCTION public.restore_sale_order(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE sale_orders
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_order_id AND deleted_at IS NOT NULL;
  
  UPDATE sale_order_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE order_id = p_order_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a quotation
CREATE OR REPLACE FUNCTION public.soft_delete_quotation(p_quotation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotation_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE quotation_id = p_quotation_id AND deleted_at IS NULL;
  
  UPDATE quotations
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_quotation_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a quotation
CREATE OR REPLACE FUNCTION public.restore_quotation(p_quotation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE quotations
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_quotation_id AND deleted_at IS NOT NULL;
  
  UPDATE quotation_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE quotation_id = p_quotation_id AND deleted_at IS NOT NULL;
END;
$function$;

-- Function to soft delete a voucher entry
CREATE OR REPLACE FUNCTION public.soft_delete_voucher(p_voucher_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE voucher_items
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE voucher_id = p_voucher_id AND deleted_at IS NULL;
  
  UPDATE voucher_entries
  SET deleted_at = NOW(), deleted_by = p_user_id
  WHERE id = p_voucher_id AND deleted_at IS NULL;
END;
$function$;

-- Function to restore a voucher entry
CREATE OR REPLACE FUNCTION public.restore_voucher(p_voucher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE voucher_entries
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_voucher_id AND deleted_at IS NOT NULL;
  
  UPDATE voucher_items
  SET deleted_at = NULL, deleted_by = NULL
  WHERE voucher_id = p_voucher_id AND deleted_at IS NOT NULL;
END;
$function$;