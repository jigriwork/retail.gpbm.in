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
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_chats: {
        Row: {
          content: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_memories: {
        Row: {
          content: string
          created_at: string | null
          id: string
          importance: number | null
          is_active: boolean | null
          memory_type: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          importance?: number | null
          is_active?: boolean | null
          memory_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          importance?: number | null
          is_active?: boolean | null
          memory_type?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      cleaning_reviews: {
        Row: {
          ac_fan_working: boolean | null
          billing_counter_clean: boolean | null
          created_at: string | null
          entry_clean: boolean | null
          floor_clean: boolean | null
          id: string
          lights_working: boolean | null
          mirrors_clean: boolean | null
          photo_path: string | null
          racks_clean: boolean | null
          remarks: string | null
          review_date: string | null
          reviewed_by: string | null
          staff_grooming_ok: boolean | null
          store_id: string | null
          store_smell_fresh: boolean | null
          trial_room_clean: boolean | null
        }
        Insert: {
          ac_fan_working?: boolean | null
          billing_counter_clean?: boolean | null
          created_at?: string | null
          entry_clean?: boolean | null
          floor_clean?: boolean | null
          id?: string
          lights_working?: boolean | null
          mirrors_clean?: boolean | null
          photo_path?: string | null
          racks_clean?: boolean | null
          remarks?: string | null
          review_date?: string | null
          reviewed_by?: string | null
          staff_grooming_ok?: boolean | null
          store_id?: string | null
          store_smell_fresh?: boolean | null
          trial_room_clean?: boolean | null
        }
        Update: {
          ac_fan_working?: boolean | null
          billing_counter_clean?: boolean | null
          created_at?: string | null
          entry_clean?: boolean | null
          floor_clean?: boolean | null
          id?: string
          lights_working?: boolean | null
          mirrors_clean?: boolean | null
          photo_path?: string | null
          racks_clean?: boolean | null
          remarks?: string | null
          review_date?: string | null
          reviewed_by?: string | null
          staff_grooming_ok?: boolean | null
          store_id?: string | null
          store_smell_fresh?: boolean | null
          trial_room_clean?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_contacts: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          normalized_phone: string | null
          normalized_staff_name: string
          notes: string | null
          phone: string | null
          staff_name: string
          store_id: string | null
          updated_at: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          normalized_phone?: string | null
          normalized_staff_name: string
          notes?: string | null
          phone?: string | null
          staff_name: string
          store_id?: string | null
          updated_at?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          normalized_phone?: string | null
          normalized_staff_name?: string
          notes?: string | null
          phone?: string | null
          staff_name?: string
          store_id?: string | null
          updated_at?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_contacts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_payslips: {
        Row: {
          batch_id: string | null
          created_at: string | null
          employee_phone: string | null
          firm_name: string
          id: string
          payslip_row_id: string | null
          pdf_file_name: string | null
          pdf_file_path: string | null
          salary_month: string
          staff_name: string
          status: string | null
          store_id: string | null
          store_name: string
          whatsapp_phone: string | null
          zip_file_path: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          employee_phone?: string | null
          firm_name: string
          id?: string
          payslip_row_id?: string | null
          pdf_file_name?: string | null
          pdf_file_path?: string | null
          salary_month: string
          staff_name: string
          status?: string | null
          store_id?: string | null
          store_name: string
          whatsapp_phone?: string | null
          zip_file_path?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          employee_phone?: string | null
          firm_name?: string
          id?: string
          payslip_row_id?: string | null
          pdf_file_name?: string | null
          pdf_file_path?: string | null
          salary_month?: string
          staff_name?: string
          status?: string | null
          store_id?: string | null
          store_name?: string
          whatsapp_phone?: string | null
          zip_file_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_payslips_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payslip_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_payslips_payslip_row_id_fkey"
            columns: ["payslip_row_id"]
            isOneToOne: false
            referencedRelation: "payslip_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_payslips_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      life_logs: {
        Row: {
          created_at: string | null
          energy: string | null
          gym_done: boolean | null
          id: string
          log_date: string | null
          mood: string | null
          no_useless_scrolling: boolean | null
          notes: string | null
          sleep_quality: string | null
          sleep_time: string | null
          sports_done: boolean | null
          updated_at: string | null
          user_id: string | null
          wake_time: string | null
        }
        Insert: {
          created_at?: string | null
          energy?: string | null
          gym_done?: boolean | null
          id?: string
          log_date?: string | null
          mood?: string | null
          no_useless_scrolling?: boolean | null
          notes?: string | null
          sleep_quality?: string | null
          sleep_time?: string | null
          sports_done?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          wake_time?: string | null
        }
        Update: {
          created_at?: string | null
          energy?: string | null
          gym_done?: boolean | null
          id?: string
          log_date?: string | null
          mood?: string | null
          no_useless_scrolling?: boolean | null
          notes?: string | null
          sleep_quality?: string | null
          sleep_time?: string | null
          sports_done?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          wake_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "life_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_updates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          created_task_id: string | null
          details: string | null
          id: string
          photo_path: string | null
          status: string | null
          store_id: string | null
          title: string
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          created_task_id?: string | null
          details?: string | null
          id?: string
          photo_path?: string | null
          status?: string | null
          store_id?: string | null
          title: string
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          created_task_id?: string | null
          details?: string | null
          id?: string
          photo_path?: string | null
          status?: string | null
          store_id?: string | null
          title?: string
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manager_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_updates_created_task_id_fkey"
            columns: ["created_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_updates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_batches: {
        Row: {
          created_at: string | null
          generated_count: number | null
          id: string
          salary_month: string
          source_file_name: string | null
          source_file_path: string | null
          status: string | null
          summary: Json | null
          total_rows: number | null
          updated_at: string | null
          uploaded_by: string | null
          valid_rows: number | null
          warning_count: number | null
        }
        Insert: {
          created_at?: string | null
          generated_count?: number | null
          id?: string
          salary_month: string
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string | null
          summary?: Json | null
          total_rows?: number | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_rows?: number | null
          warning_count?: number | null
        }
        Update: {
          created_at?: string | null
          generated_count?: number | null
          id?: string
          salary_month?: string
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string | null
          summary?: Json | null
          total_rows?: number | null
          updated_at?: string | null
          uploaded_by?: string | null
          valid_rows?: number | null
          warning_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslip_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_rows: {
        Row: {
          abs_amount: number | null
          abs_days: number | null
          advance: number | null
          batch_id: string | null
          calculated_total_amount: number | null
          commission: number | null
          created_at: string | null
          divided_by_days: number | null
          employee_phone: string | null
          firm_name: string
          id: string
          net_payable: number | null
          raw_data: Json | null
          salary_amount: number | null
          salary_month: string
          staff_name: string | null
          status: string | null
          store_id: string | null
          store_name: string
          sunday_pay: number | null
          sunday_pay_amount: number | null
          sunday_present: number | null
          updated_at: string | null
          uploaded_total_amount: number | null
          warning_message: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          abs_amount?: number | null
          abs_days?: number | null
          advance?: number | null
          batch_id?: string | null
          calculated_total_amount?: number | null
          commission?: number | null
          created_at?: string | null
          divided_by_days?: number | null
          employee_phone?: string | null
          firm_name: string
          id?: string
          net_payable?: number | null
          raw_data?: Json | null
          salary_amount?: number | null
          salary_month: string
          staff_name?: string | null
          status?: string | null
          store_id?: string | null
          store_name: string
          sunday_pay?: number | null
          sunday_pay_amount?: number | null
          sunday_present?: number | null
          updated_at?: string | null
          uploaded_total_amount?: number | null
          warning_message?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          abs_amount?: number | null
          abs_days?: number | null
          advance?: number | null
          batch_id?: string | null
          calculated_total_amount?: number | null
          commission?: number | null
          created_at?: string | null
          divided_by_days?: number | null
          employee_phone?: string | null
          firm_name?: string
          id?: string
          net_payable?: number | null
          raw_data?: Json | null
          salary_amount?: number | null
          salary_month?: string
          staff_name?: string | null
          status?: string | null
          store_id?: string | null
          store_name?: string
          sunday_pay?: number | null
          sunday_pay_amount?: number | null
          sunday_present?: number | null
          updated_at?: string | null
          uploaded_total_amount?: number | null
          warning_message?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payslip_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payslip_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_rows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      rack_reviews: {
        Row: {
          brand_display_proper: boolean | null
          created_at: string | null
          dust_free: boolean | null
          id: string
          lighting_ok: boolean | null
          new_stock_displayed: boolean | null
          photo_path: string | null
          premium_display_ok: boolean | null
          rack_arranged: boolean | null
          remarks: string | null
          review_date: string | null
          reviewed_by: string | null
          sizes_arranged: boolean | null
          store_id: string | null
        }
        Insert: {
          brand_display_proper?: boolean | null
          created_at?: string | null
          dust_free?: boolean | null
          id?: string
          lighting_ok?: boolean | null
          new_stock_displayed?: boolean | null
          photo_path?: string | null
          premium_display_ok?: boolean | null
          rack_arranged?: boolean | null
          remarks?: string | null
          review_date?: string | null
          reviewed_by?: string | null
          sizes_arranged?: boolean | null
          store_id?: string | null
        }
        Update: {
          brand_display_proper?: boolean | null
          created_at?: string | null
          dust_free?: boolean | null
          id?: string
          lighting_ok?: boolean | null
          new_stock_displayed?: boolean | null
          photo_path?: string | null
          premium_display_ok?: boolean | null
          rack_arranged?: boolean | null
          remarks?: string | null
          review_date?: string | null
          reviewed_by?: string | null
          sizes_arranged?: boolean | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rack_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rack_reviews_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          file_name: string | null
          file_path: string | null
          id: string
          period_month: string | null
          report_date: string | null
          report_type: string
          row_count: number | null
          status: string | null
          store_id: string | null
          summary: Json | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          period_month?: string | null
          report_date?: string | null
          report_type: string
          row_count?: number | null
          status?: string | null
          store_id?: string | null
          summary?: Json | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          period_month?: string | null
          report_date?: string | null
          report_type?: string
          row_count?: number | null
          status?: string | null
          store_id?: string | null
          summary?: Json | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_rows: {
        Row: {
          barcode: string | null
          bill_no: string | null
          brand: string | null
          category: string | null
          color: string | null
          created_at: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number | null
          id: string
          item_name: string | null
          mrp: number | null
          net_sale: number | null
          quantity: number | null
          raw_data: Json | null
          report_id: string | null
          sale_date: string | null
          size: string | null
          sku: string | null
          staff_name: string | null
          store_id: string | null
        }
        Insert: {
          barcode?: string | null
          bill_no?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          item_name?: string | null
          mrp?: number | null
          net_sale?: number | null
          quantity?: number | null
          raw_data?: Json | null
          report_id?: string | null
          sale_date?: string | null
          size?: string | null
          sku?: string | null
          staff_name?: string | null
          store_id?: string | null
        }
        Update: {
          barcode?: string | null
          bill_no?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number | null
          id?: string
          item_name?: string | null
          mrp?: number | null
          net_sale?: number | null
          quantity?: number | null
          raw_data?: Json | null
          report_id?: string | null
          sale_date?: string | null
          size?: string | null
          sku?: string | null
          staff_name?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_rows_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_rows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_rows: {
        Row: {
          ageing_days: number | null
          barcode: string | null
          brand: string | null
          category: string | null
          color: string | null
          cost_price: number | null
          created_at: string | null
          id: string
          item_name: string | null
          mrp: number | null
          purchase_date: string | null
          quantity: number | null
          raw_data: Json | null
          report_id: string | null
          size: string | null
          sku: string | null
          stock_month: string | null
          store_id: string | null
          supplier: string | null
        }
        Insert: {
          ageing_days?: number | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          item_name?: string | null
          mrp?: number | null
          purchase_date?: string | null
          quantity?: number | null
          raw_data?: Json | null
          report_id?: string | null
          size?: string | null
          sku?: string | null
          stock_month?: string | null
          store_id?: string | null
          supplier?: string | null
        }
        Update: {
          ageing_days?: number | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          item_name?: string | null
          mrp?: number | null
          purchase_date?: string | null
          quantity?: number | null
          raw_data?: Json | null
          report_id?: string | null
          size?: string | null
          sku?: string | null
          stock_month?: string | null
          store_id?: string | null
          supplier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_rows_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_rows_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_users: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          code: string
          created_at: string | null
          dead_stock_days: number | null
          firm_name: string | null
          id: string
          is_active: boolean | null
          location: string | null
          monthly_target: number | null
          monthly_target_enabled: boolean | null
          name: string
          slow_stock_days: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          dead_stock_days?: number | null
          firm_name?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          monthly_target?: number | null
          monthly_target_enabled?: boolean | null
          name: string
          slow_stock_days?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          dead_stock_days?: number | null
          firm_name?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          monthly_target?: number | null
          monthly_target_enabled?: boolean | null
          name?: string
          slow_stock_days?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          carry_forward: boolean | null
          category: string | null
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          due_time: string | null
          id: string
          is_private: boolean | null
          priority: string | null
          source: string | null
          status: string | null
          store_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          carry_forward?: boolean | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_private?: boolean | null
          priority?: string | null
          source?: string | null
          status?: string | null
          store_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          carry_forward?: boolean | null
          category?: string | null
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          due_time?: string | null
          id?: string
          is_private?: boolean | null
          priority?: string | null
          source?: string | null
          status?: string | null
          store_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_audits: {
        Row: {
          ai_summary: string | null
          created_at: string | null
          generated_by: string | null
          id: string
          store_id: string | null
          summary: Json | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string
          store_id?: string | null
          summary?: Json | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          ai_summary?: string | null
          created_at?: string | null
          generated_by?: string | null
          id?: string
          store_id?: string | null
          summary?: Json | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_audits_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_audits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_owner: { Args: never; Returns: boolean }
      user_store_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
