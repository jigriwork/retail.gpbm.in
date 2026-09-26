export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      upload_intents: {
        Row: {
          id: string
          actor_id: string
          store_id: string
          kind: string
          bucket: string
          file_path: string
          file_name: string
          mime_type: string
          byte_size: number
          fingerprint: string
          status: string
          expires_at: string
          created_at: string
          lease_id: string | null
          lease_until: string | null
          verified_at: string | null
          request_hash: string | null
          report_import_id: string | null
          payroll_import_id: string | null
          result: Json | null
          failure_message: string | null
        }
        Insert: {
          id?: string
          actor_id: string
          store_id: string
          kind: string
          bucket: string
          file_path: string
          file_name: string
          mime_type: string
          byte_size: number
          fingerprint: string
          status?: string
          expires_at?: string
          created_at?: string
          lease_id?: string | null
          lease_until?: string | null
          verified_at?: string | null
          request_hash?: string | null
          report_import_id?: string | null
          payroll_import_id?: string | null
          result?: Json | null
          failure_message?: string | null
        }
        Update: {
          id?: string
          actor_id?: string
          store_id?: string
          kind?: string
          bucket?: string
          file_path?: string
          file_name?: string
          mime_type?: string
          byte_size?: number
          fingerprint?: string
          status?: string
          expires_at?: string
          created_at?: string
          lease_id?: string | null
          lease_until?: string | null
          verified_at?: string | null
          request_hash?: string | null
          report_import_id?: string | null
          payroll_import_id?: string | null
          result?: Json | null
          failure_message?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "upload_intents_actor_id_fkey",
            "columns": [
              "actor_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "upload_intents_store_id_fkey",
            "columns": [
              "store_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stores",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "upload_intents_report_import_id_fkey",
            "columns": [
              "report_import_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "report_imports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "upload_intents_payroll_import_id_fkey",
            "columns": [
              "payroll_import_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_imports",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payslip_delivery_events: {
        Row: {
          id: string
          generated_id: string
          actor_id: string
          kind: string
          method: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          generated_id: string
          actor_id: string
          kind: string
          method: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          generated_id?: string
          actor_id?: string
          kind?: string
          method?: string
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "payslip_delivery_events_actor_id_fkey",
            "columns": [
              "actor_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_delivery_events_generated_id_fkey",
            "columns": [
              "generated_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "generated_payslips",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payslip_pdf_jobs: {
        Row: {
          id: string
          row_id: string
          actor_id: string
          previous_id: string | null
          file_path: string
          row_snapshot: Json
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          row_id: string
          actor_id: string
          previous_id?: string | null
          file_path: string
          row_snapshot: Json
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          row_id?: string
          actor_id?: string
          previous_id?: string | null
          file_path?: string
          row_snapshot?: Json
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "payslip_pdf_jobs_actor_id_fkey",
            "columns": [
              "actor_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_pdf_jobs_previous_id_fkey",
            "columns": [
              "previous_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "generated_payslips",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_pdf_jobs_row_id_fkey",
            "columns": [
              "row_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_rows",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payroll_imports: {
        Row: {
          id: string
          actor_id: string
          salary_month: string
          source_label: string
          fingerprint: string
          scope: string[]
          file_name: string
          file_path: string
          rows: Json
          comparison: Json
          comparison_token: string
          status: string
          batch_id: string | null
          failure_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          salary_month: string
          source_label: string
          fingerprint: string
          scope: string[]
          file_name: string
          file_path: string
          rows: Json
          comparison: Json
          comparison_token: string
          status?: string
          batch_id?: string | null
          failure_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          actor_id?: string
          salary_month?: string
          source_label?: string
          fingerprint?: string
          scope?: string[]
          file_name?: string
          file_path?: string
          rows?: Json
          comparison?: Json
          comparison_token?: string
          status?: string
          batch_id?: string | null
          failure_message?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "payroll_imports_actor_id_fkey",
            "columns": [
              "actor_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payroll_imports_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_batches",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payroll_run_versions: {
        Row: {
          id: string
          run_id: string
          batch_id: string
          previous_id: string | null
          fingerprint: string
          is_current: boolean
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          batch_id: string
          previous_id?: string | null
          fingerprint: string
          is_current?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          batch_id?: string
          previous_id?: string | null
          fingerprint?: string
          is_current?: boolean
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "payroll_run_versions_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payroll_run_versions_previous_id_fkey",
            "columns": [
              "previous_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_run_versions",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payroll_run_versions_run_id_fkey",
            "columns": [
              "run_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_runs",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payroll_runs: {
        Row: {
          id: string
          store_id: string
          firm_name: string
          salary_month: string
          source_label: string
        }
        Insert: {
          id?: string
          store_id: string
          firm_name: string
          salary_month: string
          source_label: string
        }
        Update: {
          id?: string
          store_id?: string
          firm_name?: string
          salary_month?: string
          source_label?: string
        }
        Relationships: [
          {
            "foreignKeyName": "payroll_runs_store_id_fkey",
            "columns": [
              "store_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stores",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
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
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          period_month: string | null
          report_date: string | null
          store_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          period_month?: string | null
          report_date?: string | null
          store_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          period_month?: string | null
          report_date?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
          designation: string | null
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
          designation?: string | null
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
          designation?: string | null
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
          employee_contact_id: string | null
          id: string
          batch_id: string | null
          payslip_row_id: string | null
          store_id: string | null
          staff_name: string
          firm_name: string
          store_name: string
          salary_month: string
          pdf_file_name: string | null
          pdf_file_path: string | null
          zip_file_path: string | null
          status: string | null
          created_at: string | null
          employee_phone: string | null
          whatsapp_phone: string | null
          sent_status: string | null
          sent_method: string | null
          sent_at: string | null
          sent_by: string | null
          sent_note: string | null
          last_share_attempt_at: string | null
          last_share_method: string | null
          is_current: boolean
          supersedes_id: string | null
        }
        Insert: {
          employee_contact_id?: string | null
          id?: string
          batch_id?: string | null
          payslip_row_id?: string | null
          store_id?: string | null
          staff_name: string
          firm_name: string
          store_name: string
          salary_month: string
          pdf_file_name?: string | null
          pdf_file_path?: string | null
          zip_file_path?: string | null
          status?: string | null
          created_at?: string | null
          employee_phone?: string | null
          whatsapp_phone?: string | null
          sent_status?: string | null
          sent_method?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_note?: string | null
          last_share_attempt_at?: string | null
          last_share_method?: string | null
          is_current?: boolean
          supersedes_id?: string | null
        }
        Update: {
          employee_contact_id?: string | null
          id?: string
          batch_id?: string | null
          payslip_row_id?: string | null
          store_id?: string | null
          staff_name?: string
          firm_name?: string
          store_name?: string
          salary_month?: string
          pdf_file_name?: string | null
          pdf_file_path?: string | null
          zip_file_path?: string | null
          status?: string | null
          created_at?: string | null
          employee_phone?: string | null
          whatsapp_phone?: string | null
          sent_status?: string | null
          sent_method?: string | null
          sent_at?: string | null
          sent_by?: string | null
          sent_note?: string | null
          last_share_attempt_at?: string | null
          last_share_method?: string | null
          is_current?: boolean
          supersedes_id?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "generated_payslips_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "generated_payslips_payslip_row_id_fkey",
            "columns": [
              "payslip_row_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_rows",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "generated_payslips_sent_by_fkey",
            "columns": [
              "sent_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "generated_payslips_store_id_fkey",
            "columns": [
              "store_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stores",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "generated_payslips_supersedes_id_fkey",
            "columns": [
              "supersedes_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "generated_payslips",
            "referencedColumns": [
              "id"
            ]
          }
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
          id: string
          uploaded_by: string | null
          salary_month: string
          source_file_name: string | null
          source_file_path: string | null
          status: string | null
          total_rows: number | null
          valid_rows: number | null
          warning_count: number | null
          generated_count: number | null
          summary: Json | null
          created_at: string | null
          updated_at: string | null
          payroll_import_id: string | null
        }
        Insert: {
          id?: string
          uploaded_by?: string | null
          salary_month: string
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string | null
          total_rows?: number | null
          valid_rows?: number | null
          warning_count?: number | null
          generated_count?: number | null
          summary?: Json | null
          created_at?: string | null
          updated_at?: string | null
          payroll_import_id?: string | null
        }
        Update: {
          id?: string
          uploaded_by?: string | null
          salary_month?: string
          source_file_name?: string | null
          source_file_path?: string | null
          status?: string | null
          total_rows?: number | null
          valid_rows?: number | null
          warning_count?: number | null
          generated_count?: number | null
          summary?: Json | null
          created_at?: string | null
          updated_at?: string | null
          payroll_import_id?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "payslip_batches_payroll_import_id_fkey",
            "columns": [
              "payroll_import_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_imports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_batches_uploaded_by_fkey",
            "columns": [
              "uploaded_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      payslip_rows: {
        Row: {
          employee_contact_id: string | null
          id: string
          batch_id: string | null
          store_id: string | null
          firm_name: string
          store_name: string
          salary_month: string
          staff_name: string | null
          salary_amount: number | null
          divided_by_days: number | null
          abs_days: number | null
          abs_amount: number | null
          sunday_pay: number | null
          sunday_present: number | null
          sunday_pay_amount: number | null
          advance: number | null
          commission: number | null
          uploaded_total_amount: number | null
          calculated_total_amount: number | null
          net_payable: number | null
          warning_message: string | null
          status: string | null
          raw_data: Json | null
          created_at: string | null
          updated_at: string | null
          employee_phone: string | null
          whatsapp_phone: string | null
          payroll_version_id: string | null
        }
        Insert: {
          employee_contact_id?: string | null
          id?: string
          batch_id?: string | null
          store_id?: string | null
          firm_name: string
          store_name: string
          salary_month: string
          staff_name?: string | null
          salary_amount?: number | null
          divided_by_days?: number | null
          abs_days?: number | null
          abs_amount?: number | null
          sunday_pay?: number | null
          sunday_present?: number | null
          sunday_pay_amount?: number | null
          advance?: number | null
          commission?: number | null
          uploaded_total_amount?: number | null
          calculated_total_amount?: number | null
          net_payable?: number | null
          warning_message?: string | null
          status?: string | null
          raw_data?: Json | null
          created_at?: string | null
          updated_at?: string | null
          employee_phone?: string | null
          whatsapp_phone?: string | null
          payroll_version_id?: string | null
        }
        Update: {
          employee_contact_id?: string | null
          id?: string
          batch_id?: string | null
          store_id?: string | null
          firm_name?: string
          store_name?: string
          salary_month?: string
          staff_name?: string | null
          salary_amount?: number | null
          divided_by_days?: number | null
          abs_days?: number | null
          abs_amount?: number | null
          sunday_pay?: number | null
          sunday_present?: number | null
          sunday_pay_amount?: number | null
          advance?: number | null
          commission?: number | null
          uploaded_total_amount?: number | null
          calculated_total_amount?: number | null
          net_payable?: number | null
          warning_message?: string | null
          status?: string | null
          raw_data?: Json | null
          created_at?: string | null
          updated_at?: string | null
          employee_phone?: string | null
          whatsapp_phone?: string | null
          payroll_version_id?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "payslip_rows_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_rows_payroll_version_id_fkey",
            "columns": [
              "payroll_version_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_run_versions",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "payslip_rows_store_id_fkey",
            "columns": [
              "store_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stores",
            "referencedColumns": [
              "id"
            ]
          }
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
      report_import_chunks: {
        Row: {
          chunk_no: number
          import_id: string
          rows: Json
        }
        Insert: {
          chunk_no: number
          import_id: string
          rows: Json
        }
        Update: {
          chunk_no?: number
          import_id?: string
          rows?: Json
        }
        Relationships: [
          {
            foreignKeyName: "report_import_chunks_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "report_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_imports: {
        Row: {
          actor_id: string
          created_at: string
          failure_message: string | null
          file_name: string
          file_path: string
          fingerprint: string
          id: string
          is_bulk: boolean
          manifest: Json
          mode: string
          report_type: string
          result: Json | null
          status: string
          store_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          failure_message?: string | null
          file_name: string
          file_path: string
          fingerprint: string
          id?: string
          is_bulk?: boolean
          manifest: Json
          mode: string
          report_type: string
          result?: Json | null
          status?: string
          store_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          failure_message?: string | null
          file_name?: string
          file_path?: string
          fingerprint?: string
          id?: string
          is_bulk?: boolean
          manifest?: Json
          mode?: string
          report_type?: string
          result?: Json | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_imports_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_imports_store_id_fkey"
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
          import_id: string | null
          is_current: boolean
          period_month: string | null
          replaces_report_id: string | null
          report_date: string | null
          report_type: string
          row_count: number | null
          sales_upload_batch_id: string | null
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
          import_id?: string | null
          is_current?: boolean
          period_month?: string | null
          replaces_report_id?: string | null
          report_date?: string | null
          report_type: string
          row_count?: number | null
          sales_upload_batch_id?: string | null
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
          import_id?: string | null
          is_current?: boolean
          period_month?: string | null
          replaces_report_id?: string | null
          report_date?: string | null
          report_type?: string
          row_count?: number | null
          sales_upload_batch_id?: string | null
          status?: string | null
          store_id?: string | null
          summary?: Json | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "report_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_replaces_report_id_fkey"
            columns: ["replaces_report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_sales_upload_batch_id_fkey"
            columns: ["sales_upload_batch_id"]
            isOneToOne: false
            referencedRelation: "sales_upload_batches"
            referencedColumns: ["id"]
          },
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
      salary_receivables: {
        Row: {
          id: string
          payslip_row_id: string | null
          generated_payslip_id: string | null
          batch_id: string | null
          store_id: string | null
          staff_name: string
          normalized_staff_name: string | null
          firm_name: string | null
          store_name: string | null
          salary_month: string
          net_payable: number
          receivable_amount: number
          received_amount: number | null
          balance_amount: number
          status: string | null
          received_at: string | null
          received_by: string | null
          note: string | null
          created_at: string | null
          updated_at: string | null
          payroll_version_id: string | null
          is_current: boolean
        }
        Insert: {
          id?: string
          payslip_row_id?: string | null
          generated_payslip_id?: string | null
          batch_id?: string | null
          store_id?: string | null
          staff_name: string
          normalized_staff_name?: string | null
          firm_name?: string | null
          store_name?: string | null
          salary_month: string
          net_payable: number
          receivable_amount: number
          received_amount?: number | null
          balance_amount: number
          status?: string | null
          received_at?: string | null
          received_by?: string | null
          note?: string | null
          created_at?: string | null
          updated_at?: string | null
          payroll_version_id?: string | null
          is_current?: boolean
        }
        Update: {
          id?: string
          payslip_row_id?: string | null
          generated_payslip_id?: string | null
          batch_id?: string | null
          store_id?: string | null
          staff_name?: string
          normalized_staff_name?: string | null
          firm_name?: string | null
          store_name?: string | null
          salary_month?: string
          net_payable?: number
          receivable_amount?: number
          received_amount?: number | null
          balance_amount?: number
          status?: string | null
          received_at?: string | null
          received_by?: string | null
          note?: string | null
          created_at?: string | null
          updated_at?: string | null
          payroll_version_id?: string | null
          is_current?: boolean
        }
        Relationships: [
          {
            "foreignKeyName": "salary_receivables_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payslip_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "salary_receivables_generated_payslip_id_fkey",
            "columns": [
              "generated_payslip_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "generated_payslips",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "salary_receivables_payroll_version_id_fkey",
            "columns": [
              "payroll_version_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "payroll_run_versions",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "salary_receivables_payslip_row_id_fkey",
            "columns": [
              "payslip_row_id"
            ],
            "isOneToOne": true,
            "referencedRelation": "payslip_rows",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "salary_receivables_received_by_fkey",
            "columns": [
              "received_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "salary_receivables_store_id_fkey",
            "columns": [
              "store_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stores",
            "referencedColumns": [
              "id"
            ]
          }
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
      sales_upload_batches: {
        Row: {
          created_at: string | null
          detected_end_date: string | null
          detected_start_date: string | null
          failed_dates: number | null
          file_path: string | null
          id: string
          imported_dates: number | null
          original_file_name: string | null
          replaced_dates: number | null
          skipped_dates: number | null
          status: string | null
          store_id: string
          summary: Json | null
          total_bills: number | null
          total_dates: number | null
          total_net_sale: number | null
          total_quantity: number | null
          total_rows: number | null
          unmatched_staff_count: number | null
          updated_at: string | null
          upload_mode: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          detected_end_date?: string | null
          detected_start_date?: string | null
          failed_dates?: number | null
          file_path?: string | null
          id?: string
          imported_dates?: number | null
          original_file_name?: string | null
          replaced_dates?: number | null
          skipped_dates?: number | null
          status?: string | null
          store_id: string
          summary?: Json | null
          total_bills?: number | null
          total_dates?: number | null
          total_net_sale?: number | null
          total_quantity?: number | null
          total_rows?: number | null
          unmatched_staff_count?: number | null
          updated_at?: string | null
          upload_mode?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          detected_end_date?: string | null
          detected_start_date?: string | null
          failed_dates?: number | null
          file_path?: string | null
          id?: string
          imported_dates?: number | null
          original_file_name?: string | null
          replaced_dates?: number | null
          skipped_dates?: number | null
          status?: string | null
          store_id?: string
          summary?: Json | null
          total_bills?: number | null
          total_dates?: number | null
          total_net_sale?: number | null
          total_quantity?: number | null
          total_rows?: number | null
          unmatched_staff_count?: number | null
          updated_at?: string | null
          upload_mode?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_upload_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_upload_batches_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      source_files: {
        Row: {
          bucket_id: string
          created_at: string
          created_by: string
          file_path: string
          id: string
          original_file_name: string
          store_id: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          created_by: string
          file_path: string
          id?: string
          original_file_name: string
          store_id: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          created_by?: string
          file_path?: string
          id?: string
          original_file_name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_files_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_account_requests: {
        Row: {
          created_at: string
          decision_at: string | null
          decision_by: string | null
          decision_reason: string | null
          employee_contact_id: string
          id: string
          requested_by: string
          requested_email: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          employee_contact_id: string
          id?: string
          requested_by: string
          requested_email: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_at?: string | null
          decision_by?: string | null
          decision_reason?: string | null
          employee_contact_id?: string
          id?: string
          requested_by?: string
          requested_email?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      employee_auth_links: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          approved_at: string
          approved_by: string
          auth_user_id: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          employee_contact_id: string
          id: string
          last_password_changed_at: string | null
          login_email: string
          must_change_password: boolean
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          approved_at?: string
          approved_by: string
          auth_user_id: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          employee_contact_id: string
          id?: string
          last_password_changed_at?: string | null
          login_email: string
          must_change_password?: boolean
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          approved_at?: string
          approved_by?: string
          auth_user_id?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          employee_contact_id?: string
          id?: string
          last_password_changed_at?: string | null
          login_email?: string
          must_change_password?: boolean
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sensitive_access_grants: {
        Row: {
          auth_user_id: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          revoked_at: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          revoked_at?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          revoked_at?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: []
      }
      staff_security_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          auth_user_id: string | null
          created_at: string
          employee_contact_id: string
          event_type: string
          id: string
          outcome: string
          safe_metadata: Json
          store_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          auth_user_id?: string | null
          created_at?: string
          employee_contact_id: string
          event_type: string
          id?: string
          outcome?: string
          safe_metadata?: Json
          store_id: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          auth_user_id?: string | null
          created_at?: string
          employee_contact_id?: string
          event_type?: string
          id?: string
          outcome?: string
          safe_metadata?: Json
          store_id?: string
        }
        Relationships: []
      }
      staff_name_aliases: {
        Row: {
          canonical_staff_name: string
          created_at: string | null
          created_by: string | null
          employee_contact_id: string | null
          id: string
          is_active: boolean | null
          normalized_canonical_staff_name: string
          normalized_source_name: string
          source_name: string
          source_type: string | null
          store_id: string
          updated_at: string | null
          verification_note: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          canonical_staff_name: string
          created_at?: string | null
          created_by?: string | null
          employee_contact_id?: string | null
          id?: string
          is_active?: boolean | null
          normalized_canonical_staff_name: string
          normalized_source_name: string
          source_name: string
          source_type?: string | null
          store_id: string
          updated_at?: string | null
          verification_note?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          canonical_staff_name?: string
          created_at?: string | null
          created_by?: string | null
          employee_contact_id?: string | null
          id?: string
          is_active?: boolean | null
          normalized_canonical_staff_name?: string
          normalized_source_name?: string
          source_name?: string
          source_type?: string | null
          store_id?: string
          updated_at?: string | null
          verification_note?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_name_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_name_aliases_employee_contact_id_fkey"
            columns: ["employee_contact_id"]
            isOneToOne: false
            referencedRelation: "employee_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_name_aliases_store_id_fkey"
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
          assigned_employee_id: string | null
          assigned_to: string | null
          carry_forward: boolean | null
          category: string | null
          completed_at: string | null
          completion_note: string | null
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
          assigned_employee_id?: string | null
          assigned_to?: string | null
          carry_forward?: boolean | null
          category?: string | null
          completed_at?: string | null
          completion_note?: string | null
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
          assigned_employee_id?: string | null
          assigned_to?: string | null
          carry_forward?: boolean | null
          category?: string | null
          completed_at?: string | null
          completion_note?: string | null
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
            foreignKeyName: "tasks_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employee_contacts"
            referencedColumns: ["id"]
          },
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
      can_manage_staff_employee: { Args: { p_employee_id: string }; Returns: boolean }
      complete_my_task: { Args: { p_task_id: string; p_completion_note?: string }; Returns: boolean }
      consume_credential_action_limit: { Args: { p_employee_id: string }; Returns: boolean }
      current_staff_employee_id: { Args: Record<PropertyKey, never>; Returns: string | null }
      finalize_staff_account: { Args: { p_employee_id: string; p_auth_user_id: string; p_email: string; p_request_id?: string }; Returns: string }
      finish_own_staff_password_change: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_active_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      my_payslip_list: { Args: { p_grant_token: string }; Returns: Json }
      my_salary_summary: { Args: { p_grant_token: string }; Returns: Json }
      my_sales_summary: { Args: { p_start: string; p_end: string }; Returns: Json }
      my_tasks_list: { Args: Record<PropertyKey, never>; Returns: Json }
      record_staff_password_issued: { Args: { p_employee_id: string; p_event_type: string }; Returns: boolean }
      staff_profile_summary: { Args: Record<PropertyKey, never>; Returns: Json }
      staff_home_summary: { Args: Record<PropertyKey, never>; Returns: Json }
      validate_sensitive_access_grant: { Args: { p_token: string; p_purpose: string }; Returns: boolean }
      finish_upload_intent: { Args: { p_id: string; p_lease: string; p_ok: boolean; p_result: Json }; Returns: Json }
      bind_upload_import: { Args: { p_id: string; p_lease: string; p_run: string; p_payroll: boolean }; Returns: Json }
      verify_upload_intent: { Args: { p_id: string; p_lease: string; p_hash: string }; Returns: Json }
      claim_upload_intent: { Args: { p_id: string; p_actor: string; p_kind: string; p_request_hash: string }; Returns: Json }
      start_upload_intent: { Args: { p_id: string }; Returns: Json }
      create_upload_intent: { Args: { p_store: string; p_kind: string; p_name: string; p_mime: string; p_size: number; p_hash: string }; Returns: Json }
      record_payroll_receivable: { Args: { p_id: string; p_action: string; p_amount?: number; p_note?: string }; Returns: Json }
      payroll_comparison: { Args: { p_month: string; p_label: string; p_scope: string[] }; Returns: Json }
      sync_payroll_receivables: { Args: { p_batch?: string }; Returns: Json }
      commit_payroll_import: { Args: { p_import: string; p_confirm?: boolean; p_token?: string }; Returns: Json }
      prepare_payroll_import: { Args: { p_month: string; p_label: string; p_fingerprint: string; p_file_name: string; p_rows: Json }; Returns: Json }
      record_payslip_delivery: { Args: { p_generated: string; p_kind: string; p_method: string; p_note?: string }; Returns: undefined }
      finish_payslip_pdf: { Args: { p_job: string; p_file_name: string }; Returns: Json }
      begin_payslip_pdf: { Args: { p_row: string }; Returns: Json }
      analytics_data: {
        Args: {
          p_store_ids: string[]
          p_start?: string
          p_end?: string
          p_months?: string[]
        }
        Returns: Json
      }
      sales_analytics_summary_v2: {
        Args: { p_store_ids: string[]; p_start: string; p_end: string; p_top_limit?: number }
        Returns: Json
      }
      staff_sales_summary_v2: {
        Args: { p_store_ids: string[]; p_start: string; p_end: string; p_top_limit?: number }
        Returns: Json
      }
      stock_analytics_summary_v2: {
        Args: { p_store_ids: string[]; p_stock_month: string; p_lookback_days?: number; p_top_limit?: number }
        Returns: Json
      }
      weekly_audit_summary_v2: {
        Args: { p_store_ids: string[]; p_start: string; p_end: string; p_top_limit?: number }
        Returns: Json
      }
      archive_sales_report: {
        Args: { p_report: string }
        Returns: Json
      }
      begin_report_import: {
        Args: {
          p_store: string
          p_type: string
          p_fingerprint: string
          p_file_name: string
          p_manifest: Json
          p_mode: string
          p_bulk: boolean
        }
        Returns: Json
      }
      can_access_store: {
        Args: { p_store_id: string }
        Returns: boolean
      }
      can_read_source: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
      can_upload_source: {
        Args: { p_bucket: string; p_path: string }
        Returns: boolean
      }
      commit_report_import: {
        Args: { p_import: string }
        Returns: Json
      }
      commit_stock_report_import: {
        Args: { p_import: string }
        Returns: Json
      }
      fail_report_import: {
        Args: { p_import: string }
        Returns: undefined
      }
      is_active_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_owner: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      repair_sales_report: {
        Args: { p_report: string; p_footer_ids: string[]; p_summary: Json }
        Returns: Json
      }
      reserve_source_file: {
        Args: {
          p_store_id: string
          p_bucket: string
          p_kind: string
          p_file_name: string
        }
        Returns: string
      }
      restore_report_version: {
        Args: { p_report: string }
        Returns: Json
      }
      stage_report_chunk: {
        Args: { p_import: string; p_chunk: number; p_rows: Json }
        Returns: undefined
      }
      user_store_ids: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
