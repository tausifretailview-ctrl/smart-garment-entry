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
      barcode_sequence: {
        Row: {
          id: number
          next_barcode: number
          updated_at: string | null
        }
        Insert: {
          id?: number
          next_barcode?: number
          updated_at?: string | null
        }
        Update: {
          id?: number
          next_barcode?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      batch_stock: {
        Row: {
          bill_number: string
          created_at: string | null
          id: string
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
          purchase_bill_id?: string | null
          purchase_date?: string
          quantity?: number
          updated_at?: string | null
          variant_id?: string
        }
        Relationships: [
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
          updated_at: string | null
          year: number
        }
        Insert: {
          id?: number
          month: number
          next_sequence?: number
          updated_at?: string | null
          year: number
        }
        Update: {
          id?: number
          month?: number
          next_sequence?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          created_at: string | null
          customer_name: string
          email: string | null
          gst_number: string | null
          id: string
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
          settings: Json
          subscription_tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_features?: Json
          id?: string
          name: string
          settings?: Json
          subscription_tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_features?: Json
          id?: string
          name?: string
          settings?: Json
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
          product_id?: string
          pur_price?: number | null
          sale_price?: number | null
          size?: string
          stock_qty?: number
          updated_at?: string | null
        }
        Relationships: [
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
          created_at: string
          gst_per: number
          hsn_code: string | null
          id: string
          line_total: number
          product_id: string
          pur_price: number
          qty: number
          sale_price: number
          size: string
          sku_id: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          bill_id: string
          bill_number?: string | null
          created_at?: string
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          product_id: string
          pur_price?: number
          qty?: number
          sale_price?: number
          size: string
          sku_id?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          bill_id?: string
          bill_number?: string | null
          created_at?: string
          gst_per?: number
          hsn_code?: string | null
          id?: string
          line_total?: number
          product_id?: string
          pur_price?: number
          qty?: number
          sale_price?: number
          size?: string
          sku_id?: string | null
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
      sales: {
        Row: {
          created_at: string
          created_by: string | null
          customer_address: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
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
          payment_date: string | null
          payment_method: string
          payment_status: string
          payment_term: string | null
          round_off: number
          sale_date: string
          sale_number: string
          sale_type: string
          shipping_address: string | null
          shipping_instructions: string | null
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
          due_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          payment_date?: string | null
          payment_method: string
          payment_status?: string
          payment_term?: string | null
          round_off?: number
          sale_date?: string
          sale_number: string
          sale_type: string
          shipping_address?: string | null
          shipping_instructions?: string | null
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
          due_date?: string | null
          flat_discount_amount?: number
          flat_discount_percent?: number
          gross_amount?: number
          id?: string
          invoice_type?: string | null
          net_amount?: number
          notes?: string | null
          organization_id?: string | null
          payment_date?: string | null
          payment_method?: string
          payment_status?: string
          payment_term?: string | null
          round_off?: number
          sale_date?: string
          sale_number?: string
          sale_type?: string
          shipping_address?: string | null
          shipping_instructions?: string | null
          terms_conditions?: string | null
          updated_at?: string
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
          organization_id: string | null
          sizes: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          group_name: string
          id?: string
          organization_id?: string | null
          sizes?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          group_name?: string
          id?: string
          organization_id?: string | null
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
          quantity?: number
          reference_id?: string | null
          variant_id?: string
        }
        Relationships: [
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
          organization_id: string | null
          phone: string | null
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
          organization_id?: string | null
          phone?: string | null
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
          organization_id?: string | null
          phone?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_next_barcode: { Args: never; Returns: string }
      generate_purchase_bill_number: {
        Args: { p_date?: string }
        Returns: string
      }
      generate_sale_number: { Args: never; Returns: string }
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
      user_belongs_to_org: {
        Args: { org_id: string; user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
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
      app_role: ["admin", "manager", "user"],
      subscription_tier: ["free", "basic", "professional", "enterprise"],
    },
  },
} as const
