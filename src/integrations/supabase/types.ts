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
      academic_years: {
        Row: {
          created_at: string | null
          end_date: string
          id: string
          is_current: boolean | null
          organization_id: string
          start_date: string
          updated_at: string | null
          year_name: string
        }
        Insert: {
          created_at?: string | null
          end_date: string
          id?: string
          is_current?: boolean | null
          organization_id: string
          start_date: string
          updated_at?: string | null
          year_name: string
        }
        Update: {
          created_at?: string | null
          end_date?: string
          id?: string
          is_current?: boolean | null
          organization_id?: string
          start_date?: string
          updated_at?: string | null
          year_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academic_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      account_ledgers: {
        Row: {
          account_name: string
          account_type: string
          created_at: string | null
          current_balance: number | null
          id: string
          opening_balance: number | null
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
            foreignKeyName: "account_ledgers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
      advance_refunds: {
        Row: {
          advance_id: string
          created_at: string | null
          created_by: string | null
          id: string
          organization_id: string
          payment_method: string | null
          reason: string | null
          refund_amount: number
          refund_date: string
        }
        Insert: {
          advance_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id: string
          payment_method?: string | null
          reason?: string | null
          refund_amount: number
          refund_date?: string
        }
        Update: {
          advance_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string
          payment_method?: string | null
          reason?: string | null
          refund_amount?: number
          refund_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "advance_refunds_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "customer_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advance_refunds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      app_error_logs: {
        Row: {
          additional_context: Json | null
          browser_info: Json | null
          created_at: string
          error_code: string | null
          error_message: string
          error_stack: string | null
          id: string
          operation: string
          organization_id: string | null
          page_path: string | null
          user_id: string | null
        }
        Insert: {
          additional_context?: Json | null
          browser_info?: Json | null
          created_at?: string
          error_code?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          operation: string
          organization_id?: string | null
          page_path?: string | null
          user_id?: string | null
        }
        Update: {
          additional_context?: Json | null
          browser_info?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          operation?: string
          organization_id?: string | null
          page_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_error_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
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
          storage_path: string | null
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
          storage_path?: string | null
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
          storage_path?: string | null
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
          {
            foreignKeyName: "backup_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "barcode_label_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      barcode_sequence: {
        Row: {
          id: number
          next_barcode: number
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          id?: number
          next_barcode?: number
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          id?: number
          next_barcode?: number
          organization_id?: string
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
          {
            foreignKeyName: "barcode_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "batch_stock_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          organization_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          id?: number
          month: number
          next_sequence?: number
          organization_id: string
          updated_at?: string | null
          year: number
        }
        Update: {
          id?: number
          month?: number
          next_sequence?: number
          organization_id?: string
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
          {
            foreignKeyName: "bill_number_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      bill_number_sequences: {
        Row: {
          id: string
          last_number: number
          organization_id: string
          series: string
        }
        Insert: {
          id?: string
          last_number?: number
          organization_id: string
          series: string
        }
        Update: {
          id?: string
          last_number?: number
          organization_id?: string
          series?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_number_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_number_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      bulk_update_history: {
        Row: {
          config: Json | null
          created_at: string
          created_by: string | null
          filters: Json | null
          id: string
          items_count: number
          items_summary: Json | null
          organization_id: string
          update_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          created_by?: string | null
          filters?: Json | null
          id?: string
          items_count?: number
          items_summary?: Json | null
          organization_id: string
          update_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          created_by?: string | null
          filters?: Json | null
          id?: string
          items_count?: number
          items_summary?: Json | null
          organization_id?: string
          update_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_update_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_update_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "cheque_formats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          commission_percent: number
          created_at: string | null
          employee_id: string
          employee_name: string
          id: string
          is_active: boolean | null
          notes: string | null
          organization_id: string
          rule_type: string
          rule_value: string | null
          updated_at: string | null
        }
        Insert: {
          commission_percent?: number
          created_at?: string | null
          employee_id: string
          employee_name: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization_id: string
          rule_type?: string
          rule_value?: string | null
          updated_at?: string | null
        }
        Update: {
          commission_percent?: number
          created_at?: string | null
          employee_id?: string
          employee_name?: string
          id?: string
          is_active?: boolean | null
          notes?: string | null
          organization_id?: string
          rule_type?: string
          rule_value?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "credit_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_advances: {
        Row: {
          advance_date: string
          advance_number: string
          amount: number
          cheque_number: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          organization_id: string
          payment_method: string | null
          status: string | null
          transaction_id: string | null
          used_amount: number
        }
        Insert: {
          advance_date?: string
          advance_number: string
          amount?: number
          cheque_number?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          organization_id: string
          payment_method?: string | null
          status?: string | null
          transaction_id?: string | null
          used_amount?: number
        }
        Update: {
          advance_date?: string
          advance_number?: string
          amount?: number
          cheque_number?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          organization_id?: string
          payment_method?: string | null
          status?: string | null
          transaction_id?: string | null
          used_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_advances_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_advances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_advances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      customer_balance_adjustments: {
        Row: {
          adjustment_date: string
          advance_difference: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          new_advance: number
          new_outstanding: number
          organization_id: string
          outstanding_difference: number
          previous_advance: number
          previous_outstanding: number
          reason: string
        }
        Insert: {
          adjustment_date?: string
          advance_difference?: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          new_advance?: number
          new_outstanding?: number
          organization_id: string
          outstanding_difference?: number
          previous_advance?: number
          previous_outstanding?: number
          reason: string
        }
        Update: {
          adjustment_date?: string
          advance_difference?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          new_advance?: number
          new_outstanding?: number
          organization_id?: string
          outstanding_difference?: number
          previous_advance?: number
          previous_outstanding?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_balance_adjustments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_balance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "customer_brand_discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      customer_ledger_entries: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit: number | null
          customer_id: string
          debit: number | null
          id: string
          organization_id: string
          particulars: string | null
          transaction_date: string | null
          voucher_no: string | null
          voucher_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          customer_id: string
          debit?: number | null
          id?: string
          organization_id: string
          particulars?: string | null
          transaction_date?: string | null
          voucher_no?: string | null
          voucher_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          customer_id?: string
          debit?: number | null
          id?: string
          organization_id?: string
          particulars?: string | null
          transaction_date?: string | null
          voucher_no?: string | null
          voucher_type?: string
        }
        Relationships: []
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
            foreignKeyName: "customer_points_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "customer_points_history_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_points_history_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_product_prices: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          last_mrp: number
          last_order_id: string | null
          last_sale_date: string
          last_sale_id: string | null
          last_sale_price: number
          organization_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          last_mrp: number
          last_order_id?: string | null
          last_sale_date?: string
          last_sale_id?: string | null
          last_sale_price: number
          organization_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          last_mrp?: number
          last_order_id?: string | null
          last_sale_date?: string
          last_sale_id?: string | null
          last_sale_price?: number
          organization_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_last_order_id_fkey"
            columns: ["last_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_last_sale_id_fkey"
            columns: ["last_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_last_sale_id_fkey"
            columns: ["last_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_product_prices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "customer_product_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
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
          organization_id: string
          phone: string | null
          points_balance: number | null
          points_redeemed: number | null
          portal_enabled: boolean | null
          portal_last_login: string | null
          portal_otp: string | null
          portal_otp_expires_at: string | null
          portal_price_type: string | null
          total_points_earned: number | null
          transport_details: string | null
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
          organization_id: string
          phone?: string | null
          points_balance?: number | null
          points_redeemed?: number | null
          portal_enabled?: boolean | null
          portal_last_login?: string | null
          portal_otp?: string | null
          portal_otp_expires_at?: string | null
          portal_price_type?: string | null
          total_points_earned?: number | null
          transport_details?: string | null
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
          organization_id?: string
          phone?: string | null
          points_balance?: number | null
          points_redeemed?: number | null
          portal_enabled?: boolean | null
          portal_last_login?: string | null
          portal_otp?: string | null
          portal_otp_expires_at?: string | null
          portal_price_type?: string | null
          total_points_earned?: number | null
          transport_details?: string | null
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
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      daily_tally_snapshot: {
        Row: {
          created_at: string | null
          created_by: string | null
          denomination_data: Json | null
          deposit_to_bank: number | null
          difference_amount: number | null
          expected_cash: number | null
          handover_to_owner: number | null
          id: string
          leave_in_drawer: number | null
          notes: string | null
          opening_cash: number | null
          organization_id: string
          physical_cash: number | null
          tally_date: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          denomination_data?: Json | null
          deposit_to_bank?: number | null
          difference_amount?: number | null
          expected_cash?: number | null
          handover_to_owner?: number | null
          id?: string
          leave_in_drawer?: number | null
          notes?: string | null
          opening_cash?: number | null
          organization_id: string
          physical_cash?: number | null
          tally_date: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          denomination_data?: Json | null
          deposit_to_bank?: number | null
          difference_amount?: number | null
          expected_cash?: number | null
          handover_to_owner?: number | null
          id?: string
          leave_in_drawer?: number | null
          notes?: string | null
          opening_cash?: number | null
          organization_id?: string
          physical_cash?: number | null
          tally_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_tally_snapshot_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tally_snapshot_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      dc_sale_transfers: {
        Row: {
          challan_id: string | null
          created_by: string | null
          id: string
          organization_id: string
          sale_id: string | null
          sale_item_id: string | null
          transferred_at: string | null
        }
        Insert: {
          challan_id?: string | null
          created_by?: string | null
          id?: string
          organization_id: string
          sale_id?: string | null
          sale_item_id?: string | null
          transferred_at?: string | null
        }
        Update: {
          challan_id?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string
          sale_id?: string | null
          sale_item_id?: string | null
          transferred_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dc_sale_transfers_challan_id_fkey"
            columns: ["challan_id"]
            isOneToOne: false
            referencedRelation: "delivery_challans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_sale_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_sale_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "dc_sale_transfers_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_sale_transfers_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dc_sale_transfers_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
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
            foreignKeyName: "delivery_challans_converted_to_invoice_id_fkey"
            columns: ["converted_to_invoice_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
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
            foreignKeyName: "delivery_challans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "delivery_tracking_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "delivery_tracking_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_tracking_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
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
          {
            foreignKeyName: "drafts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          commission_percent: number
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          designation: string | null
          email: string | null
          employee_name: string
          field_sales_access: boolean | null
          id: string
          joining_date: string | null
          organization_id: string
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          commission_percent?: number
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          designation?: string | null
          email?: string | null
          employee_name: string
          field_sales_access?: boolean | null
          id?: string
          joining_date?: string | null
          organization_id: string
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          commission_percent?: number
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          designation?: string | null
          email?: string | null
          employee_name?: string
          field_sales_access?: boolean | null
          id?: string
          joining_date?: string | null
          organization_id?: string
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
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "expense_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      fee_heads: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          head_name: string
          id: string
          is_active: boolean | null
          is_refundable: boolean | null
          organization_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          head_name: string
          id?: string
          is_active?: boolean | null
          is_refundable?: boolean | null
          organization_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          head_name?: string
          id?: string
          is_active?: boolean | null
          is_refundable?: boolean | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_heads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_heads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      fee_receipt_sequence: {
        Row: {
          financial_year: string
          id: number
          next_sequence: number
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          financial_year: string
          id?: number
          next_sequence?: number
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          financial_year?: string
          id?: number
          next_sequence?: number
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      fee_schedules: {
        Row: {
          academic_year_id: string
          class_id: string | null
          created_at: string | null
          due_date: string
          fee_head_id: string | null
          id: string
          organization_id: string
          period_end: string | null
          period_name: string | null
          period_start: string | null
        }
        Insert: {
          academic_year_id: string
          class_id?: string | null
          created_at?: string | null
          due_date: string
          fee_head_id?: string | null
          id?: string
          organization_id: string
          period_end?: string | null
          period_name?: string | null
          period_start?: string | null
        }
        Update: {
          academic_year_id?: string
          class_id?: string | null
          created_at?: string | null
          due_date?: string
          fee_head_id?: string | null
          id?: string
          organization_id?: string
          period_end?: string | null
          period_name?: string | null
          period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_schedules_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "school_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_fee_head_id_fkey"
            columns: ["fee_head_id"]
            isOneToOne: false
            referencedRelation: "fee_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      fee_structure_history: {
        Row: {
          academic_year_id: string
          changed_at: string
          changed_by: string | null
          class_id: string
          fee_head_id: string
          fee_structure_id: string | null
          id: string
          new_amount: number | null
          new_frequency: string | null
          notes: string | null
          old_amount: number | null
          old_frequency: string | null
          organization_id: string
        }
        Insert: {
          academic_year_id: string
          changed_at?: string
          changed_by?: string | null
          class_id: string
          fee_head_id: string
          fee_structure_id?: string | null
          id?: string
          new_amount?: number | null
          new_frequency?: string | null
          notes?: string | null
          old_amount?: number | null
          old_frequency?: string | null
          organization_id: string
        }
        Update: {
          academic_year_id?: string
          changed_at?: string
          changed_by?: string | null
          class_id?: string
          fee_head_id?: string
          fee_structure_id?: string | null
          id?: string
          new_amount?: number | null
          new_frequency?: string | null
          notes?: string | null
          old_amount?: number | null
          old_frequency?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structure_history_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_history_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "school_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_history_fee_head_id_fkey"
            columns: ["fee_head_id"]
            isOneToOne: false
            referencedRelation: "fee_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structure_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      fee_structures: {
        Row: {
          academic_year_id: string
          amount: number
          class_id: string
          created_at: string | null
          due_day: number | null
          fee_head_id: string
          frequency: string
          id: string
          late_fee_after_days: number | null
          late_fee_amount: number | null
          organization_id: string
        }
        Insert: {
          academic_year_id: string
          amount: number
          class_id: string
          created_at?: string | null
          due_day?: number | null
          fee_head_id: string
          frequency?: string
          id?: string
          late_fee_after_days?: number | null
          late_fee_amount?: number | null
          organization_id: string
        }
        Update: {
          academic_year_id?: string
          amount?: number
          class_id?: string
          created_at?: string | null
          due_day?: number | null
          fee_head_id?: string
          frequency?: string
          id?: string
          late_fee_after_days?: number | null
          late_fee_amount?: number | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structures_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "school_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_fee_head_id_fkey"
            columns: ["fee_head_id"]
            isOneToOne: false
            referencedRelation: "fee_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_structures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "gift_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "gift_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "import_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "legacy_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "organization_label_templates_backup_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          shop_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          shop_name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          shop_name?: string | null
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
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          organization_type: string
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
          organization_type?: string
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
          organization_type?: string
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
          {
            foreignKeyName: "payment_gateway_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
            foreignKeyName: "payment_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "payment_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
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
      portal_sessions: {
        Row: {
          created_at: string | null
          customer_id: string
          expires_at: string
          id: string
          organization_id: string
          session_token: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          expires_at: string
          id?: string
          organization_id: string
          session_token: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          expires_at?: string
          id?: string
          organization_id?: string
          session_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      printer_presets: {
        Row: {
          a4_cols: number | null
          a4_rows: number | null
          created_at: string | null
          id: string
          is_default: boolean | null
          label_config: Json | null
          label_height: number
          label_width: number
          name: string
          organization_id: string
          print_mode: string | null
          thermal_cols: number | null
          updated_at: string | null
          v_gap: number
          x_offset: number
          y_offset: number
        }
        Insert: {
          a4_cols?: number | null
          a4_rows?: number | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label_config?: Json | null
          label_height?: number
          label_width?: number
          name: string
          organization_id: string
          print_mode?: string | null
          thermal_cols?: number | null
          updated_at?: string | null
          v_gap?: number
          x_offset?: number
          y_offset?: number
        }
        Update: {
          a4_cols?: number | null
          a4_rows?: number | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          label_config?: Json | null
          label_height?: number
          label_width?: number
          name?: string
          organization_id?: string
          print_mode?: string | null
          thermal_cols?: number | null
          updated_at?: string | null
          v_gap?: number
          x_offset?: number
          y_offset?: number
        }
        Relationships: [
          {
            foreignKeyName: "printer_presets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "printer_presets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          organization_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          organization_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          organization_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean | null
          barcode: string | null
          color: string | null
          created_at: string | null
          current_stock: number | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_dc_product: boolean | null
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
          current_stock?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_dc_product?: boolean | null
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
          current_stock?: number | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_dc_product?: boolean | null
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
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          organization_id: string
          product_name: string
          product_type: string
          purchase_discount_type: string | null
          purchase_discount_value: number | null
          purchase_gst_percent: number | null
          sale_discount_type: string | null
          sale_discount_value: number | null
          sale_gst_percent: number | null
          size_group_id: string | null
          status: string | null
          style: string | null
          uom: string
          updated_at: string | null
          user_cancelled_at: string | null
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
          organization_id: string
          product_name: string
          product_type?: string
          purchase_discount_type?: string | null
          purchase_discount_value?: number | null
          purchase_gst_percent?: number | null
          sale_discount_type?: string | null
          sale_discount_value?: number | null
          sale_gst_percent?: number | null
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          uom?: string
          updated_at?: string | null
          user_cancelled_at?: string | null
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
          organization_id?: string
          product_name?: string
          product_type?: string
          purchase_discount_type?: string | null
          purchase_discount_value?: number | null
          purchase_gst_percent?: number | null
          sale_discount_type?: string | null
          sale_discount_value?: number | null
          sale_gst_percent?: number | null
          size_group_id?: string | null
          status?: string | null
          style?: string | null
          uom?: string
          updated_at?: string | null
          user_cancelled_at?: string | null
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
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
      promotion_history: {
        Row: {
          carry_forward_enabled: boolean
          created_at: string | null
          from_year_id: string
          from_year_name: string
          id: string
          organization_id: string
          promoted_by: string | null
          to_year_id: string
          to_year_name: string
          total_failed: number
          total_passed_out: number
          total_promoted: number
        }
        Insert: {
          carry_forward_enabled?: boolean
          created_at?: string | null
          from_year_id: string
          from_year_name: string
          id?: string
          organization_id: string
          promoted_by?: string | null
          to_year_id: string
          to_year_name: string
          total_failed?: number
          total_passed_out?: number
          total_promoted?: number
        }
        Update: {
          carry_forward_enabled?: boolean
          created_at?: string | null
          from_year_id?: string
          from_year_name?: string
          id?: string
          organization_id?: string
          promoted_by?: string | null
          to_year_id?: string
          to_year_name?: string
          total_failed?: number
          total_passed_out?: number
          total_promoted?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_history_from_year_id_fkey"
            columns: ["from_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "promotion_history_to_year_id_fkey"
            columns: ["to_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_bills: {
        Row: {
          bill_date: string
          bill_image_url: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          discount_amount: number | null
          gross_amount: number
          gst_amount: number
          id: string
          is_cancelled: boolean
          is_dc_purchase: boolean | null
          is_locked: boolean
          net_amount: number
          notes: string | null
          organization_id: string
          other_charges: number | null
          paid_amount: number | null
          payment_status: string | null
          round_off: number | null
          software_bill_no: string | null
          supplier_id: string | null
          supplier_invoice_no: string | null
          supplier_name: string
          total_qty: number | null
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_image_url?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          is_cancelled?: boolean
          is_dc_purchase?: boolean | null
          is_locked?: boolean
          net_amount?: number
          notes?: string | null
          organization_id: string
          other_charges?: number | null
          paid_amount?: number | null
          payment_status?: string | null
          round_off?: number | null
          software_bill_no?: string | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          supplier_name: string
          total_qty?: number | null
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_image_url?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_amount?: number | null
          gross_amount?: number
          gst_amount?: number
          id?: string
          is_cancelled?: boolean
          is_dc_purchase?: boolean | null
          is_locked?: boolean
          net_amount?: number
          notes?: string | null
          organization_id?: string
          other_charges?: number | null
          paid_amount?: number | null
          payment_status?: string | null
          round_off?: number | null
          software_bill_no?: string | null
          supplier_id?: string | null
          supplier_invoice_no?: string | null
          supplier_name?: string
          total_qty?: number | null
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
            foreignKeyName: "purchase_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          is_dc_item: boolean | null
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
          is_dc_item?: boolean | null
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
          is_dc_item?: boolean | null
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
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      sale_financer_details: {
        Row: {
          bank_transfer_amount: number | null
          created_at: string | null
          down_payment: number | null
          down_payment_mode: string | null
          emi_amount: number | null
          finance_discount: number | null
          financer_name: string
          id: string
          loan_number: string | null
          organization_id: string
          sale_id: string
          tenure: number | null
          updated_at: string | null
        }
        Insert: {
          bank_transfer_amount?: number | null
          created_at?: string | null
          down_payment?: number | null
          down_payment_mode?: string | null
          emi_amount?: number | null
          finance_discount?: number | null
          financer_name: string
          id?: string
          loan_number?: string | null
          organization_id: string
          sale_id: string
          tenure?: number | null
          updated_at?: string | null
        }
        Update: {
          bank_transfer_amount?: number | null
          created_at?: string | null
          down_payment?: number | null
          down_payment_mode?: string | null
          emi_amount?: number | null
          finance_discount?: number | null
          financer_name?: string
          id?: string
          loan_number?: string | null
          organization_id?: string
          sale_id?: string
          tenure?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_financer_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_financer_details_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "sale_financer_details_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_financer_details_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
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
          discount_share: number
          gst_percent: number
          hsn_code: string | null
          id: string
          is_dc_item: boolean | null
          line_total: number
          mrp: number
          net_after_discount: number
          per_qty_net_amount: number
          product_id: string
          product_name: string
          quantity: number
          round_off_share: number | null
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
          discount_share?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          is_dc_item?: boolean | null
          line_total: number
          mrp: number
          net_after_discount?: number
          per_qty_net_amount?: number
          product_id: string
          product_name: string
          quantity: number
          round_off_share?: number | null
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
          discount_share?: number
          gst_percent?: number
          hsn_code?: string | null
          id?: string
          is_dc_item?: boolean | null
          line_total?: number
          mrp?: number
          net_after_discount?: number
          per_qty_net_amount?: number
          product_id?: string
          product_name?: string
          quantity?: number
          round_off_share?: number | null
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
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_number_sequence: {
        Row: {
          financial_year: string
          id: number
          next_sequence: number
          organization_id: string
          prefix: string
          updated_at: string | null
        }
        Insert: {
          financial_year: string
          id?: number
          next_sequence?: number
          organization_id: string
          prefix?: string
          updated_at?: string | null
        }
        Update: {
          financial_year?: string
          id?: number
          next_sequence?: number
          organization_id?: string
          prefix?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_number_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_number_sequence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          uom: string | null
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
          uom?: string | null
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
          uom?: string | null
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
          order_source: string | null
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
          order_source?: string | null
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
          order_source?: string | null
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
            foreignKeyName: "sale_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          refund_type: string
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
          refund_type?: string
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
          refund_type?: string
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
          {
            foreignKeyName: "sale_returns_linked_sale_id_fkey"
            columns: ["linked_sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
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
          einvoice_test_mode: boolean | null
          flat_discount_amount: number
          flat_discount_percent: number
          gross_amount: number
          held_cart_data: Json | null
          id: string
          invoice_type: string | null
          irn: string | null
          is_cancelled: boolean
          net_amount: number
          notes: string | null
          organization_id: string
          other_charges: number | null
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
          shop_name: string | null
          signed_invoice: string | null
          signed_qr_code: string | null
          terms_conditions: string | null
          total_qty: number | null
          updated_at: string
          upi_amount: number | null
        }
        Insert: {
          ack_date?: string | null
          ack_no?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
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
          einvoice_test_mode?: boolean | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          held_cart_data?: Json | null
          id?: string
          invoice_type?: string | null
          irn?: string | null
          is_cancelled?: boolean
          net_amount?: number
          notes?: string | null
          organization_id: string
          other_charges?: number | null
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
          shop_name?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          terms_conditions?: string | null
          total_qty?: number | null
          updated_at?: string
          upi_amount?: number | null
        }
        Update: {
          ack_date?: string | null
          ack_no?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
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
          einvoice_test_mode?: boolean | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          held_cart_data?: Json | null
          id?: string
          invoice_type?: string | null
          irn?: string | null
          is_cancelled?: boolean
          net_amount?: number
          notes?: string | null
          organization_id?: string
          other_charges?: number | null
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
          shop_name?: string | null
          signed_invoice?: string | null
          signed_qr_code?: string | null
          terms_conditions?: string | null
          total_qty?: number | null
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
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      salesman_commissions: {
        Row: {
          brand: string | null
          category: string | null
          commission_amount: number
          commission_percent: number
          created_at: string | null
          customer_name: string | null
          employee_id: string | null
          employee_name: string
          id: string
          notes: string | null
          organization_id: string
          paid_date: string | null
          paid_voucher_id: string | null
          payment_status: string | null
          product_id: string | null
          product_name: string | null
          rule_type: string | null
          sale_amount: number
          sale_date: string
          sale_id: string | null
          sale_number: string
          style: string | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string | null
          customer_name?: string | null
          employee_id?: string | null
          employee_name: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_date?: string | null
          paid_voucher_id?: string | null
          payment_status?: string | null
          product_id?: string | null
          product_name?: string | null
          rule_type?: string | null
          sale_amount?: number
          sale_date: string
          sale_id?: string | null
          sale_number: string
          style?: string | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          commission_amount?: number
          commission_percent?: number
          created_at?: string | null
          customer_name?: string | null
          employee_id?: string | null
          employee_name?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_date?: string | null
          paid_voucher_id?: string | null
          payment_status?: string | null
          product_id?: string | null
          product_name?: string | null
          rule_type?: string | null
          sale_amount?: number
          sale_date?: string
          sale_id?: string | null
          sale_number?: string
          style?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salesman_commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesman_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesman_commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "salesman_commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salesman_commissions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
        ]
      }
      school_classes: {
        Row: {
          class_name: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          organization_id: string
          section: string | null
        }
        Insert: {
          class_name: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          section?: string | null
        }
        Update: {
          class_name?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          section?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_classes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      settings: {
        Row: {
          address: string | null
          auto_backup_enabled: boolean | null
          backup_email: string | null
          backup_retention_days: number | null
          bill_barcode_settings: Json | null
          business_name: string | null
          created_at: string | null
          dashboard_settings: Json | null
          email_id: string | null
          gst_number: string | null
          id: string
          last_auto_backup_at: string | null
          mobile_number: string | null
          organization_id: string
          owner_phone: string | null
          product_settings: Json | null
          purchase_settings: Json | null
          report_settings: Json | null
          sale_settings: Json | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          auto_backup_enabled?: boolean | null
          backup_email?: string | null
          backup_retention_days?: number | null
          bill_barcode_settings?: Json | null
          business_name?: string | null
          created_at?: string | null
          dashboard_settings?: Json | null
          email_id?: string | null
          gst_number?: string | null
          id?: string
          last_auto_backup_at?: string | null
          mobile_number?: string | null
          organization_id: string
          owner_phone?: string | null
          product_settings?: Json | null
          purchase_settings?: Json | null
          report_settings?: Json | null
          sale_settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          auto_backup_enabled?: boolean | null
          backup_email?: string | null
          backup_retention_days?: number | null
          bill_barcode_settings?: Json | null
          business_name?: string | null
          created_at?: string | null
          dashboard_settings?: Json | null
          email_id?: string | null
          gst_number?: string | null
          id?: string
          last_auto_backup_at?: string | null
          mobile_number?: string | null
          organization_id?: string
          owner_phone?: string | null
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
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "size_groups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "sms_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "sms_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "sms_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          barcode: string | null
          calculated_stock_qty: number
          current_stock_qty: number
          detected_at: string
          discrepancy: number
          id: string
          organization_id: string
          product_name: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          size: string | null
          variant_id: string
        }
        Insert: {
          barcode?: string | null
          calculated_stock_qty: number
          current_stock_qty: number
          detected_at?: string
          discrepancy: number
          id?: string
          organization_id: string
          product_name?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          size?: string | null
          variant_id: string
        }
        Update: {
          barcode?: string | null
          calculated_stock_qty?: number
          current_stock_qty?: number
          detected_at?: string
          discrepancy?: number
          id?: string
          organization_id?: string
          product_name?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          size?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "stock_alerts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
      student_balance_audit: {
        Row: {
          academic_year_id: string | null
          adjusted_by: string | null
          adjusted_by_name: string | null
          adjustment_type: string
          change_amount: number
          created_at: string | null
          id: string
          new_balance: number
          old_balance: number
          organization_id: string
          reason_code: string
          reason_code_label: string | null
          reason_detail: string | null
          student_id: string
          voucher_number: string
        }
        Insert: {
          academic_year_id?: string | null
          adjusted_by?: string | null
          adjusted_by_name?: string | null
          adjustment_type: string
          change_amount?: number
          created_at?: string | null
          id?: string
          new_balance?: number
          old_balance?: number
          organization_id: string
          reason_code: string
          reason_code_label?: string | null
          reason_detail?: string | null
          student_id: string
          voucher_number: string
        }
        Update: {
          academic_year_id?: string | null
          adjusted_by?: string | null
          adjusted_by_name?: string | null
          adjustment_type?: string
          change_amount?: number
          created_at?: string | null
          id?: string
          new_balance?: number
          old_balance?: number
          organization_id?: string
          reason_code?: string
          reason_code_label?: string | null
          reason_detail?: string | null
          student_id?: string
          voucher_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_balance_audit_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_balance_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_balance_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "student_balance_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fees: {
        Row: {
          academic_year_id: string
          amount: number
          created_at: string | null
          discount: number | null
          discount_reason: string | null
          due_date: string | null
          fee_head_id: string | null
          fee_structure_id: string | null
          id: string
          late_fee: number | null
          notes: string | null
          organization_id: string
          paid_amount: number | null
          paid_date: string | null
          payment_id: string | null
          payment_method: string | null
          payment_receipt_id: string | null
          period_month: number | null
          period_year: number | null
          sale_id: string | null
          status: string | null
          student_id: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year_id: string
          amount: number
          created_at?: string | null
          discount?: number | null
          discount_reason?: string | null
          due_date?: string | null
          fee_head_id?: string | null
          fee_structure_id?: string | null
          id?: string
          late_fee?: number | null
          notes?: string | null
          organization_id: string
          paid_amount?: number | null
          paid_date?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_receipt_id?: string | null
          period_month?: number | null
          period_year?: number | null
          sale_id?: string | null
          status?: string | null
          student_id: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year_id?: string
          amount?: number
          created_at?: string | null
          discount?: number | null
          discount_reason?: string | null
          due_date?: string | null
          fee_head_id?: string | null
          fee_structure_id?: string | null
          id?: string
          late_fee?: number | null
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          paid_date?: string | null
          payment_id?: string | null
          payment_method?: string | null
          payment_receipt_id?: string | null
          period_month?: number | null
          period_year?: number | null
          sale_id?: string | null
          status?: string | null
          student_id?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_head_id_fkey"
            columns: ["fee_head_id"]
            isOneToOne: false
            referencedRelation: "fee_heads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
          {
            foreignKeyName: "student_fees_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_with_customer"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          academic_year_id: string | null
          address: string | null
          admission_date: string | null
          admission_number: string
          class_id: string | null
          closing_fees_balance: number | null
          created_at: string | null
          customer_id: string | null
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          division: string | null
          emergency_contact: string | null
          gender: string | null
          id: string
          is_new_admission: boolean
          notes: string | null
          organization_id: string
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          parent_relation: string | null
          photo_url: string | null
          roll_number: string | null
          status: string | null
          student_name: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          academic_year_id?: string | null
          address?: string | null
          admission_date?: string | null
          admission_number: string
          class_id?: string | null
          closing_fees_balance?: number | null
          created_at?: string | null
          customer_id?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          division?: string | null
          emergency_contact?: string | null
          gender?: string | null
          id?: string
          is_new_admission?: boolean
          notes?: string | null
          organization_id: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relation?: string | null
          photo_url?: string | null
          roll_number?: string | null
          status?: string | null
          student_name: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          academic_year_id?: string | null
          address?: string | null
          admission_date?: string | null
          admission_number?: string
          class_id?: string | null
          closing_fees_balance?: number | null
          created_at?: string | null
          customer_id?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          division?: string | null
          emergency_contact?: string | null
          gender?: string | null
          id?: string
          is_new_admission?: boolean
          notes?: string | null
          organization_id?: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relation?: string | null
          photo_url?: string | null
          roll_number?: string | null
          status?: string | null
          student_name?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "school_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          organization_id: string
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
          organization_id: string
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
          organization_id?: string
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
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      teachers: {
        Row: {
          can_view_fees: boolean | null
          can_view_students: boolean | null
          created_at: string | null
          date_of_joining: string | null
          deleted_at: string | null
          email: string | null
          employee_id: string | null
          id: string
          organization_id: string
          phone: string | null
          qualification: string | null
          status: string | null
          subjects: string[] | null
          teacher_code: string
          teacher_name: string
          user_id: string | null
        }
        Insert: {
          can_view_fees?: boolean | null
          can_view_students?: boolean | null
          created_at?: string | null
          date_of_joining?: string | null
          deleted_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          organization_id: string
          phone?: string | null
          qualification?: string | null
          status?: string | null
          subjects?: string[] | null
          teacher_code: string
          teacher_name: string
          user_id?: string | null
        }
        Update: {
          can_view_fees?: boolean | null
          can_view_students?: boolean | null
          created_at?: string | null
          date_of_joining?: string | null
          deleted_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          organization_id?: string
          phone?: string | null
          qualification?: string | null
          status?: string | null
          subjects?: string[] | null
          teacher_code?: string
          teacher_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "user_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          notes: string | null
          organization_id: string
          paid_by: string | null
          payment_method: string | null
          receipt_number: string | null
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
          notes?: string | null
          organization_id: string
          paid_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
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
          notes?: string | null
          organization_id?: string
          paid_by?: string | null
          payment_method?: string | null
          receipt_number?: string | null
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
          {
            foreignKeyName: "voucher_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          api_provider: string
          api_version: string
          auto_send_fee_receipt: boolean | null
          auto_send_fee_reminder: boolean | null
          auto_send_invoice: boolean
          auto_send_invoice_link: boolean | null
          auto_send_payment_reminder: boolean
          auto_send_quotation: boolean
          auto_send_sale_order: boolean
          business_hours_enabled: boolean | null
          business_hours_end: string | null
          business_hours_start: string | null
          business_id: string | null
          business_name: string | null
          button_followup_message: string | null
          chatbot_enabled: boolean | null
          chatbot_greeting: string | null
          chatbot_system_prompt: string | null
          created_at: string
          custom_api_url: string | null
          fee_receipt_template_name: string | null
          fee_receipt_template_params: Json | null
          fee_reminder_template_name: string | null
          fee_reminder_template_params: Json | null
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
          pdf_min_amount: number | null
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
          api_provider?: string
          api_version?: string
          auto_send_fee_receipt?: boolean | null
          auto_send_fee_reminder?: boolean | null
          auto_send_invoice?: boolean
          auto_send_invoice_link?: boolean | null
          auto_send_payment_reminder?: boolean
          auto_send_quotation?: boolean
          auto_send_sale_order?: boolean
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_id?: string | null
          business_name?: string | null
          button_followup_message?: string | null
          chatbot_enabled?: boolean | null
          chatbot_greeting?: string | null
          chatbot_system_prompt?: string | null
          created_at?: string
          custom_api_url?: string | null
          fee_receipt_template_name?: string | null
          fee_receipt_template_params?: Json | null
          fee_reminder_template_name?: string | null
          fee_reminder_template_params?: Json | null
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
          pdf_min_amount?: number | null
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
          api_provider?: string
          api_version?: string
          auto_send_fee_receipt?: boolean | null
          auto_send_fee_reminder?: boolean | null
          auto_send_invoice?: boolean
          auto_send_invoice_link?: boolean | null
          auto_send_payment_reminder?: boolean
          auto_send_quotation?: boolean
          auto_send_sale_order?: boolean
          business_hours_enabled?: boolean | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          business_id?: string | null
          business_name?: string | null
          button_followup_message?: string | null
          chatbot_enabled?: boolean | null
          chatbot_greeting?: string | null
          chatbot_system_prompt?: string | null
          created_at?: string
          custom_api_url?: string | null
          fee_receipt_template_name?: string | null
          fee_receipt_template_params?: Json | null
          fee_reminder_template_name?: string | null
          fee_reminder_template_params?: Json | null
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
          pdf_min_amount?: number | null
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
            foreignKeyName: "whatsapp_api_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "whatsapp_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "whatsapp_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_message_stats: {
        Row: {
          created_at: string
          delivered_count: number
          failed_count: number
          id: string
          organization_id: string
          pending_count: number
          read_count: number
          sent_count: number
          stat_date: string
          total_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          organization_id: string
          pending_count?: number
          read_count?: number
          sent_count?: number
          stat_date: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_count?: number
          failed_count?: number
          id?: string
          organization_id?: string
          pending_count?: number
          read_count?: number
          sent_count?: number
          stat_date?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_message_stats_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          conversation_id: string
          created_at: string
          delivered_at: string | null
          direction: string
          error_message: string | null
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
          error_message?: string | null
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
          error_message?: string | null
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
          {
            foreignKeyName: "whatsapp_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "whatsapp_meta_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
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
          {
            foreignKeyName: "whatsapp_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Views: {
      sales_with_customer: {
        Row: {
          ack_date: string | null
          ack_no: string | null
          card_amount: number | null
          cash_amount: number | null
          created_at: string | null
          created_by: string | null
          credit_applied: number | null
          credit_note_amount: number | null
          credit_note_id: string | null
          customer_address: string | null
          customer_email: string | null
          customer_gst_number: string | null
          customer_id: string | null
          customer_loyalty_points: number | null
          customer_name: string | null
          customer_phone: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_status: string | null
          discount_amount: number | null
          due_date: string | null
          einvoice_error: string | null
          einvoice_qr_code: string | null
          einvoice_status: string | null
          flat_discount_amount: number | null
          flat_discount_percent: number | null
          gross_amount: number | null
          id: string | null
          invoice_type: string | null
          irn: string | null
          net_amount: number | null
          notes: string | null
          organization_id: string | null
          other_charges: number | null
          paid_amount: number | null
          payment_date: string | null
          payment_method: string | null
          payment_status: string | null
          payment_term: string | null
          points_redeemed_amount: number | null
          refund_amount: number | null
          resolved_address: string | null
          resolved_customer_name: string | null
          resolved_email: string | null
          resolved_phone: string | null
          round_off: number | null
          sale_date: string | null
          sale_number: string | null
          sale_return_adjust: number | null
          sale_type: string | null
          salesman: string | null
          shipping_address: string | null
          shipping_instructions: string | null
          signed_invoice: string | null
          signed_qr_code: string | null
          terms_conditions: string | null
          total_qty: number | null
          updated_at: string | null
          upi_amount: number | null
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
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_dashboard_counts: {
        Row: {
          customer_count: number | null
          organization_id: string | null
          product_count: number | null
          supplier_count: number | null
        }
        Insert: {
          customer_count?: never
          organization_id?: string | null
          product_count?: never
          supplier_count?: never
        }
        Update: {
          customer_count?: never
          organization_id?: string | null
          product_count?: never
          supplier_count?: never
        }
        Relationships: []
      }
      v_dashboard_gross_profit: {
        Row: {
          gross_margin_percent: number | null
          gross_profit: number | null
          organization_id: string | null
          sale_day: string | null
          total_cost_amount: number | null
          total_sale_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_dashboard_purchase_returns: {
        Row: {
          organization_id: string | null
          return_count: number | null
          return_day: string | null
          total_returns: number | null
        }
        Relationships: []
      }
      v_dashboard_purchase_summary: {
        Row: {
          bill_count: number | null
          organization_id: string | null
          purchase_day: string | null
          total_items_purchased: number | null
          total_paid_amount: number | null
          total_pending_amount: number | null
          total_purchase_amount: number | null
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
            foreignKeyName: "purchase_bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_dashboard_receivables: {
        Row: {
          organization_id: string | null
          pending_count: number | null
          total_receivables: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_dashboard_sale_returns: {
        Row: {
          organization_id: string | null
          return_count: number | null
          return_day: string | null
          total_returns: number | null
        }
        Relationships: []
      }
      v_dashboard_sales_summary: {
        Row: {
          invoice_count: number | null
          organization_id: string | null
          sale_day: string | null
          sold_qty: number | null
          total_cash: number | null
          total_paid: number | null
          total_sales: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
      v_dashboard_stock_summary: {
        Row: {
          organization_id: string | null
          total_sale_value: number | null
          total_stock_qty: number | null
          total_stock_value: number | null
          total_variant_count: number | null
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
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_counts"
            referencedColumns: ["organization_id"]
          },
        ]
      }
    }
    Functions: {
      aggregate_and_cleanup_whatsapp_logs: { Args: never; Returns: undefined }
      apply_credit_note_to_sale: {
        Args: {
          p_apply_amount: number
          p_customer_id: string
          p_organization_id: string
          p_sale_id: string
        }
        Returns: Json
      }
      apply_customer_advance_to_sale: {
        Args: {
          p_advance_id: string
          p_apply_amount: number
          p_organization_id: string
          p_sale_id: string
        }
        Returns: Json
      }
      cancel_invoice: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: Json
      }
      cancel_purchase_bill: {
        Args: { p_bill_id: string; p_reason?: string }
        Returns: Json
      }
      check_barcode_duplicate: {
        Args: {
          p_barcode: string
          p_exclude_variant_id?: string
          p_org_id: string
        }
        Returns: {
          barcode: string
          color: string
          product_name: string
          size: string
          stock_qty: number
          variant_id: string
        }[]
      }
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
      delete_child_rows_for_org: {
        Args: {
          p_child_table: string
          p_fk_column: string
          p_organization_id: string
          p_parent_table: string
        }
        Returns: number
      }
      delete_fee_receipt: {
        Args: { p_organization_id: string; p_receipt_id: string }
        Returns: undefined
      }
      detect_stock_discrepancies: {
        Args: { p_organization_id?: string }
        Returns: {
          color: string
          current_stock: number
          discrepancy: number
          expected_stock: number
          last_purchase: string
          last_sale: string
          product_name: string
          size: string
          variant_id: string
        }[]
      }
      fix_stock_discrepancies: {
        Args: { p_organization_id: string }
        Returns: {
          details: Json
          fixed_count: number
        }[]
      }
      generate_advance_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_challan_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_credit_note_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_custom_pos_number: {
        Args: {
          p_format: string
          p_min_sequence?: number
          p_month: string
          p_organization_id: string
          p_year: string
        }
        Returns: string
      }
      generate_custom_sale_number: {
        Args: {
          p_format: string
          p_min_sequence?: number
          p_month: string
          p_organization_id: string
          p_year: string
        }
        Returns: string
      }
      generate_delivery_challan_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_fee_receipt_number: {
        Args: {
          p_fy_end_year?: number
          p_fy_start_year?: number
          p_organization_id: string
        }
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
      generate_pos_number_atomic: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_purchase_bill_number:
        | {
            Args: { p_date?: string; p_organization_id?: string }
            Returns: string
          }
        | { Args: { p_organization_id: string }; Returns: string }
      generate_purchase_bill_number_atomic: {
        Args: { p_organization_id: string }
        Returns: string
      }
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
      generate_receipt_number: {
        Args: { p_organization_id: string }
        Returns: string
      }
      generate_sale_number: {
        Args: { p_organization_id: string; p_prefix?: string }
        Returns: string
      }
      generate_sale_number_atomic: {
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
      get_accounts_dashboard_metrics: {
        Args: { p_month_end: string; p_month_start: string; p_org_id: string }
        Returns: Json
      }
      get_accounts_dashboard_stats: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_customer_ledger_statement: {
        Args: {
          p_customer_id: string
          p_end_date?: string
          p_organization_id: string
          p_start_date?: string
        }
        Returns: {
          credit: number
          debit: number
          id: string
          particulars: string
          running_balance: number
          transaction_date: string
          voucher_no: string
          voucher_type: string
        }[]
      }
      get_erp_dashboard_stats: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: Json
      }
      get_expense_by_category: {
        Args: { p_from_date: string; p_org_id: string; p_to_date: string }
        Returns: Json
      }
      get_gst_summary: {
        Args: {
          p_from_date: string
          p_organization_id: string
          p_to_date: string
        }
        Returns: {
          cgst_amount: number
          gst_percent: number
          igst_amount: number
          invoice_count: number
          sgst_amount: number
          taxable_amount: number
          total_amount: number
        }[]
      }
      get_item_sales_summary: {
        Args: {
          p_customer_name?: string
          p_end_date: string
          p_organization_id: string
          p_start_date: string
        }
        Returns: Json
      }
      get_net_profit_aggregates: {
        Args: { p_from_date: string; p_org_id: string; p_to_date: string }
        Returns: Json
      }
      get_org_public_info: { Args: { p_slug: string }; Returns: Json }
      get_org_whatsapp_stats: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          delivered_count: number
          failed_count: number
          organization_id: string
          organization_name: string
          pending_count: number
          read_count: number
          sent_count: number
          total_count: number
        }[]
      }
      get_outstanding_summary: { Args: { p_org_id: string }; Returns: Json }
      get_pnl_aggregates: {
        Args: { p_from_date: string; p_org_id: string; p_to_date: string }
        Returns: Json
      }
      get_product_catalog_page: {
        Args: {
          p_category?: string
          p_max_price?: number
          p_min_price?: number
          p_org_id: string
          p_page?: number
          p_page_size?: number
          p_product_type?: string
          p_search?: string
          p_size_group_id?: string
          p_stock_level?: string
        }
        Returns: {
          brand: string
          category: string
          color: string
          default_pur_price: number
          default_sale_price: number
          gst_per: number
          hsn_code: string
          image_url: string
          product_id: string
          product_name: string
          product_type: string
          size_group_id: string
          status: string
          style: string
          total_count: number
          total_stock: number
          variant_count: number
        }[]
      }
      get_product_dashboard_stats: {
        Args: {
          p_category?: string
          p_max_price?: number
          p_min_price?: number
          p_org_id: string
          p_product_type?: string
          p_search?: string
          p_size_group_id?: string
          p_stock_level?: string
        }
        Returns: Json
      }
      get_product_relations: {
        Args: { p_product_id: string }
        Returns: {
          record_count: number
          relation_type: string
          sample_references: string[]
        }[]
      }
      get_purchase_summary: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: Json
      }
      get_quotation_summary: { Args: { p_org_id: string }; Returns: Json }
      get_sales_invoice_dashboard_stats: {
        Args: {
          p_date_end?: string
          p_date_start?: string
          p_delivery_status?: string
          p_org_id: string
          p_payment_status?: string
          p_search?: string
        }
        Returns: Json
      }
      get_sales_report_summary: {
        Args: {
          p_customer_id?: string
          p_end_date?: string
          p_organization_id: string
          p_start_date?: string
        }
        Returns: Json
      }
      get_sales_summary: {
        Args: { p_end_date: string; p_org_id: string; p_start_date: string }
        Returns: Json
      }
      get_stock_at_time: {
        Args: { p_timestamp: string; p_variant_id: string }
        Returns: number
      }
      get_stock_at_time_batch: {
        Args: { p_timestamp: string; p_variant_ids: string[] }
        Returns: {
          stock_at_time: number
          variant_id: string
        }[]
      }
      get_stock_report_totals: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_stock_value: { Args: { p_org_id: string }; Returns: number }
      get_trial_balance_aggregates: {
        Args: { p_as_of_date: string; p_org_id: string }
        Returns: Json
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
      merge_products: {
        Args: { p_source_product_id: string; p_target_product_id: string }
        Returns: Json
      }
      merge_suppliers: {
        Args: { p_source_supplier_id: string; p_target_supplier_id: string }
        Returns: Json
      }
      peek_fee_receipt_number: {
        Args: {
          p_fy_end_year?: number
          p_fy_start_year?: number
          p_organization_id: string
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
      platform_create_organization:
        | {
            Args: {
              p_admin_email?: string
              p_enabled_features?: string[]
              p_name: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_admin_email?: string
              p_enabled_features?: string[]
              p_name: string
              p_organization_type?: string
            }
            Returns: Json
          }
      purge_all_old_backup_logs: { Args: never; Returns: Json }
      purge_old_audit_logs: { Args: never; Returns: Json }
      purge_old_backup_logs: {
        Args: { p_days: number; p_org_id: string }
        Returns: number
      }
      reconcile_customer_balances: {
        Args: { p_organization_id: string }
        Returns: {
          advance_available: number
          calculated_balance: number
          customer_id: string
          customer_name: string
          notes: string
          phone: string
          total_advance_used: number
          total_advances: number
          total_cash_payments: number
          total_invoices: number
          total_refunds_paid: number
          total_sale_returns: number
        }[]
      }
      reconcile_variant_stock_qty: {
        Args: { p_variant_id: string }
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
      scan_stock_alerts_all_orgs: {
        Args: never
        Returns: {
          new_alerts: number
          org_name: string
          organization_id: string
          resolved_alerts: number
          updated_alerts: number
        }[]
      }
      scan_stock_alerts_for_org: {
        Args: { p_organization_id: string }
        Returns: {
          new_alerts: number
          resolved_alerts: number
          updated_alerts: number
        }[]
      }
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
      update_purchase_return_items: {
        Args: { p_items: Json; p_return_id: string }
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
