export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_ledgers: {
        Row: {
          account_name: string
          account_type: string
          created_at: string | null
          current_balance: number | null
          id: string
          opening_balance: number | null
          organization_id: string | null
          parent_account_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_type: string
          created_at?: string | null
          current_balance?: number | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          parent_account_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_type?: string
          created_at?: string | null
          current_balance?: number | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          parent_account_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_ledgers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_ledgers_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "account_ledgers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      barcode_label_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_default: boolean | null
          organization_id: string
          setting_data: Json
          setting_name: string
          setting_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          organization_id: string
          setting_data?: Json
          setting_name: string
          setting_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_default?: boolean | null
          organization_id?: string
          setting_data?: Json
          setting_name?: string
          setting_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barcode_label_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      barcode_sequence: {
        Row: {
          id: number
          next_barcode: number
          organization_id: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          next_barcode?: number
          organization_id?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          next_barcode?: number
          organization_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barcode_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_stock: {
        Row: {
          bill_number: string
          created_at: string | null
          id: string
          organization_id: string
          purchase_bill_id: string | null
          purchase_date: string
          quantity: number
          updated_at: string | null
          variant_id: string
        }
        Insert: {
          bill_number: string
          created_at?: string | null
          id?: string
          organization_id: string
          purchase_bill_id?: string | null
          purchase_date: string
          quantity?: number
          updated_at?: string | null
          variant_id: string
        }
        Update: {
          bill_number?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          purchase_bill_id?: string | null
          purchase_date?: string
          quantity?: number
          updated_at?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_stock_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_stock_purchase_bill_id_fkey"
            columns: ["purchase_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_stock_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_number_sequence: {
        Row: {
          id: number
          month: number
          next_sequence: number
          organization_id: string | null
          updated_at: string | null
          year: number
        }
        Insert: {
          id?: number
          month: number
          next_sequence?: number
          organization_id?: string | null
          updated_at?: string | null
          year: number
        }
        Update: {
          id?: number
          month?: number
          next_sequence?: number
          organization_id?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_number_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string | null
          customer_name: string
          email: string | null
          gst_number: string | null
          id: string
          opening_balance: number | null
          organization_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          customer_name: string
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          customer_name?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_tracking: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          narration: string | null
          organization_id: string
          sale_id: string
          status: string
          status_date: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          narration?: string | null
          organization_id: string
          sale_id: string
          status: string
          status_date?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          narration?: string | null
          organization_id?: string
          sale_id?: string
          status?: string
          status_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_tracking_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          created_at: string | null
          designation: string | null
          email: string | null
          employee_name: string
          id: string
          joining_date: string | null
          organization_id: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          designation?: string | null
          email?: string | null
          employee_name: string
          id?: string
          joining_date?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          designation?: string | null
          email?: string | null
          employee_name?: string
          id?: string
          joining_date?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempt_type: string
          attempts: number | null
          created_at: string | null
          id: string
          identifier: string
          last_attempt_at: string | null
          locked_until: string | null
        }
        Insert: {
          attempt_type: string
          attempts?: number | null
          created_at?: string | null
          id?: string
          identifier: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Update: {
          attempt_type?: string
          attempts?: number | null
          created_at?: string | null
          id?: string
          identifier?: string
          last_attempt_at?: string | null
          locked_until?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          enabled_features: Json
          id: string
          name: string
          organization_number: number | null
          settings: Json
          slug: string
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_features?: Json
          id?: string
          name: string
          organization_number?: number | null
          settings?: Json
          slug: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_features?: Json
          id?: string
          name?: string
          organization_number?: number | null
          settings?: Json
          slug?: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean | null
          barcode: string | null
          created_at: string | null
          id: string
          opening_qty: number | null
          organization_id: string
          product_id: string
          pur_price: number | null
          sale_price: number | null
          size: string
          stock_qty: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          barcode?: string | null
          created_at?: string | null
          id?: string
          opening_qty?: number | null
          organization_id: string
          product_id: string
          pur_price?: number | null
          sale_price?: number | null
          size: string
          stock_qty?: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          barcode?: string | null
          created_at?: string | null
          id?: string
          opening_qty?: number | null
          organization_id?: string
          product_id?: string
          pur_price?: number | null
          sale_price?: number | null
          size?: string
          stock_qty?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          color: string | null
          created_at: string | null
          default_pur_price: number | null
          default_sale_price: number | null
          gst_per: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          organization_id: string | null
          product_name: string
          size_group_id: string | null
          status: string | null
          style: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_pur_price?: number | null
          default_sale_price?: number | null
          gst_per?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          organization_id?: string | null
          product_name: string
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_pur_price?: number | null
          default_sale_price?: number | null
          gst_per?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          organization_id?: string | null
          product_name?: string
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_size_group_id_fkey"
            columns: ["size_group_id"]
            isOneToOne: false
            referencedRelation: "size_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          bill_date: string
          created_at: string
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string | null
          paid_amount: number | null
          payment_status: string | null
          round_off: number | null
          software_bill_no: string | null
          supplier_id: string | null
          supplier_invoice_no: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          bill_date?: string
          created_at?: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          round_off?: number | null
          software_bill_no?: string | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          bill_date?: string
          created_at?: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          round_off?: number | null
          software_bill_no?: string | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          barcode: string | null
          bill_id: string
          bill_number: string | null
          brand: string | null
          category: string | null
          color: string | null
          created_at: string
          gst_per: number
          hsn_code: string | null
          id: string
          line_total: number
          product_id: string
          product_name: string | null
          pur_price: number
          qty: number
          sale_price: number
          size: string
          sku_id: string | null
          style: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          bill_id: string
          bill_number?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          product_id: string
          product_name?: string | null
          pur_price?: number
          qty?: number
          sale_price?: number
          size: string
          sku_id?: string | null
          style?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          bill_id?: string
          bill_number?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          product_id?: string
          product_name?: string | null
          pur_price?: number
          qty?: number
          sale_price?: number
          size?: string
          sku_id?: string | null
          style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          barcode: string | null
          created_at: string
          gst_per: number
          hsn_code: string | null
          id: string
          line_total: number
          product_id: string
          pur_price: number
          qty: number
          return_id: string
          size: string
          sku_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          gst_per: number
          hsn_code?: string | null
          id?: string
          line_total: number
          product_id: string
          pur_price: number
          qty: number
          return_id: string
          size: string
          sku_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          product_id?: string
          pur_price?: number
          qty?: number
          return_id?: string
          size?: string
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string
          original_bill_number: string | null
          return_date: string
          supplier_id: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id: string
          original_bill_number?: string | null
          return_date?: string
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string
          original_bill_number?: string | null
          return_date?: string
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          barcode: string | null
          created_at: string
          discount_percent: number
          gst_percent: number
          id: string
          line_total: number
          mrp: number
          product_id: string
          product_name: string
          quantity: number
          quotation_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          line_total: number
          mrp: number
          product_id: string
          product_name: string
          quantity: number
          quotation_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          line_total?: number
          mrp?: number
          product_id?: string
          product_name?: string
          quantity?: number
          quotation_id?: string
          size?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string
          quotation_date: string
          quotation_number: string
          round_off: number
          shipping_address: string | null
          status: string
          tax_type: string | null
          terms_conditions: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id: string
          quotation_date?: string
          quotation_number: string
          round_off?: number
          shipping_address?: string | null
          status?: string
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string
          quotation_date?: string
          quotation_number?: string
          round_off?: number
          shipping_address?: string | null
          status?: string
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          barcode: string | null
          created_at: string
          discount_percent: number
          gst_percent: number
          id: string
          line_total: number
          mrp: number
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          line_total: number
          mrp: number
          product_id: string
          product_name: string
          quantity: number
          sale_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          gst_percent?: number
          id?: string
          line_total?: number
          mrp?: number
          product_id?: string
          product_name?: string
          quantity?: number
          sale_id?: string
          size?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_order_items: {
        Row: {
          barcode: string | null
          created_at: string
          discount_percent: number
          fulfilled_qty: number
          gst_percent: number
          id: string
          line_total: number
          mrp: number
          order_id: string
          order_qty: number
          pending_qty: number
          product_id: string
          product_name: string
          size: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          id?: string
          line_total: number
          mrp: number
          order_id: string
          order_qty: number
          pending_qty: number
          product_id: string
          product_name: string
          size: string
          unit_price: number
          variant_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          id?: string
          line_total?: number
          mrp?: number
          order_id?: string
          order_qty?: number
          pending_qty?: number
          product_id?: string
          product_name?: string
          size?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_orders: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          discount_amount: number
          expected_delivery_date: string | null
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          quotation_id: string | null
          round_off: number
          shipping_address: string | null
          status: string
          tax_type: string | null
          terms_conditions: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          quotation_id?: string | null
          round_off?: number
          shipping_address?: string | null
          status?: string
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          quotation_id?: string | null
          round_off?: number
          shipping_address?: string | null
          status?: string
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_return_items: {
        Row: {
          barcode: string | null
          created_at: string
          gst_percent: number
          id: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          return_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          gst_percent: number
          id?: string
          line_total: number
          product_id: string
          product_name: string
          quantity: number
          return_id: string
          size: string
          unit_price: number
          variant_id: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          gst_percent?: number
          id?: string
          line_total?: number
          product_id?: string
          product_name?: string
          quantity?: number
          return_id?: string
          size?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sale_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string
          original_sale_number: string | null
          return_date: string
          return_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id: string
          original_sale_number?: string | null
          return_date?: string
          return_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string
          original_sale_number?: string | null
          return_date?: string
          return_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          card_amount: number | null
          cash_amount: number | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          delivery_status: string | null
          discount_amount: number
          due_date: string | null
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          id: string
          invoice_type: string | null
          net_amount: number
          notes: string | null
          organization_id: string | null
          paid_amount: number | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          payment_term: string | null
          refund_amount: number | null
          round_off: number
          sale_date: string
          sale_number: string
          sale_return_adjust: number | null
          sale_type: string
          shipping_address: string | null
          shipping_instructions: string | null
          terms_conditions: string | null
          updated_at: string
          upi_amount: number | null
        }
        Insert: {
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_status?: string | null
          discount_amount?: number
          due_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method: string
          payment_status?: string
          payment_term?: string | null
          refund_amount?: number | null
          round_off?: number
          sale_date?: string
          sale_number: string
          sale_return_adjust?: number | null
          sale_type: string
          shipping_address?: string | null
          shipping_instructions?: string | null
          terms_conditions?: string | null
          updated_at?: string
          upi_amount?: number | null
        }
        Update: {
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          delivery_status?: string | null
          discount_amount?: number
          due_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          payment_term?: string | null
          refund_amount?: number | null
          round_off?: number
          sale_date?: string
          sale_number?: string
          sale_return_adjust?: number | null
          sale_type?: string
          shipping_address?: string | null
          shipping_instructions?: string | null
          terms_conditions?: string | null
          updated_at?: string
          upi_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          bill_barcode_settings: Json | null
          business_name: string | null
          created_at: string | null
          dashboard_settings: Json | null
          email_id: string | null
          gst_number: string | null
          id: string
          mobile_number: string | null
          organization_id: string | null
          product_settings: Json | null
          purchase_settings: Json | null
          report_settings: Json | null
          sale_settings: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          bill_barcode_settings?: Json | null
          business_name?: string | null
          created_at?: string | null
          dashboard_settings?: Json | null
          email_id?: string | null
          gst_number?: string | null
          id?: string
          mobile_number?: string | null
          organization_id?: string | null
          product_settings?: Json | null
          purchase_settings?: Json | null
          report_settings?: Json | null
          sale_settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          bill_barcode_settings?: Json | null
          business_name?: string | null
          created_at?: string | null
          dashboard_settings?: Json | null
          email_id?: string | null
          gst_number?: string | null
          id?: string
          mobile_number?: string | null
          organization_id?: string | null
          product_settings?: Json | null
          purchase_settings?: Json | null
          report_settings?: Json | null
          sale_settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      size_groups: {
        Row: {
          created_at: string | null
          group_name: string
          id: string
          organization_id: string
          sizes: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_name: string
          id?: string
          organization_id: string
          sizes?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_name?: string
          id?: string
          organization_id?: string
          sizes?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "size_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          bill_number: string | null
          created_at: string
          id: string
          movement_type: string
          notes: string | null
          organization_id: string
          quantity: number
          reference_id: string | null
          variant_id: string
        }
        Insert: {
          bill_number?: string | null
          created_at?: string
          id?: string
          movement_type: string
          notes?: string | null
          organization_id: string
          quantity: number
          reference_id?: string | null
          variant_id: string
        }
        Update: {
          bill_number?: string | null
          created_at?: string
          id?: string
          movement_type?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          reference_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string | null
          email: string | null
          gst_number: string | null
          id: string
          opening_balance: number | null
          organization_id: string | null
          phone: string | null
          supplier_code: string | null
          supplier_name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          supplier_code?: string | null
          supplier_name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string | null
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          supplier_code?: string | null
          supplier_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          permissions: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          permissions?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          permissions?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          organization_id: string | null
          reference_id: string | null
          reference_type: string | null
          total_amount: number
          updated_at: string | null
          voucher_date: string
          voucher_number: string
          voucher_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          total_amount?: number
          updated_at?: string | null
          voucher_date?: string
          voucher_number: string
          voucher_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          total_amount?: number
          updated_at?: string | null
          voucher_date?: string
          voucher_number?: string
          voucher_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_items: {
        Row: {
          account_id: string
          created_at: string | null
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          id: string
          voucher_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          voucher_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_ledgers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_items_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "voucher_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          message_template: string
          organization_id: string
          template_name: string
          template_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message_template: string
          organization_id: string
          template_name: string
          template_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          message_template?: string
          organization_id?: string
          template_name?: string
          template_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      create_organization: {
        Args: { p_name: string; p_user_id?: string }
        Returns: Json
      }
      generate_next_barcode: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_pos_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_purchase_bill_number: {
        Args: { p_date?: string; p_organization_id?: string }
        Returns: string
      }
      generate_quotation_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_sale_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_sale_order_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_sale_return_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_voucher_number: {
        Args: { p_date?: string; p_type: string }
        Returns: string
      }
      get_user_organization_ids: {
        Args: { user_id: string }
        Returns: string[]
      }
      has_org_role: {
        Args: {
          org_id: string
          required_role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_new_values?: Json
          p_old_values?: Json
        }
        Returns: string
      }
      platform_assign_user_to_org: {
        Args: {
          p_org_id: string
          p_role?: Database["public"]["Enums"]["app_role"]
          p_user_email: string
        }
        Returns: Json
      }
      platform_create_organization: {
        Args: {
          p_admin_email?: string
          p_enabled_features?: string[]
          p_name: string
        }
        Returns: Json
      }
      record_login_attempt: {
        Args: {
          p_attempt_type: string
          p_identifier: string
          p_success?: boolean
        }
        Returns: Json
      }
      user_belongs_to_org: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user" | "platform_admin"
      subscription_tier: "free" | "basic" | "professional" | "enterprise"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "user", "platform_admin"],
      subscription_tier: ["free", "basic", "professional", "enterprise"],
    },
  },
} as const
