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
      backup_logs: {
        Row: {
          backup_type: string
          completed_at: string | null
          created_at: string
          drive_file_id: string | null
          drive_file_link: string | null
          error_message: string | null
          file_name: string | null
          file_size: number | null
          id: string
          organization_id: string
          records_count: Json | null
          started_at: string
          status: string
          tables_included: string[] | null
        }
        Insert: {
          backup_type: string
          completed_at?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_file_link?: string | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          organization_id: string
          records_count?: Json | null
          started_at?: string
          status: string
          tables_included?: string[] | null
        }
        Update: {
          backup_type?: string
          completed_at?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_file_link?: string | null
          error_message?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          organization_id?: string
          records_count?: Json | null
          started_at?: string
          status?: string
          tables_included?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      cheque_formats: {
        Row: {
          account_number: string | null
          amount_left_mm: number
          amount_top_mm: number
          bank_name: string
          cheque_height_mm: number
          cheque_width_mm: number
          created_at: string | null
          date_format: string
          date_left_mm: number
          date_spacing_mm: number
          date_top_mm: number
          font_size_pt: number
          id: string
          is_default: boolean
          name_left_mm: number
          name_top_mm: number
          name_width_mm: number
          organization_id: string
          show_ac_payee: boolean
          updated_at: string | null
          words_left_mm: number
          words_line2_offset_mm: number
          words_top_mm: number
        }
        Insert: {
          account_number?: string | null
          amount_left_mm?: number
          amount_top_mm?: number
          bank_name: string
          cheque_height_mm?: number
          cheque_width_mm?: number
          created_at?: string | null
          date_format?: string
          date_left_mm?: number
          date_spacing_mm?: number
          date_top_mm?: number
          font_size_pt?: number
          id?: string
          is_default?: boolean
          name_left_mm?: number
          name_top_mm?: number
          name_width_mm?: number
          organization_id: string
          show_ac_payee?: boolean
          updated_at?: string | null
          words_left_mm?: number
          words_line2_offset_mm?: number
          words_top_mm?: number
        }
        Update: {
          account_number?: string | null
          amount_left_mm?: number
          amount_top_mm?: number
          bank_name?: string
          cheque_height_mm?: number
          cheque_width_mm?: number
          created_at?: string | null
          date_format?: string
          date_left_mm?: number
          date_spacing_mm?: number
          date_top_mm?: number
          font_size_pt?: number
          id?: string
          is_default?: boolean
          name_left_mm?: number
          name_top_mm?: number
          name_width_mm?: number
          organization_id?: string
          show_ac_payee?: boolean
          updated_at?: string | null
          words_left_mm?: number
          words_line2_offset_mm?: number
          words_top_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "cheque_formats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_amount: number
          credit_note_number: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted_at: string | null
          deleted_by: string | null
          expiry_date: string | null
          id: string
          issue_date: string | null
          notes: string | null
          organization_id: string
          sale_id: string | null
          status: string
          updated_at: string | null
          used_amount: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number
          credit_note_number: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          organization_id: string
          sale_id?: string | null
          status?: string
          updated_at?: string | null
          used_amount?: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number
          credit_note_number?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          expiry_date?: string | null
          id?: string
          issue_date?: string | null
          notes?: string | null
          organization_id?: string
          sale_id?: string | null
          status?: string
          updated_at?: string | null
          used_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_brand_discounts: {
        Row: {
          brand: string
          created_at: string | null
          customer_id: string
          discount_percent: number
          id: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          brand: string
          created_at?: string | null
          customer_id: string
          discount_percent?: number
          id?: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          brand?: string
          created_at?: string | null
          customer_id?: string
          discount_percent?: number
          id?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_brand_discounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_brand_discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_points_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          invoice_amount: number | null
          organization_id: string
          points: number
          sale_id: string | null
          transaction_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          invoice_amount?: number | null
          organization_id: string
          points?: number
          sale_id?: string | null
          transaction_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          invoice_amount?: number | null
          organization_id?: string
          points?: number
          sale_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_points_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_history_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string | null
          customer_name: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number | null
          email: string | null
          gst_number: string | null
          id: string
          opening_balance: number | null
          organization_id: string | null
          phone: string | null
          points_balance: number | null
          points_redeemed: number | null
          total_points_earned: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          customer_name: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number | null
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          points_balance?: number | null
          points_redeemed?: number | null
          total_points_earned?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          customer_name?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number | null
          email?: string | null
          gst_number?: string | null
          id?: string
          opening_balance?: number | null
          organization_id?: string | null
          phone?: string | null
          points_balance?: number | null
          points_redeemed?: number | null
          total_points_earned?: number | null
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
      delivery_challan_items: {
        Row: {
          barcode: string | null
          challan_id: string
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number
          hsn_code: string | null
          id: string
          line_total: number
          mrp: number
          product_id: string
          product_name: string
          quantity: number
          size: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          challan_id: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          mrp?: number
          product_id: string
          product_name: string
          quantity?: number
          size: string
          unit_price?: number
          variant_id: string
        }
        Update: {
          barcode?: string | null
          challan_id?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          mrp?: number
          product_id?: string
          product_name?: string
          quantity?: number
          size?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challan_items_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challan_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challan_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_challans: {
        Row: {
          challan_date: string
          challan_number: string
          converted_to_invoice_id: string | null
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string
          round_off: number
          sale_order_id: string | null
          salesman: string | null
          shipping_address: string | null
          status: string
          terms_conditions: string | null
          updated_at: string
        }
        Insert: {
          challan_date?: string
          challan_number: string
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id: string
          round_off?: number
          sale_order_id?: string | null
          salesman?: string | null
          shipping_address?: string | null
          status?: string
          terms_conditions?: string | null
          updated_at?: string
        }
        Update: {
          challan_date?: string
          challan_number?: string
          converted_to_invoice_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string
          round_off?: number
          sale_order_id?: string | null
          salesman?: string | null
          shipping_address?: string | null
          status?: string
          terms_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_challans_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_challans_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
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
      drafts: {
        Row: {
          created_at: string
          created_by: string | null
          draft_data: Json
          draft_type: string
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft_data?: Json
          draft_type: string
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft_data?: Json
          draft_type?: string
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          designation: string | null
          email: string | null
          employee_name: string
          field_sales_access: boolean | null
          id: string
          joining_date: string | null
          organization_id: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          designation?: string | null
          email?: string | null
          employee_name: string
          field_sales_access?: boolean | null
          id?: string
          joining_date?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          designation?: string | null
          email?: string | null
          employee_name?: string
          field_sales_access?: boolean | null
          id?: string
          joining_date?: string | null
          organization_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
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
      expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_redemptions: {
        Row: {
          customer_id: string
          gift_reward_id: string
          id: string
          notes: string | null
          organization_id: string
          points_used: number
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          customer_id: string
          gift_reward_id: string
          id?: string
          notes?: string | null
          organization_id: string
          points_used: number
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          customer_id?: string
          gift_reward_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          points_used?: number
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_redemptions_gift_reward_id_fkey"
            columns: ["gift_reward_id"]
            isOneToOne: false
            referencedRelation: "gift_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_rewards: {
        Row: {
          created_at: string | null
          description: string | null
          gift_name: string
          id: string
          is_active: boolean
          organization_id: string
          points_required: number
          stock_qty: number
          updated_at: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          gift_name: string
          id?: string
          is_active?: boolean
          organization_id: string
          points_required?: number
          stock_qty?: number
          updated_at?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          gift_name?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          points_required?: number
          stock_qty?: number
          updated_at?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_templates: {
        Row: {
          created_at: string | null
          excel_headers: string[] | null
          field_mappings: Json
          id: string
          import_type: string
          organization_id: string
          template_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          excel_headers?: string[] | null
          field_mappings?: Json
          id?: string
          import_type: string
          organization_id: string
          template_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          excel_headers?: string[] | null
          field_mappings?: Json
          id?: string
          import_type?: string
          organization_id?: string
          template_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_invoices: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string | null
          customer_name: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          organization_id: string
          payment_status: string
          phone: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string | null
          customer_id?: string | null
          customer_name: string
          id?: string
          invoice_date: string
          invoice_number: string
          notes?: string | null
          organization_id: string
          payment_status?: string
          phone?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          organization_id?: string
          payment_status?: string
          phone?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legacy_invoices_organization_id_fkey"
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
      organization_label_templates_backup: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_default: boolean | null
          organization_id: string
          organization_name: string
          template_config: Json
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          organization_id: string
          organization_name: string
          template_config: Json
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          organization_id?: string
          organization_name?: string
          template_config?: Json
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_label_templates_backup_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      payment_gateway_settings: {
        Row: {
          active_gateway: string
          created_at: string | null
          id: string
          organization_id: string
          phonepe_enabled: boolean | null
          phonepe_merchant_id: string | null
          razorpay_enabled: boolean | null
          razorpay_key_id: string | null
          updated_at: string | null
          upi_business_name: string | null
          upi_id: string | null
        }
        Insert: {
          active_gateway?: string
          created_at?: string | null
          id?: string
          organization_id: string
          phonepe_enabled?: boolean | null
          phonepe_merchant_id?: string | null
          razorpay_enabled?: boolean | null
          razorpay_key_id?: string | null
          updated_at?: string | null
          upi_business_name?: string | null
          upi_id?: string | null
        }
        Update: {
          active_gateway?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          phonepe_enabled?: boolean | null
          phonepe_merchant_id?: string | null
          razorpay_enabled?: boolean | null
          razorpay_key_id?: string | null
          updated_at?: string | null
          upi_business_name?: string | null
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          gateway: string
          gateway_link_id: string | null
          gateway_payment_id: string | null
          id: string
          invoice_number: string | null
          legacy_invoice_id: string | null
          organization_id: string
          paid_at: string | null
          payment_url: string | null
          sale_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          gateway: string
          gateway_link_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          invoice_number?: string | null
          legacy_invoice_id?: string | null
          organization_id: string
          paid_at?: string | null
          payment_url?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          gateway?: string
          gateway_link_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          invoice_number?: string | null
          legacy_invoice_id?: string | null
          organization_id?: string
          paid_at?: string | null
          payment_url?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_legacy_invoice_id_fkey"
            columns: ["legacy_invoice_id"]
            isOneToOne: false
            referencedRelation: "legacy_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          active: boolean | null
          barcode: string | null
          color: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          last_purchase_date: string | null
          last_purchase_mrp: number | null
          last_purchase_pur_price: number | null
          last_purchase_sale_price: number | null
          mrp: number | null
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
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_purchase_date?: string | null
          last_purchase_mrp?: number | null
          last_purchase_pur_price?: number | null
          last_purchase_sale_price?: number | null
          mrp?: number | null
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
          color?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          last_purchase_date?: string | null
          last_purchase_mrp?: number | null
          last_purchase_pur_price?: number | null
          last_purchase_sale_price?: number | null
          mrp?: number | null
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
          deleted_at: string | null
          deleted_by: string | null
          gst_per: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          organization_id: string | null
          product_name: string
          product_type: string
          size_group_id: string | null
          status: string | null
          style: string | null
          uom: string
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_pur_price?: number | null
          default_sale_price?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          gst_per?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          organization_id?: string | null
          product_name: string
          product_type?: string
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          uom?: string
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          default_pur_price?: number | null
          default_sale_price?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          gst_per?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          organization_id?: string | null
          product_name?: string
          product_type?: string
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          uom?: string
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
          deleted_at: string | null
          deleted_by: string | null
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          organization_id: string | null
          other_charges: number | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          other_charges?: number | null
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
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          other_charges?: number | null
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
          barcode_printed: boolean | null
          bill_id: string
          bill_number: string | null
          brand: string | null
          category: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          gst_per: number
          hsn_code: string | null
          id: string
          line_total: number
          mrp: number | null
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
          barcode_printed?: boolean | null
          bill_id: string
          bill_number?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          mrp?: number | null
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
          barcode_printed?: boolean | null
          bill_id?: string
          bill_number?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          mrp?: number | null
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
      purchase_order_items: {
        Row: {
          barcode: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number
          fulfilled_qty: number
          gst_percent: number
          hsn_code: string | null
          id: string
          line_total: number
          order_id: string
          order_qty: number
          pending_qty: number
          product_id: string
          product_name: string
          size: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          line_total: number
          order_id: string
          order_qty: number
          pending_qty: number
          product_id: string
          product_name: string
          size: string
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          order_id?: string
          order_qty?: number
          pending_qty?: number
          product_id?: string
          product_name?: string
          size?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number
          expected_delivery_date: string | null
          gross_amount: number
          gst_amount: number
          id: string
          net_amount: number
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          other_charges: number
          round_off: number
          status: string
          supplier_address: string | null
          supplier_email: string | null
          supplier_gst: string | null
          supplier_id: string | null
          supplier_name: string
          supplier_phone: string | null
          tax_type: string | null
          terms_conditions: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          other_charges?: number
          round_off?: number
          status?: string
          supplier_address?: string | null
          supplier_email?: string | null
          supplier_gst?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_phone?: string | null
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          other_charges?: number
          round_off?: number
          status?: string
          supplier_address?: string | null
          supplier_email?: string | null
          supplier_gst?: string | null
          supplier_id?: string | null
          supplier_name?: string
          supplier_phone?: string | null
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          barcode: string | null
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
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
          credit_note_id: string | null
          credit_status: string | null
          deleted_at: string | null
          deleted_by: string | null
          gross_amount: number
          gst_amount: number
          id: string
          linked_bill_id: string | null
          net_amount: number
          notes: string | null
          organization_id: string
          original_bill_number: string | null
          return_date: string
          return_number: string | null
          supplier_id: string | null
          supplier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_note_id?: string | null
          credit_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          linked_bill_id?: string | null
          net_amount?: number
          notes?: string | null
          organization_id: string
          original_bill_number?: string | null
          return_date?: string
          return_number?: string | null
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_note_id?: string | null
          credit_status?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          linked_bill_id?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string
          original_bill_number?: string | null
          return_date?: string
          return_number?: string | null
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "voucher_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_linked_bill_id_fkey"
            columns: ["linked_bill_id"]
            isOneToOne: false
            referencedRelation: "purchase_bills"
            referencedColumns: ["id"]
          },
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
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number
          gst_percent: number
          hsn_code: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          gst_percent?: number
          hsn_code?: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          gst_percent?: number
          hsn_code?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
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
          salesman: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          salesman?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          salesman?: string | null
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
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number
          gst_percent: number
          hsn_code: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          gst_percent?: number
          hsn_code?: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          gst_percent?: number
          hsn_code?: string | null
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
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_percent: number
          fulfilled_qty: number
          gst_percent: number
          hsn_code: string | null
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
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          hsn_code?: string | null
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
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_percent?: number
          fulfilled_qty?: number
          gst_percent?: number
          hsn_code?: string | null
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
          variant_id?: string | null
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
          customer_accepted: boolean | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number
          expected_delivery_date: string | null
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          gst_amount: number
          id: string
          invoice_format: string | null
          net_amount: number
          notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          quotation_id: string | null
          round_off: number
          salesman: string | null
          shipping_address: string | null
          status: string
          tax_type: string | null
          terms_conditions: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_accepted?: boolean | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          invoice_format?: string | null
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          quotation_id?: string | null
          round_off?: number
          salesman?: string | null
          shipping_address?: string | null
          status?: string
          tax_type?: string | null
          terms_conditions?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_accepted?: boolean | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          gst_amount?: number
          id?: string
          invoice_format?: string | null
          net_amount?: number
          notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          quotation_id?: string | null
          round_off?: number
          salesman?: string | null
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
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          gst_percent: number
          hsn_code: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          gst_percent: number
          hsn_code?: string | null
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
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          gst_percent?: number
          hsn_code?: string | null
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
          credit_note_id: string | null
          credit_status: string | null
          customer_id: string | null
          customer_name: string
          deleted_at: string | null
          deleted_by: string | null
          gross_amount: number
          gst_amount: number
          id: string
          linked_sale_id: string | null
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
          credit_note_id?: string | null
          credit_status?: string | null
          customer_id?: string | null
          customer_name: string
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          linked_sale_id?: string | null
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
          credit_note_id?: string | null
          credit_status?: string | null
          customer_id?: string | null
          customer_name?: string
          deleted_at?: string | null
          deleted_by?: string | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          linked_sale_id?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string
          original_sale_number?: string | null
          return_date?: string
          return_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "voucher_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_linked_sale_id_fkey"
            columns: ["linked_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          card_amount: number | null
          cash_amount: number | null
          created_at: string
          created_by: string | null
          credit_applied: number | null
          credit_note_amount: number | null
          credit_note_id: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_status: string | null
          discount_amount: number
          due_date: string | null
          einvoice_error: string | null
          einvoice_qr_code: string | null
          einvoice_status: string | null
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          id: string
          invoice_type: string | null
          irn: string | null
          net_amount: number
          notes: string | null
          organization_id: string | null
          paid_amount: number | null
          payment_date: string | null
          payment_method: string
          payment_status: string
          payment_term: string | null
          points_redeemed_amount: number | null
          refund_amount: number | null
          round_off: number
          sale_date: string
          sale_number: string
          sale_return_adjust: number | null
          sale_type: string
          salesman: string | null
          shipping_address: string | null
          shipping_instructions: string | null
          signed_invoice: string | null
          signed_qr_code: string | null
          terms_conditions: string | null
          updated_at: string
          upi_amount: number | null
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          credit_applied?: number | null
          credit_note_amount?: number | null
          credit_note_id?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_status?: string | null
          discount_amount?: number
          due_date?: string | null
          einvoice_error?: string | null
          einvoice_qr_code?: string | null
          einvoice_status?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          irn?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method: string
          payment_status?: string
          payment_term?: string | null
          points_redeemed_amount?: number | null
          refund_amount?: number | null
          round_off?: number
          sale_date?: string
          sale_number: string
          sale_return_adjust?: number | null
          sale_type: string
          salesman?: string | null
          shipping_address?: string | null
          shipping_instructions?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          terms_conditions?: string | null
          updated_at?: string
          upi_amount?: number | null
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          credit_applied?: number | null
          credit_note_amount?: number | null
          credit_note_id?: string | null
          customer_address?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_status?: string | null
          discount_amount?: number
          due_date?: string | null
          einvoice_error?: string | null
          einvoice_qr_code?: string | null
          einvoice_status?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          irn?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          payment_term?: string | null
          points_redeemed_amount?: number | null
          refund_amount?: number | null
          round_off?: number
          sale_date?: string
          sale_number?: string
          sale_return_adjust?: number | null
          sale_type?: string
          salesman?: string | null
          shipping_address?: string | null
          shipping_instructions?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          terms_conditions?: string | null
          updated_at?: string
          upi_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
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
      sms_logs: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          message: string
          organization_id: string
          phone_number: string
          provider_response: Json | null
          reference_id: string | null
          reference_type: string | null
          status: string
          template_type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message: string
          organization_id: string
          phone_number: string
          provider_response?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          template_type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string
          organization_id?: string
          phone_number?: string
          provider_response?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          template_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_settings: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          provider: string
          sender_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          provider?: string
          sender_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          provider?: string
          sender_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          created_at: string | null
          dlt_template_id: string | null
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
          dlt_template_id?: string | null
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
          dlt_template_id?: string | null
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
            foreignKeyName: "sms_templates_organization_id_fkey"
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
          deleted_at: string | null
          deleted_by: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          deleted_at?: string | null
          deleted_by?: string | null
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
          category: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          discount_amount: number | null
          discount_reason: string | null
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
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
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
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_reason?: string | null
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
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          voucher_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          voucher_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
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
      whatsapp_api_settings: {
        Row: {
          access_token: string | null
          auto_send_invoice: boolean
          auto_send_invoice_link: boolean | null
          auto_send_payment_reminder: boolean
          auto_send_quotation: boolean
          auto_send_sale_order: boolean
          business_hours_enabled: boolean | null
          business_hours_end: string | null
          business_hours_start: string | null
          business_name: string | null
          button_followup_message: string | null
          chatbot_enabled: boolean | null
          chatbot_greeting: string | null
          chatbot_system_prompt: string | null
          created_at: string
          followup_chat_message: string | null
          followup_invoice_message: string | null
          followup_menu_message: string | null
          followup_review_message: string | null
          followup_social_message: string | null
          handoff_keywords: string[] | null
          id: string
          invoice_document_template_name: string | null
          invoice_document_template_params: Json | null
          invoice_link_message: string | null
          invoice_pdf_template: string | null
          invoice_template_name: string | null
          invoice_template_params: Json | null
          is_active: boolean
          organization_id: string
          outside_hours_message: string | null
          payment_reminder_template_name: string | null
          payment_reminder_template_params: Json | null
          phone_number_id: string | null
          provider: string
          quotation_template_name: string | null
          quotation_template_params: Json | null
          sale_order_template_name: string | null
          sale_order_template_params: Json | null
          selected_invoice_template_id: string | null
          selected_payment_reminder_template_id: string | null
          selected_quotation_template_id: string | null
          selected_sale_order_template_id: string | null
          send_followup_on_button_click: boolean | null
          send_invoice_pdf: boolean | null
          social_links: Json | null
          updated_at: string
          use_default_api: boolean | null
          use_document_header_template: boolean | null
          waba_id: string | null
          webhook_verify_token: string | null
        }
        Insert: {
          access_token?: string | null
          auto_send_invoice?: boolean
          auto_send_invoice_link?: boolean | null
          auto_send_payment_reminder?: boolean
          auto_send_quotation?: boolean
          auto_send_sale_order?: boolean
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name?: string | null
          button_followup_message?: string | null
          chatbot_enabled?: boolean | null
          chatbot_greeting?: string | null
          chatbot_system_prompt?: string | null
          created_at?: string
          followup_chat_message?: string | null
          followup_invoice_message?: string | null
          followup_menu_message?: string | null
          followup_review_message?: string | null
          followup_social_message?: string | null
          handoff_keywords?: string[] | null
          id?: string
          invoice_document_template_name?: string | null
          invoice_document_template_params?: Json | null
          invoice_link_message?: string | null
          invoice_pdf_template?: string | null
          invoice_template_name?: string | null
          invoice_template_params?: Json | null
          is_active?: boolean
          organization_id: string
          outside_hours_message?: string | null
          payment_reminder_template_name?: string | null
          payment_reminder_template_params?: Json | null
          phone_number_id?: string | null
          provider?: string
          quotation_template_name?: string | null
          quotation_template_params?: Json | null
          sale_order_template_name?: string | null
          sale_order_template_params?: Json | null
          selected_invoice_template_id?: string | null
          selected_payment_reminder_template_id?: string | null
          selected_quotation_template_id?: string | null
          selected_sale_order_template_id?: string | null
          send_followup_on_button_click?: boolean | null
          send_invoice_pdf?: boolean | null
          social_links?: Json | null
          updated_at?: string
          use_default_api?: boolean | null
          use_document_header_template?: boolean | null
          waba_id?: string | null
          webhook_verify_token?: string | null
        }
        Update: {
          access_token?: string | null
          auto_send_invoice?: boolean
          auto_send_invoice_link?: boolean | null
          auto_send_payment_reminder?: boolean
          auto_send_quotation?: boolean
          auto_send_sale_order?: boolean
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_name?: string | null
          button_followup_message?: string | null
          chatbot_enabled?: boolean | null
          chatbot_greeting?: string | null
          chatbot_system_prompt?: string | null
          created_at?: string
          followup_chat_message?: string | null
          followup_invoice_message?: string | null
          followup_menu_message?: string | null
          followup_review_message?: string | null
          followup_social_message?: string | null
          handoff_keywords?: string[] | null
          id?: string
          invoice_document_template_name?: string | null
          invoice_document_template_params?: Json | null
          invoice_link_message?: string | null
          invoice_pdf_template?: string | null
          invoice_template_name?: string | null
          invoice_template_params?: Json | null
          is_active?: boolean
          organization_id?: string
          outside_hours_message?: string | null
          payment_reminder_template_name?: string | null
          payment_reminder_template_params?: Json | null
          phone_number_id?: string | null
          provider?: string
          quotation_template_name?: string | null
          quotation_template_params?: Json | null
          sale_order_template_name?: string | null
          sale_order_template_params?: Json | null
          selected_invoice_template_id?: string | null
          selected_payment_reminder_template_id?: string | null
          selected_quotation_template_id?: string | null
          selected_sale_order_template_id?: string | null
          send_followup_on_button_click?: boolean | null
          send_invoice_pdf?: boolean | null
          social_links?: Json | null
          updated_at?: string
          use_default_api?: boolean | null
          use_document_header_template?: boolean | null
          waba_id?: string | null
          webhook_verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_api_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_api_settings_selected_invoice_template_id_fkey"
            columns: ["selected_invoice_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_api_settings_selected_payment_reminder_template_i_fkey"
            columns: ["selected_payment_reminder_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_api_settings_selected_quotation_template_id_fkey"
            columns: ["selected_quotation_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_api_settings_selected_sale_order_template_id_fkey"
            columns: ["selected_sale_order_template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_meta_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string
          id: string
          last_message_at: string | null
          organization_id: string
          status: string | null
          unread_count: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone: string
          id?: string
          last_message_at?: string | null
          organization_id: string
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string
          id?: string
          last_message_at?: string | null
          organization_id?: string
          status?: string | null
          unread_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_logs: {
        Row: {
          created_at: string
          delivered_at: string | null
          error_message: string | null
          followup_data: Json | null
          id: string
          message: string | null
          organization_id: string
          pending_followup: boolean | null
          phone_number: string
          provider_response: Json | null
          read_at: string | null
          reference_id: string | null
          reference_type: string | null
          sent_at: string | null
          status: string
          template_name: string | null
          template_type: string
          wamid: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          followup_data?: Json | null
          id?: string
          message?: string | null
          organization_id: string
          pending_followup?: boolean | null
          phone_number: string
          provider_response?: Json | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_type: string
          wamid?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          followup_data?: Json | null
          id?: string
          message?: string | null
          organization_id?: string
          pending_followup?: boolean | null
          phone_number?: string
          provider_response?: Json | null
          read_at?: string | null
          reference_id?: string | null
          reference_type?: string | null
          sent_at?: string | null
          status?: string
          template_name?: string | null
          template_type?: string
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          id: string
          media_url: string | null
          message_text: string | null
          message_type: string | null
          organization_id: string
          read_at: string | null
          sent_at: string | null
          status: string | null
          wamid: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          direction: string
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string | null
          organization_id: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          wamid?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          message_text?: string | null
          message_type?: string | null
          organization_id?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
          wamid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_meta_templates: {
        Row: {
          components: Json | null
          created_at: string | null
          id: string
          organization_id: string
          template_category: string | null
          template_language: string | null
          template_name: string
          template_status: string | null
          updated_at: string | null
        }
        Insert: {
          components?: Json | null
          created_at?: string | null
          id?: string
          organization_id: string
          template_category?: string | null
          template_language?: string | null
          template_name: string
          template_status?: string | null
          updated_at?: string | null
        }
        Update: {
          components?: Json | null
          created_at?: string | null
          id?: string
          organization_id?: string
          template_category?: string | null
          template_language?: string | null
          template_name?: string
          template_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_meta_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      check_purchase_stock_dependencies: {
        Args: { p_bill_id: string }
        Returns: {
          current_stock: number
          product_name: string
          purchased_qty: number
          quantity: number
          sale_date: string
          sale_id: string
          sale_number: string
          size: string
          would_go_negative: boolean
        }[]
      }
      cleanup_old_login_attempts: { Args: never; Returns: undefined }
      create_organization: {
        Args: { p_name: string; p_user_id?: string }
        Returns: Json
      }
      detect_stock_discrepancies: {
        Args: { p_organization_id?: string }
        Returns: {
          barcode: string
          calculated_stock_qty: number
          current_stock_qty: number
          discrepancy: number
          opening_qty: number
          product_name: string
          size: string
          variant_id: string
        }[]
      }
      fix_stock_discrepancies: {
        Args: { p_organization_id?: string }
        Returns: {
          details: Json
          fixed_count: number
        }[]
      }
      generate_challan_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_credit_note_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_next_barcode: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_pos_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_purchase_bill_number:
        | {
            Args: { p_date?: string; p_organization_id?: string }
            Returns: string
          }
        | { Args: { p_organization_id: string }; Returns: string }
      generate_purchase_order_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_purchase_return_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_quotation_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_sale_number: {
        Args: { p_organization_id: string; p_prefix?: string }
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
      get_product_relations: {
        Args: { p_product_id: string }
        Returns: {
          record_count: number
          relation_type: string
          sample_references: string[]
        }[]
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
      log_security_event: {
        Args: {
          p_details: Json
          p_event_type: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: undefined
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
      reset_stock_from_transactions: {
        Args: { p_organization_id: string }
        Returns: {
          details: Json
          fixed_count: number
        }[]
      }
      restore_purchase_bill: { Args: { p_bill_id: string }; Returns: undefined }
      restore_purchase_return: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      restore_quotation: {
        Args: { p_quotation_id: string }
        Returns: undefined
      }
      restore_sale: { Args: { p_sale_id: string }; Returns: undefined }
      restore_sale_order: { Args: { p_order_id: string }; Returns: undefined }
      restore_sale_return: { Args: { p_return_id: string }; Returns: undefined }
      restore_voucher: { Args: { p_voucher_id: string }; Returns: undefined }
      soft_delete_delivery_challan: {
        Args: { p_challan_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_purchase_bill: {
        Args: { p_bill_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_purchase_return: {
        Args: { p_return_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_quotation: {
        Args: { p_quotation_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_sale: {
        Args: { p_sale_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_sale_order: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_sale_return: {
        Args: { p_return_id: string; p_user_id: string }
        Returns: undefined
      }
      soft_delete_voucher: {
        Args: { p_user_id: string; p_voucher_id: string }
        Returns: undefined
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
