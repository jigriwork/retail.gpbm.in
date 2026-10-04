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
      gstr2b_lines: {
        Row: {
          id: string
          firm_id: string
          return_period: string
          document_id: string | null
          supplier_gstin: string
          supplier_name: string | null
          doc_type: string
          doc_no: string
          doc_no_key: string | null
          doc_date: string | null
          doc_value: number | null
          taxable: number
          igst: number
          cgst: number
          sgst: number
          cess: number
          itc_available: boolean | null
          reason: string | null
          imported_by: string | null
          imported_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          return_period: string
          document_id?: string | null
          supplier_gstin: string
          supplier_name?: string | null
          doc_type: string
          doc_no: string
          doc_date?: string | null
          doc_value?: number | null
          taxable?: number
          igst?: number
          cgst?: number
          sgst?: number
          cess?: number
          itc_available?: boolean | null
          reason?: string | null
          imported_by?: string | null
          imported_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          return_period?: string
          document_id?: string | null
          supplier_gstin?: string
          supplier_name?: string | null
          doc_type?: string
          doc_no?: string
          doc_date?: string | null
          doc_value?: number | null
          taxable?: number
          igst?: number
          cgst?: number
          sgst?: number
          cess?: number
          itc_available?: boolean | null
          reason?: string | null
          imported_by?: string | null
          imported_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "gstr2b_lines_document_id_fkey",
            "columns": [
              "document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "gstr2b_lines_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "gstr2b_lines_imported_by_fkey",
            "columns": [
              "imported_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      staff_targets: {
        Row: {
          id: string
          store_id: string
          month: string
          staff_name: string
          target: number
          set_by: string | null
          set_at: string
        }
        Insert: {
          id?: string
          store_id: string
          month: string
          staff_name: string
          target: number
          set_by?: string | null
          set_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          month?: string
          staff_name?: string
          target?: number
          set_by?: string | null
          set_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "staff_targets_set_by_fkey",
            "columns": [
              "set_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "staff_targets_store_id_fkey",
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
      incentive_schemes: {
        Row: {
          id: string
          store_id: string | null
          name: string
          valid_from: string
          valid_to: string | null
          basis: string
          payout: string
          slabs: Json
          min_bills: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id?: string | null
          name: string
          valid_from: string
          valid_to?: string | null
          basis: string
          payout?: string
          slabs: Json
          min_bills?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string | null
          name?: string
          valid_from?: string
          valid_to?: string | null
          basis?: string
          payout?: string
          slabs?: Json
          min_bills?: number
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "incentive_schemes_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "incentive_schemes_store_id_fkey",
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
      stock_count_lines: {
        Row: {
          id: string
          count_id: string
          lot_code: string | null
          brand: string | null
          item_name: string | null
          size: string | null
          mrp: number | null
          unit_cost: number | null
          expected_qty: number
          counted_qty: number | null
          is_extra: boolean
          counted_by: string | null
          counted_at: string | null
        }
        Insert: {
          id?: string
          count_id: string
          lot_code?: string | null
          brand?: string | null
          item_name?: string | null
          size?: string | null
          mrp?: number | null
          unit_cost?: number | null
          expected_qty?: number
          counted_qty?: number | null
          is_extra?: boolean
          counted_by?: string | null
          counted_at?: string | null
        }
        Update: {
          id?: string
          count_id?: string
          lot_code?: string | null
          brand?: string | null
          item_name?: string | null
          size?: string | null
          mrp?: number | null
          unit_cost?: number | null
          expected_qty?: number
          counted_qty?: number | null
          is_extra?: boolean
          counted_by?: string | null
          counted_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "stock_count_lines_count_id_fkey",
            "columns": [
              "count_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "stock_counts",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_count_lines_counted_by_fkey",
            "columns": [
              "counted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      stock_counts: {
        Row: {
          id: string
          store_id: string
          title: string
          scope_brand: string | null
          scope_category: string | null
          snapshot_date: string | null
          status: string
          created_by: string
          created_at: string
          submitted_by: string | null
          submitted_at: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
        }
        Insert: {
          id?: string
          store_id: string
          title: string
          scope_brand?: string | null
          scope_category?: string | null
          snapshot_date?: string | null
          status?: string
          created_by?: string
          created_at?: string
          submitted_by?: string | null
          submitted_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Update: {
          id?: string
          store_id?: string
          title?: string
          scope_brand?: string | null
          scope_category?: string | null
          snapshot_date?: string | null
          status?: string
          created_by?: string
          created_at?: string
          submitted_by?: string | null
          submitted_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "stock_counts_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_counts_reviewed_by_fkey",
            "columns": [
              "reviewed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_counts_store_id_fkey",
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
            "foreignKeyName": "stock_counts_submitted_by_fkey",
            "columns": [
              "submitted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      buying_budgets: {
        Row: {
          id: string
          brand_id: string
          store_id: string | null
          season: string
          starts_on: string
          ends_on: string
          budget_amount: number
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          store_id?: string | null
          season: string
          starts_on: string
          ends_on: string
          budget_amount: number
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          store_id?: string | null
          season?: string
          starts_on?: string
          ends_on?: string
          budget_amount?: number
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "buying_budgets_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "buying_budgets_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "buying_budgets_store_id_fkey",
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
      customer_messages: {
        Row: {
          id: string
          mobile: string
          store_id: string
          kind: string
          sent_by: string
          sent_at: string
        }
        Insert: {
          id?: string
          mobile: string
          store_id: string
          kind: string
          sent_by?: string
          sent_at?: string
        }
        Update: {
          id?: string
          mobile?: string
          store_id?: string
          kind?: string
          sent_by?: string
          sent_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "customer_messages_sent_by_fkey",
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
            "foreignKeyName": "customer_messages_store_id_fkey",
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
      customer_profiles: {
        Row: {
          mobile: string
          preferred_name: string | null
          birthday: string | null
          anniversary: string | null
          marketing_consent: boolean
          consent_source: string | null
          consent_at: string | null
          consent_by: string | null
          withdrawn_at: string | null
          do_not_contact: boolean
          note: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          mobile: string
          preferred_name?: string | null
          birthday?: string | null
          anniversary?: string | null
          marketing_consent?: boolean
          consent_source?: string | null
          consent_at?: string | null
          consent_by?: string | null
          withdrawn_at?: string | null
          do_not_contact?: boolean
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          mobile?: string
          preferred_name?: string | null
          birthday?: string | null
          anniversary?: string | null
          marketing_consent?: boolean
          consent_source?: string | null
          consent_at?: string | null
          consent_by?: string | null
          withdrawn_at?: string | null
          do_not_contact?: boolean
          note?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "customer_profiles_consent_by_fkey",
            "columns": [
              "consent_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "customer_profiles_updated_by_fkey",
            "columns": [
              "updated_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      store_monthly_costs: {
        Row: {
          id: string
          store_id: string
          name: string
          amount: number
          valid_from: string
          valid_to: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          store_id: string
          name: string
          amount: number
          valid_from: string
          valid_to?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          name?: string
          amount?: number
          valid_from?: string
          valid_to?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "store_monthly_costs_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_monthly_costs_store_id_fkey",
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
      store_expenses: {
        Row: {
          id: string
          store_id: string
          expense_date: string
          category: string
          amount: number
          paid_from: string
          paid_to: string | null
          note: string | null
          status: string
          reject_reason: string | null
          created_by: string
          created_at: string
          checked_by: string | null
          checked_at: string | null
        }
        Insert: {
          id?: string
          store_id: string
          expense_date: string
          category: string
          amount: number
          paid_from: string
          paid_to?: string | null
          note?: string | null
          status?: string
          reject_reason?: string | null
          created_by?: string
          created_at?: string
          checked_by?: string | null
          checked_at?: string | null
        }
        Update: {
          id?: string
          store_id?: string
          expense_date?: string
          category?: string
          amount?: number
          paid_from?: string
          paid_to?: string | null
          note?: string | null
          status?: string
          reject_reason?: string | null
          created_by?: string
          created_at?: string
          checked_by?: string | null
          checked_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "store_expenses_checked_by_fkey",
            "columns": [
              "checked_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_expenses_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_expenses_store_id_fkey",
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
      store_day_closes: {
        Row: {
          id: string
          store_id: string
          close_date: string
          opening_cash: number
          cash_counted: number
          upi_amount: number
          card_amount: number
          other_amount: number
          other_note: string | null
          cash_deposited: number
          note: string | null
          status: string
          submitted_by: string | null
          submitted_at: string
          reviewed_by: string | null
          reviewed_at: string | null
          review_note: string | null
        }
        Insert: {
          id?: string
          store_id: string
          close_date: string
          opening_cash: number
          cash_counted: number
          upi_amount?: number
          card_amount?: number
          other_amount?: number
          other_note?: string | null
          cash_deposited?: number
          note?: string | null
          status?: string
          submitted_by?: string | null
          submitted_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Update: {
          id?: string
          store_id?: string
          close_date?: string
          opening_cash?: number
          cash_counted?: number
          upi_amount?: number
          card_amount?: number
          other_amount?: number
          other_note?: string | null
          cash_deposited?: number
          note?: string | null
          status?: string
          submitted_by?: string | null
          submitted_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          review_note?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "store_day_closes_reviewed_by_fkey",
            "columns": [
              "reviewed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_day_closes_store_id_fkey",
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
            "foreignKeyName": "store_day_closes_submitted_by_fkey",
            "columns": [
              "submitted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      supplier_statement_lines: {
        Row: {
          id: string
          statement_id: string
          line_date: string | null
          doc_no: string | null
          doc_key: string | null
          description: string | null
          debit: number
          credit: number
          matched_voucher_id: string | null
          match_note: string | null
        }
        Insert: {
          id?: string
          statement_id: string
          line_date?: string | null
          doc_no?: string | null
          description?: string | null
          debit?: number
          credit?: number
          matched_voucher_id?: string | null
          match_note?: string | null
        }
        Update: {
          id?: string
          statement_id?: string
          line_date?: string | null
          doc_no?: string | null
          description?: string | null
          debit?: number
          credit?: number
          matched_voucher_id?: string | null
          match_note?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "supplier_statement_lines_matched_voucher_id_fkey",
            "columns": [
              "matched_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_statement_lines_statement_id_fkey",
            "columns": [
              "statement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supplier_statements",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      supplier_statements: {
        Row: {
          id: string
          firm_id: string
          party_id: string
          document_id: string | null
          period_from: string
          period_to: string
          opening_balance: number | null
          closing_balance: number
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          party_id: string
          document_id?: string | null
          period_from: string
          period_to: string
          opening_balance?: number | null
          closing_balance: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          party_id?: string
          document_id?: string | null
          period_from?: string
          period_to?: string
          opening_balance?: number | null
          closing_balance?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "supplier_statements_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_statements_document_id_fkey",
            "columns": [
              "document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_statements_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_statements_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      accounting_periods: {
        Row: {
          id: string
          firm_id: string
          month: string
          status: string
          closed_by: string | null
          closed_at: string | null
          reopened_by: string | null
          reopened_at: string | null
          reopen_reason: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          month: string
          status?: string
          closed_by?: string | null
          closed_at?: string | null
          reopened_by?: string | null
          reopened_at?: string | null
          reopen_reason?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          month?: string
          status?: string
          closed_by?: string | null
          closed_at?: string | null
          reopened_by?: string | null
          reopened_at?: string | null
          reopen_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "accounting_periods_closed_by_fkey",
            "columns": [
              "closed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "accounting_periods_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "accounting_periods_reopened_by_fkey",
            "columns": [
              "reopened_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      settlement_payments: {
        Row: {
          id: string
          settlement_id: string
          voucher_id: string
          amount: number
          created_by: string | null
          created_at: string
          released_at: string | null
        }
        Insert: {
          id?: string
          settlement_id: string
          voucher_id: string
          amount: number
          created_by?: string | null
          created_at?: string
          released_at?: string | null
        }
        Update: {
          id?: string
          settlement_id?: string
          voucher_id?: string
          amount?: number
          created_by?: string | null
          created_at?: string
          released_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "settlement_payments_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "settlement_payments_settlement_id_fkey",
            "columns": [
              "settlement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "settlements",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "settlement_payments_voucher_id_fkey",
            "columns": [
              "voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      settlements: {
        Row: {
          id: string
          run_id: string
          firm_id: string
          party_id: string
          payable: number
          due_date: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          run_id: string
          firm_id: string
          party_id: string
          payable: number
          due_date?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          run_id?: string
          firm_id?: string
          party_id?: string
          payable?: number
          due_date?: string | null
          status?: string
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "settlements_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "settlements_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "settlements_run_id_fkey",
            "columns": [
              "run_id"
            ],
            "isOneToOne": true,
            "referencedRelation": "calculation_runs",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      claims: {
        Row: {
          id: string
          firm_id: string
          party_id: string
          arrangement_id: string | null
          run_id: string | null
          kind: string
          period_from: string | null
          period_to: string | null
          expected_amount: number
          status: string
          matched_voucher_id: string | null
          received_amount: number | null
          note: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          party_id: string
          arrangement_id?: string | null
          run_id?: string | null
          kind: string
          period_from?: string | null
          period_to?: string | null
          expected_amount: number
          status?: string
          matched_voucher_id?: string | null
          received_amount?: number | null
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          party_id?: string
          arrangement_id?: string | null
          run_id?: string | null
          kind?: string
          period_from?: string | null
          period_to?: string | null
          expected_amount?: number
          status?: string
          matched_voucher_id?: string | null
          received_amount?: number | null
          note?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "claims_arrangement_id_fkey",
            "columns": [
              "arrangement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supply_arrangements",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "claims_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "claims_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "claims_matched_voucher_id_fkey",
            "columns": [
              "matched_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "claims_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "claims_run_id_fkey",
            "columns": [
              "run_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "calculation_runs",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      bill_discount_approvals: {
        Row: {
          id: string
          arrangement_id: string
          store_id: string
          sale_date: string
          bill_no: string
          approved_amount: number
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          arrangement_id: string
          store_id: string
          sale_date: string
          bill_no: string
          approved_amount: number
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          arrangement_id?: string
          store_id?: string
          sale_date?: string
          bill_no?: string
          approved_amount?: number
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "bill_discount_approvals_arrangement_id_fkey",
            "columns": [
              "arrangement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supply_arrangements",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "bill_discount_approvals_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "bill_discount_approvals_store_id_fkey",
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
      calculation_lines: {
        Row: {
          id: number
          run_id: string
          ord: number
          sales_row_id: string | null
          sale_date: string | null
          bill_no: string | null
          lot_code: string | null
          class: string | null
          qty: number | null
          mrp: number | null
          mrp_value: number | null
          nsv: number | null
          customer_discount: number | null
          accepted_discount: number | null
          sales_value: number | null
          sales_tax: number | null
          margin: number | null
          purchase_cost: number | null
          purchase_tax: number | null
          purchase_value: number | null
          tax_diff: number | null
          payment: number | null
          cn: number | null
          flags: Json
        }
        Insert: {
          id?: number
          run_id: string
          ord: number
          sales_row_id?: string | null
          sale_date?: string | null
          bill_no?: string | null
          lot_code?: string | null
          class?: string | null
          qty?: number | null
          mrp?: number | null
          mrp_value?: number | null
          nsv?: number | null
          customer_discount?: number | null
          accepted_discount?: number | null
          sales_value?: number | null
          sales_tax?: number | null
          margin?: number | null
          purchase_cost?: number | null
          purchase_tax?: number | null
          purchase_value?: number | null
          tax_diff?: number | null
          payment?: number | null
          cn?: number | null
          flags?: Json
        }
        Update: {
          id?: number
          run_id?: string
          ord?: number
          sales_row_id?: string | null
          sale_date?: string | null
          bill_no?: string | null
          lot_code?: string | null
          class?: string | null
          qty?: number | null
          mrp?: number | null
          mrp_value?: number | null
          nsv?: number | null
          customer_discount?: number | null
          accepted_discount?: number | null
          sales_value?: number | null
          sales_tax?: number | null
          margin?: number | null
          purchase_cost?: number | null
          purchase_tax?: number | null
          purchase_value?: number | null
          tax_diff?: number | null
          payment?: number | null
          cn?: number | null
          flags?: Json
        }
        Relationships: [
          {
            "foreignKeyName": "calculation_lines_run_id_fkey",
            "columns": [
              "run_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "calculation_runs",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_lines_sales_row_id_fkey",
            "columns": [
              "sales_row_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "sales_rows",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      calculation_runs: {
        Row: {
          id: string
          arrangement_id: string
          terms_id: string | null
          firm_id: string
          party_id: string
          brand_id: string
          store_id: string | null
          period_from: string
          period_to: string
          rule_set: string
          rules: Json
          status: string
          complete: boolean
          blockers: Json
          inputs: Json
          totals: Json
          company_figures: Json | null
          source_changed: boolean
          source_changed_at: string | null
          supersedes_run_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          reviewed_by: string | null
          reviewed_at: string | null
          approved_by: string | null
          approved_at: string | null
          closed_by: string | null
          closed_at: string | null
        }
        Insert: {
          id?: string
          arrangement_id: string
          terms_id?: string | null
          firm_id: string
          party_id: string
          brand_id: string
          store_id?: string | null
          period_from: string
          period_to: string
          rule_set: string
          rules: Json
          status?: string
          complete: boolean
          blockers?: Json
          inputs?: Json
          totals?: Json
          company_figures?: Json | null
          source_changed?: boolean
          source_changed_at?: string | null
          supersedes_run_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          closed_by?: string | null
          closed_at?: string | null
        }
        Update: {
          id?: string
          arrangement_id?: string
          terms_id?: string | null
          firm_id?: string
          party_id?: string
          brand_id?: string
          store_id?: string | null
          period_from?: string
          period_to?: string
          rule_set?: string
          rules?: Json
          status?: string
          complete?: boolean
          blockers?: Json
          inputs?: Json
          totals?: Json
          company_figures?: Json | null
          source_changed?: boolean
          source_changed_at?: string | null
          supersedes_run_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          closed_by?: string | null
          closed_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "calculation_runs_approved_by_fkey",
            "columns": [
              "approved_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_arrangement_id_fkey",
            "columns": [
              "arrangement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supply_arrangements",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_closed_by_fkey",
            "columns": [
              "closed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_reviewed_by_fkey",
            "columns": [
              "reviewed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_store_id_fkey",
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
            "foreignKeyName": "calculation_runs_supersedes_run_id_fkey",
            "columns": [
              "supersedes_run_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "calculation_runs",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "calculation_runs_terms_id_fkey",
            "columns": [
              "terms_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "company_terms",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      distributor_transfers: {
        Row: {
          id: string
          firm_id: string
          from_party_id: string
          to_party_id: string
          transfer_date: string
          liability_amount: number
          from_voucher_id: string | null
          to_voucher_id: string | null
          document_id: string
          narration: string
          batches_moved: number
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          from_party_id: string
          to_party_id: string
          transfer_date: string
          liability_amount?: number
          from_voucher_id?: string | null
          to_voucher_id?: string | null
          document_id: string
          narration: string
          batches_moved?: number
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          from_party_id?: string
          to_party_id?: string
          transfer_date?: string
          liability_amount?: number
          from_voucher_id?: string | null
          to_voucher_id?: string | null
          document_id?: string
          narration?: string
          batches_moved?: number
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "distributor_transfers_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_document_id_fkey",
            "columns": [
              "document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_from_party_id_fkey",
            "columns": [
              "from_party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_from_voucher_id_fkey",
            "columns": [
              "from_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_to_party_id_fkey",
            "columns": [
              "to_party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "distributor_transfers_to_voucher_id_fkey",
            "columns": [
              "to_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      supplier_return_lines: {
        Row: {
          id: string
          return_id: string
          batch_id: string | null
          lot_code: string | null
          barcode: string | null
          article: string | null
          size: string | null
          qty: number
          unit_value: number
          accepted_qty: number | null
          rejected_qty: number | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          return_id: string
          batch_id?: string | null
          lot_code?: string | null
          barcode?: string | null
          article?: string | null
          size?: string | null
          qty: number
          unit_value: number
          accepted_qty?: number | null
          rejected_qty?: number | null
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          return_id?: string
          batch_id?: string | null
          lot_code?: string | null
          barcode?: string | null
          article?: string | null
          size?: string | null
          qty?: number
          unit_value?: number
          accepted_qty?: number | null
          rejected_qty?: number | null
          note?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "supplier_return_lines_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_return_lines_return_id_fkey",
            "columns": [
              "return_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supplier_returns",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      supplier_returns: {
        Row: {
          id: string
          firm_id: string
          store_id: string
          party_id: string
          return_no: string
          status: string
          request_date: string
          authorisation_ref: string | null
          authorised_date: string | null
          dispatch_date: string | null
          dispatch_ref: string | null
          acknowledged_date: string | null
          expected_credit: number
          accepted_value: number | null
          debit_note_voucher_id: string | null
          credit_note_voucher_id: string | null
          supplier_credit_ref: string | null
          supplier_credit_amount: number | null
          deduct_on: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          store_id: string
          party_id: string
          return_no: string
          status?: string
          request_date: string
          authorisation_ref?: string | null
          authorised_date?: string | null
          dispatch_date?: string | null
          dispatch_ref?: string | null
          acknowledged_date?: string | null
          expected_credit?: number
          accepted_value?: number | null
          debit_note_voucher_id?: string | null
          credit_note_voucher_id?: string | null
          supplier_credit_ref?: string | null
          supplier_credit_amount?: number | null
          deduct_on?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          store_id?: string
          party_id?: string
          return_no?: string
          status?: string
          request_date?: string
          authorisation_ref?: string | null
          authorised_date?: string | null
          dispatch_date?: string | null
          dispatch_ref?: string | null
          acknowledged_date?: string | null
          expected_credit?: number
          accepted_value?: number | null
          debit_note_voucher_id?: string | null
          credit_note_voucher_id?: string | null
          supplier_credit_ref?: string | null
          supplier_credit_amount?: number | null
          deduct_on?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "supplier_returns_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_returns_credit_note_voucher_id_fkey",
            "columns": [
              "credit_note_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_returns_debit_note_voucher_id_fkey",
            "columns": [
              "debit_note_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_returns_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_returns_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supplier_returns_store_id_fkey",
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
      stock_allocations: {
        Row: {
          id: string
          sales_row_id: string
          store_id: string
          sale_date: string
          batch_id: string | null
          qty: number
          method: string
          status: string
          note: string | null
          created_by: string | null
          created_at: string
          reversed_at: string | null
          reversed_reason: string | null
        }
        Insert: {
          id?: string
          sales_row_id: string
          store_id: string
          sale_date: string
          batch_id?: string | null
          qty: number
          method: string
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          reversed_at?: string | null
          reversed_reason?: string | null
        }
        Update: {
          id?: string
          sales_row_id?: string
          store_id?: string
          sale_date?: string
          batch_id?: string | null
          qty?: number
          method?: string
          status?: string
          note?: string | null
          created_by?: string | null
          created_at?: string
          reversed_at?: string | null
          reversed_reason?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "stock_allocations_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_allocations_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_allocations_sales_row_id_fkey",
            "columns": [
              "sales_row_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "sales_rows",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_allocations_store_id_fkey",
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
      batch_movements: {
        Row: {
          id: string
          batch_id: string
          kind: string
          qty: number
          to_batch_id: string | null
          movement_date: string
          transfer_id: string | null
          document_id: string | null
          note: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          kind: string
          qty: number
          to_batch_id?: string | null
          movement_date: string
          transfer_id?: string | null
          document_id?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          batch_id?: string
          kind?: string
          qty?: number
          to_batch_id?: string | null
          movement_date?: string
          transfer_id?: string | null
          document_id?: string | null
          note?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "batch_movements_batch_id_fkey",
            "columns": [
              "batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "batch_movements_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "batch_movements_document_id_fkey",
            "columns": [
              "document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "batch_movements_to_batch_id_fkey",
            "columns": [
              "to_batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_batches",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      purchase_batches: {
        Row: {
          id: string
          firm_id: string
          store_id: string
          party_id: string | null
          brand_id: string | null
          source: string
          invoice_id: string | null
          invoice_line_id: string | null
          opening_report_id: string | null
          parent_batch_id: string | null
          lot_code: string | null
          barcode: string | null
          article: string | null
          size: string | null
          description: string | null
          mrp: number | null
          unit_cost: number | null
          cost_basis: string
          qty_in: number
          received_date: string
          attribution: string
          attribution_note: string | null
          attributed_by: string | null
          attributed_at: string | null
          status: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          store_id: string
          party_id?: string | null
          brand_id?: string | null
          source: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          opening_report_id?: string | null
          parent_batch_id?: string | null
          lot_code?: string | null
          barcode?: string | null
          article?: string | null
          size?: string | null
          description?: string | null
          mrp?: number | null
          unit_cost?: number | null
          cost_basis: string
          qty_in: number
          received_date: string
          attribution: string
          attribution_note?: string | null
          attributed_by?: string | null
          attributed_at?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          store_id?: string
          party_id?: string | null
          brand_id?: string | null
          source?: string
          invoice_id?: string | null
          invoice_line_id?: string | null
          opening_report_id?: string | null
          parent_batch_id?: string | null
          lot_code?: string | null
          barcode?: string | null
          article?: string | null
          size?: string | null
          description?: string | null
          mrp?: number | null
          unit_cost?: number | null
          cost_basis?: string
          qty_in?: number
          received_date?: string
          attribution?: string
          attribution_note?: string | null
          attributed_by?: string | null
          attributed_at?: string | null
          status?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "purchase_batches_attributed_by_fkey",
            "columns": [
              "attributed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_invoice_id_fkey",
            "columns": [
              "invoice_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_invoices",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_invoice_line_id_fkey",
            "columns": [
              "invoice_line_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_invoice_lines",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_opening_report_id_fkey",
            "columns": [
              "opening_report_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "reports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_parent_batch_id_fkey",
            "columns": [
              "parent_batch_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_batches",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_batches_store_id_fkey",
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
      purchase_import_profiles: {
        Row: {
          id: string
          name: string
          party_id: string | null
          kind: string
          header_row: number
          column_map: Json
          verified: boolean
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          party_id?: string | null
          kind: string
          header_row?: number
          column_map: Json
          verified?: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          party_id?: string | null
          kind?: string
          header_row?: number
          column_map?: Json
          verified?: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "purchase_import_profiles_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_import_profiles_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      disputes: {
        Row: {
          id: string
          firm_id: string
          store_id: string | null
          party_id: string
          voucher_id: string | null
          amount: number
          title: string
          details: string | null
          status: string
          resolution: string | null
          created_by: string | null
          created_at: string
          resolved_by: string | null
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          store_id?: string | null
          party_id: string
          voucher_id?: string | null
          amount: number
          title: string
          details?: string | null
          status?: string
          resolution?: string | null
          created_by?: string | null
          created_at?: string
          resolved_by?: string | null
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          store_id?: string | null
          party_id?: string
          voucher_id?: string | null
          amount?: number
          title?: string
          details?: string | null
          status?: string
          resolution?: string | null
          created_by?: string | null
          created_at?: string
          resolved_by?: string | null
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "disputes_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "disputes_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "disputes_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "disputes_resolved_by_fkey",
            "columns": [
              "resolved_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "disputes_store_id_fkey",
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
            "foreignKeyName": "disputes_voucher_id_fkey",
            "columns": [
              "voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      document_links: {
        Row: {
          id: string
          document_id: string
          entity_type: string
          entity_id: string
          role: string
          linked_by: string | null
          linked_at: string
        }
        Insert: {
          id?: string
          document_id: string
          entity_type: string
          entity_id: string
          role?: string
          linked_by?: string | null
          linked_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          entity_type?: string
          entity_id?: string
          role?: string
          linked_by?: string | null
          linked_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "document_links_document_id_fkey",
            "columns": [
              "document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "document_links_linked_by_fkey",
            "columns": [
              "linked_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      purchase_invoice_lines: {
        Row: {
          id: string
          invoice_id: string
          line_no: number
          brand_id: string | null
          article: string | null
          description: string | null
          barcode: string | null
          size: string | null
          colour: string | null
          hsn_code: string | null
          quantity: number
          mrp: number | null
          unit_rate: number | null
          taxable_amount: number
          gst_rate: number | null
          cgst_amount: number
          sgst_amount: number
          igst_amount: number
          line_total: number | null
          source: string
          source_document_id: string | null
          created_at: string
          lot_code: string | null
        }
        Insert: {
          id?: string
          invoice_id: string
          line_no: number
          brand_id?: string | null
          article?: string | null
          description?: string | null
          barcode?: string | null
          size?: string | null
          colour?: string | null
          hsn_code?: string | null
          quantity: number
          mrp?: number | null
          unit_rate?: number | null
          taxable_amount: number
          gst_rate?: number | null
          cgst_amount?: number
          sgst_amount?: number
          igst_amount?: number
          line_total?: number | null
          source?: string
          source_document_id?: string | null
          created_at?: string
          lot_code?: string | null
        }
        Update: {
          id?: string
          invoice_id?: string
          line_no?: number
          brand_id?: string | null
          article?: string | null
          description?: string | null
          barcode?: string | null
          size?: string | null
          colour?: string | null
          hsn_code?: string | null
          quantity?: number
          mrp?: number | null
          unit_rate?: number | null
          taxable_amount?: number
          gst_rate?: number | null
          cgst_amount?: number
          sgst_amount?: number
          igst_amount?: number
          line_total?: number | null
          source?: string
          source_document_id?: string | null
          created_at?: string
          lot_code?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "purchase_invoice_lines_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoice_lines_invoice_id_fkey",
            "columns": [
              "invoice_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "purchase_invoices",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoice_lines_source_document_id_fkey",
            "columns": [
              "source_document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      purchase_invoices: {
        Row: {
          id: string
          firm_id: string
          store_id: string
          party_id: string
          supplier_invoice_no: string
          invoice_no_key: string | null
          invoice_date: string
          financial_year: string
          received_date: string | null
          total_qty: number | null
          taxable_amount: number
          cgst_amount: number
          sgst_amount: number
          igst_amount: number
          freight_amount: number
          other_charges: number
          discount_amount: number
          round_off: number
          invoice_total: number
          due_date: string | null
          due_date_source: string | null
          settlement_basis: string | null
          status: string
          voucher_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
          posted_by: string | null
          posted_at: string | null
          logic_purchase_ref: string | null
        }
        Insert: {
          id?: string
          firm_id: string
          store_id: string
          party_id: string
          supplier_invoice_no: string
          invoice_date: string
          financial_year: string
          received_date?: string | null
          total_qty?: number | null
          taxable_amount?: number
          cgst_amount?: number
          sgst_amount?: number
          igst_amount?: number
          freight_amount?: number
          other_charges?: number
          discount_amount?: number
          round_off?: number
          invoice_total?: number
          due_date?: string | null
          due_date_source?: string | null
          settlement_basis?: string | null
          status?: string
          voucher_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          posted_by?: string | null
          posted_at?: string | null
          logic_purchase_ref?: string | null
        }
        Update: {
          id?: string
          firm_id?: string
          store_id?: string
          party_id?: string
          supplier_invoice_no?: string
          invoice_date?: string
          financial_year?: string
          received_date?: string | null
          total_qty?: number | null
          taxable_amount?: number
          cgst_amount?: number
          sgst_amount?: number
          igst_amount?: number
          freight_amount?: number
          other_charges?: number
          discount_amount?: number
          round_off?: number
          invoice_total?: number
          due_date?: string | null
          due_date_source?: string | null
          settlement_basis?: string | null
          status?: string
          voucher_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
          posted_by?: string | null
          posted_at?: string | null
          logic_purchase_ref?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "purchase_invoices_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoices_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoices_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoices_posted_by_fkey",
            "columns": [
              "posted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "purchase_invoices_store_id_fkey",
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
            "foreignKeyName": "purchase_invoices_voucher_id_fkey",
            "columns": [
              "voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      voucher_allocations: {
        Row: {
          id: string
          firm_id: string
          party_id: string
          from_voucher_id: string
          to_voucher_id: string
          amount: number
          allocated_by: string | null
          allocated_at: string
          released_at: string | null
          released_by: string | null
          release_reason: string | null
        }
        Insert: {
          id?: string
          firm_id: string
          party_id: string
          from_voucher_id: string
          to_voucher_id: string
          amount: number
          allocated_by?: string | null
          allocated_at?: string
          released_at?: string | null
          released_by?: string | null
          release_reason?: string | null
        }
        Update: {
          id?: string
          firm_id?: string
          party_id?: string
          from_voucher_id?: string
          to_voucher_id?: string
          amount?: number
          allocated_by?: string | null
          allocated_at?: string
          released_at?: string | null
          released_by?: string | null
          release_reason?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "voucher_allocations_allocated_by_fkey",
            "columns": [
              "allocated_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_allocations_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_allocations_from_voucher_id_fkey",
            "columns": [
              "from_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_allocations_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_allocations_released_by_fkey",
            "columns": [
              "released_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_allocations_to_voucher_id_fkey",
            "columns": [
              "to_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      voucher_lines: {
        Row: {
          id: string
          voucher_id: string
          line_no: number
          account: string
          party_id: string | null
          brand_id: string | null
          debit: number
          credit: number
          description: string | null
        }
        Insert: {
          id?: string
          voucher_id: string
          line_no: number
          account: string
          party_id?: string | null
          brand_id?: string | null
          debit?: number
          credit?: number
          description?: string | null
        }
        Update: {
          id?: string
          voucher_id?: string
          line_no?: number
          account?: string
          party_id?: string | null
          brand_id?: string | null
          debit?: number
          credit?: number
          description?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "voucher_lines_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_lines_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "voucher_lines_voucher_id_fkey",
            "columns": [
              "voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      vouchers: {
        Row: {
          id: string
          firm_id: string
          store_id: string | null
          party_id: string | null
          voucher_type: string
          voucher_no: string
          financial_year: string
          voucher_date: string
          reference_no: string | null
          reference_date: string | null
          amount: number
          supplier_side: string
          due_date: string | null
          settlement_basis: string | null
          reason: string | null
          payment_mode: string | null
          narration: string | null
          status: string
          reverses_voucher_id: string | null
          reversed_by_voucher_id: string | null
          reversal_reason: string | null
          posted_by: string | null
          posted_at: string
        }
        Insert: {
          id?: string
          firm_id: string
          store_id?: string | null
          party_id?: string | null
          voucher_type: string
          voucher_no: string
          financial_year: string
          voucher_date: string
          reference_no?: string | null
          reference_date?: string | null
          amount: number
          supplier_side: string
          due_date?: string | null
          settlement_basis?: string | null
          reason?: string | null
          payment_mode?: string | null
          narration?: string | null
          status?: string
          reverses_voucher_id?: string | null
          reversed_by_voucher_id?: string | null
          reversal_reason?: string | null
          posted_by?: string | null
          posted_at?: string
        }
        Update: {
          id?: string
          firm_id?: string
          store_id?: string | null
          party_id?: string | null
          voucher_type?: string
          voucher_no?: string
          financial_year?: string
          voucher_date?: string
          reference_no?: string | null
          reference_date?: string | null
          amount?: number
          supplier_side?: string
          due_date?: string | null
          settlement_basis?: string | null
          reason?: string | null
          payment_mode?: string | null
          narration?: string | null
          status?: string
          reverses_voucher_id?: string | null
          reversed_by_voucher_id?: string | null
          reversal_reason?: string | null
          posted_by?: string | null
          posted_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "vouchers_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "vouchers_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "vouchers_posted_by_fkey",
            "columns": [
              "posted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "vouchers_reversed_by_voucher_id_fkey",
            "columns": [
              "reversed_by_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "vouchers_reverses_voucher_id_fkey",
            "columns": [
              "reverses_voucher_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "vouchers",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "vouchers_store_id_fkey",
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
      sales_day_confirmations: {
        Row: {
          id: string
          store_id: string
          sale_date: string
          status: string
          note: string | null
          confirmed_by: string | null
          confirmed_at: string
        }
        Insert: {
          id?: string
          store_id: string
          sale_date: string
          status?: string
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          sale_date?: string
          status?: string
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "sales_day_confirmations_confirmed_by_fkey",
            "columns": [
              "confirmed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "sales_day_confirmations_store_id_fkey",
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
      finance_documents: {
        Row: {
          id: string
          kind: string
          firm_id: string | null
          store_id: string | null
          party_id: string | null
          title: string | null
          doc_no: string | null
          doc_date: string | null
          amount: number | null
          bucket: string
          file_path: string
          file_name: string
          mime_type: string
          byte_size: number
          sha256: string
          status: string
          submitted_by: string
          submitted_role: string
          notes: string | null
          created_at: string
          stored_at: string | null
          reviewed_by: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          kind: string
          firm_id?: string | null
          store_id?: string | null
          party_id?: string | null
          title?: string | null
          doc_no?: string | null
          doc_date?: string | null
          amount?: number | null
          bucket?: string
          file_path: string
          file_name: string
          mime_type: string
          byte_size: number
          sha256: string
          status?: string
          submitted_by: string
          submitted_role: string
          notes?: string | null
          created_at?: string
          stored_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          kind?: string
          firm_id?: string | null
          store_id?: string | null
          party_id?: string | null
          title?: string | null
          doc_no?: string | null
          doc_date?: string | null
          amount?: number | null
          bucket?: string
          file_path?: string
          file_name?: string
          mime_type?: string
          byte_size?: number
          sha256?: string
          status?: string
          submitted_by?: string
          submitted_role?: string
          notes?: string | null
          created_at?: string
          stored_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "finance_documents_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_documents_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_documents_reviewed_by_fkey",
            "columns": [
              "reviewed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_documents_store_id_fkey",
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
            "foreignKeyName": "finance_documents_submitted_by_fkey",
            "columns": [
              "submitted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      company_terms: {
        Row: {
          id: string
          arrangement_id: string
          version: number
          effective_from: string
          effective_to: string | null
          status: string
          payment_cycle: string
          credit_days: number | null
          early_payment_discount_pct: number | null
          early_payment_days: number | null
          early_payment_base: string | null
          rules: Json
          source_document_id: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          confirmed_by: string | null
          confirmed_at: string | null
        }
        Insert: {
          id?: string
          arrangement_id: string
          version: number
          effective_from: string
          effective_to?: string | null
          status?: string
          payment_cycle?: string
          credit_days?: number | null
          early_payment_discount_pct?: number | null
          early_payment_days?: number | null
          early_payment_base?: string | null
          rules?: Json
          source_document_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          confirmed_by?: string | null
          confirmed_at?: string | null
        }
        Update: {
          id?: string
          arrangement_id?: string
          version?: number
          effective_from?: string
          effective_to?: string | null
          status?: string
          payment_cycle?: string
          credit_days?: number | null
          early_payment_discount_pct?: number | null
          early_payment_days?: number | null
          early_payment_base?: string | null
          rules?: Json
          source_document_id?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          confirmed_by?: string | null
          confirmed_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "company_terms_arrangement_id_fkey",
            "columns": [
              "arrangement_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "supply_arrangements",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "company_terms_confirmed_by_fkey",
            "columns": [
              "confirmed_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "company_terms_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "company_terms_source_document_fkey",
            "columns": [
              "source_document_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "finance_documents",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      supply_arrangements: {
        Row: {
          id: string
          party_id: string
          brand_id: string
          firm_id: string
          store_id: string | null
          valid_from: string
          valid_to: string | null
          settlement_basis: string
          status: string
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          party_id: string
          brand_id: string
          firm_id: string
          store_id?: string | null
          valid_from: string
          valid_to?: string | null
          settlement_basis?: string
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          party_id?: string
          brand_id?: string
          firm_id?: string
          store_id?: string | null
          valid_from?: string
          valid_to?: string | null
          settlement_basis?: string
          status?: string
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "supply_arrangements_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supply_arrangements_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supply_arrangements_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supply_arrangements_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "supply_arrangements_store_id_fkey",
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
      brand_aliases: {
        Row: {
          id: string
          brand_id: string
          alias: string
          normalized: string | null
          source: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          alias: string
          source?: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          alias?: string
          source?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "brand_aliases_brand_id_fkey",
            "columns": [
              "brand_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "brands",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "brand_aliases_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      brands: {
        Row: {
          id: string
          name: string
          normalized: string | null
          is_merchandise: boolean
          notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          is_merchandise?: boolean
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          is_merchandise?: boolean
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "brands_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      agent_parties: {
        Row: {
          id: string
          agent_id: string
          party_id: string
          role: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          agent_id: string
          party_id: string
          role?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          agent_id?: string
          party_id?: string
          role?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "agent_parties_agent_id_fkey",
            "columns": [
              "agent_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "agents",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "agent_parties_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "agent_parties_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      agents: {
        Row: {
          id: string
          name: string
          phone: string | null
          email: string | null
          notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "agents_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      party_aliases: {
        Row: {
          id: string
          party_id: string
          alias: string
          normalized: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          party_id: string
          alias: string
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          party_id?: string
          alias?: string
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "party_aliases_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "party_aliases_party_id_fkey",
            "columns": [
              "party_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "parties",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      parties: {
        Row: {
          id: string
          legal_name: string
          display_name: string | null
          gstin: string | null
          gstin_exception: string | null
          state_code: string | null
          address: string | null
          phone: string | null
          email: string | null
          notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          legal_name: string
          display_name?: string | null
          gstin?: string | null
          gstin_exception?: string | null
          state_code?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          legal_name?: string
          display_name?: string | null
          gstin?: string | null
          gstin_exception?: string | null
          state_code?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "parties_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      finance_grants: {
        Row: {
          id: string
          user_id: string
          firm_id: string | null
          store_id: string | null
          can_view: boolean
          can_post: boolean
          can_manage_masters: boolean
          can_approve: boolean
          can_close_period: boolean
          valid_from: string
          valid_to: string | null
          note: string | null
          granted_by: string | null
          created_at: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          id?: string
          user_id: string
          firm_id?: string | null
          store_id?: string | null
          can_view?: boolean
          can_post?: boolean
          can_manage_masters?: boolean
          can_approve?: boolean
          can_close_period?: boolean
          valid_from?: string
          valid_to?: string | null
          note?: string | null
          granted_by?: string | null
          created_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          firm_id?: string | null
          store_id?: string | null
          can_view?: boolean
          can_post?: boolean
          can_manage_masters?: boolean
          can_approve?: boolean
          can_close_period?: boolean
          valid_from?: string
          valid_to?: string | null
          note?: string | null
          granted_by?: string | null
          created_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "finance_grants_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_grants_granted_by_fkey",
            "columns": [
              "granted_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_grants_revoked_by_fkey",
            "columns": [
              "revoked_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "finance_grants_store_id_fkey",
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
            "foreignKeyName": "finance_grants_user_id_fkey",
            "columns": [
              "user_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      billing_series: {
        Row: {
          id: string
          store_id: string
          firm_id: string
          prefix: string
          number_from: number | null
          number_to: number | null
          valid_from: string | null
          valid_to: string | null
          status: string
          evidence: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          firm_id: string
          prefix: string
          number_from?: number | null
          number_to?: number | null
          valid_from?: string | null
          valid_to?: string | null
          status: string
          evidence: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          firm_id?: string
          prefix?: string
          number_from?: number | null
          number_to?: number | null
          valid_from?: string | null
          valid_to?: string | null
          status?: string
          evidence?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "billing_series_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "billing_series_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "billing_series_store_id_fkey",
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
      store_firm_periods: {
        Row: {
          id: string
          store_id: string
          firm_id: string
          valid_from: string | null
          valid_to: string | null
          status: string
          evidence: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          store_id: string
          firm_id: string
          valid_from?: string | null
          valid_to?: string | null
          status: string
          evidence: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          store_id?: string
          firm_id?: string
          valid_from?: string | null
          valid_to?: string | null
          status?: string
          evidence?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "store_firm_periods_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_firm_periods_firm_id_fkey",
            "columns": [
              "firm_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "billing_firms",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "store_firm_periods_store_id_fkey",
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
      billing_firms: {
        Row: {
          id: string
          name: string
          legal_name: string | null
          gstin: string | null
          state_code: string | null
          address: string | null
          notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          legal_name?: string | null
          gstin?: string | null
          state_code?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          legal_name?: string | null
          gstin?: string | null
          state_code?: string | null
          address?: string | null
          notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            "foreignKeyName": "billing_firms_created_by_fkey",
            "columns": [
              "created_by"
            ],
            "isOneToOne": false,
            "referencedRelation": "profiles",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      finance_events: {
        Row: {
          id: number
          entity_type: string
          entity_id: string | null
          action: string
          actor_id: string | null
          actor_role: string | null
          reason: string | null
          before: Json | null
          after: Json | null
          created_at: string
        }
        Insert: {
          id?: number
          entity_type: string
          entity_id?: string | null
          action: string
          actor_id?: string | null
          actor_role?: string | null
          reason?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Update: {
          id?: number
          entity_type?: string
          entity_id?: string | null
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          reason?: string | null
          before?: Json | null
          after?: Json | null
          created_at?: string
        }
        Relationships: []
      }
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
      owner_notes: {
        Row: {
          archived_at: string | null
          content: string
          converted_task_id: string | null
          created_at: string
          created_by: string
          id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          content?: string
          converted_task_id?: string | null
          created_at?: string
          created_by: string
          id?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          content?: string
          converted_task_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_notes_converted_task_id_fkey"
            columns: ["converted_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_decisions: {
        Row: {
          brand: string | null
          created_at: string
          created_by: string
          evidence: Json | null
          evidence_basis: string | null
          followup_id: string | null
          hypothesis: string
          id: string
          kind: string
          learned: string
          measure_filter: string | null
          measure_type: string
          responsible_name: string
          responsible_profile_id: string | null
          result: string | null
          result_note: string
          review_date: string
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          store_id: string | null
          success_measure: string
          task_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          created_by: string
          evidence?: Json | null
          evidence_basis?: string | null
          followup_id?: string | null
          hypothesis: string
          id?: string
          kind: string
          learned?: string
          measure_filter?: string | null
          measure_type: string
          responsible_name?: string
          responsible_profile_id?: string | null
          result?: string | null
          result_note?: string
          review_date: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          store_id?: string | null
          success_measure: string
          task_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          created_by?: string
          evidence?: Json | null
          evidence_basis?: string | null
          followup_id?: string | null
          hypothesis?: string
          id?: string
          kind?: string
          learned?: string
          measure_filter?: string | null
          measure_type?: string
          responsible_name?: string
          responsible_profile_id?: string | null
          result?: string | null
          result_note?: string
          review_date?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          store_id?: string | null
          success_measure?: string
          task_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_decisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "recommendation_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_responsible_profile_id_fkey"
            columns: ["responsible_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_decisions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_followups: {
        Row: {
          created_at: string
          created_by: string
          evidence_text: string
          id: string
          outcome: string
          reason: string
          recommendation_key: string
          signal: Json
          source: string
          source_chat_id: string | null
          status: string
          task_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          evidence_text?: string
          id?: string
          outcome?: string
          reason?: string
          recommendation_key: string
          signal?: Json
          source: string
          source_chat_id?: string | null
          status: string
          task_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evidence_text?: string
          id?: string
          outcome?: string
          reason?: string
          recommendation_key?: string
          signal?: Json
          source?: string
          source_chat_id?: string | null
          status?: string
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_followups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_followups_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_revisions: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          snapshot: Json
          sop_id: string
          version: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          snapshot: Json
          sop_id: string
          version: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          snapshot?: Json
          sop_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_revisions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_revisions_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          created_at: string
          created_by: string | null
          escalate_when: string
          exception_category: string
          id: string
          is_active: boolean
          purpose: string
          sop_key: string
          sort_order: number
          steps: Json
          store_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version: number
          when_to_use: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          escalate_when?: string
          exception_category?: string
          id?: string
          is_active?: boolean
          purpose?: string
          sop_key: string
          sort_order?: number
          steps: Json
          store_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          when_to_use?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          escalate_when?: string
          exception_category?: string
          id?: string
          is_active?: boolean
          purpose?: string
          sop_key?: string
          sort_order?: number
          steps?: Json
          store_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          when_to_use?: string
        }
        Relationships: [
          {
            foreignKeyName: "sops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          conclusion: string
          created_at: string
          created_by: string
          evidence: Json
          evidence_generated_at: string | null
          id: string
          next_week_decisions: string
          status: string
          updated_at: string
          updated_by: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          conclusion?: string
          created_at?: string
          created_by: string
          evidence?: Json
          evidence_generated_at?: string | null
          id?: string
          next_week_decisions?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          conclusion?: string
          created_at?: string
          created_by?: string
          evidence?: Json
          evidence_generated_at?: string | null
          id?: string
          next_week_decisions?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reviews_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          full_name: string | null
          email: string | null
          phone: string | null
          role: string
          is_active: boolean | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          role?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          full_name?: string | null
          email?: string | null
          phone?: string | null
          role?: string
          is_active?: boolean | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "profiles_id_fkey",
            "columns": [
              "id"
            ],
            "isOneToOne": true,
            "referencedRelation": "users",
            "referencedColumns": [
              "id"
            ]
          }
        ]
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
          import_id: string
          chunk_no: number
          rows: Json
          published_at: string | null
        }
        Insert: {
          import_id: string
          chunk_no: number
          rows: Json
          published_at?: string | null
        }
        Update: {
          import_id?: string
          chunk_no?: number
          rows?: Json
          published_at?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "report_import_chunks_import_id_fkey",
            "columns": [
              "import_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "report_imports",
            "referencedColumns": [
              "id"
            ]
          }
        ]
      }
      report_imports: {
        Row: {
          id: string
          store_id: string
          actor_id: string
          fingerprint: string
          report_type: string
          mode: string
          is_bulk: boolean
          file_path: string
          file_name: string
          manifest: Json
          status: string
          failure_message: string | null
          result: Json | null
          created_at: string
          publish_report_id: string | null
        }
        Insert: {
          id?: string
          store_id: string
          actor_id: string
          fingerprint: string
          report_type: string
          mode: string
          is_bulk?: boolean
          file_path: string
          file_name: string
          manifest: Json
          status?: string
          failure_message?: string | null
          result?: Json | null
          created_at?: string
          publish_report_id?: string | null
        }
        Update: {
          id?: string
          store_id?: string
          actor_id?: string
          fingerprint?: string
          report_type?: string
          mode?: string
          is_bulk?: boolean
          file_path?: string
          file_name?: string
          manifest?: Json
          status?: string
          failure_message?: string | null
          result?: Json | null
          created_at?: string
          publish_report_id?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "report_imports_actor_id_fkey",
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
            "foreignKeyName": "report_imports_publish_report_id_fkey",
            "columns": [
              "publish_report_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "reports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "report_imports_store_id_fkey",
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
          id: string
          report_id: string | null
          store_id: string | null
          sale_date: string | null
          bill_no: string | null
          item_name: string | null
          sku: string | null
          barcode: string | null
          brand: string | null
          category: string | null
          size: string | null
          color: string | null
          quantity: number | null
          mrp: number | null
          discount: number | null
          net_sale: number | null
          staff_name: string | null
          customer_name: string | null
          customer_phone: string | null
          raw_data: Json | null
          created_at: string | null
          unit_rate: number | null
          gross_amount: number | null
          cd_percent: number | null
          cd_amount: number | null
          scheme_unit_amount: number | null
          scheme_amount: number | null
          taxable_amount: number | null
          cgst_rate: number | null
          cgst_amount: number | null
          sgst_rate: number | null
          sgst_amount: number | null
          tax_amount: number | null
          hsn_code: string | null
          lot_code: string | null
          lot_number: string | null
          article_code: string | null
          source_line_no: number | null
          line_kind: string | null
          amounts_reconciled: boolean | null
          customer_mobile: string | null
        }
        Insert: {
          id?: string
          report_id?: string | null
          store_id?: string | null
          sale_date?: string | null
          bill_no?: string | null
          item_name?: string | null
          sku?: string | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          size?: string | null
          color?: string | null
          quantity?: number | null
          mrp?: number | null
          discount?: number | null
          net_sale?: number | null
          staff_name?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          raw_data?: Json | null
          created_at?: string | null
          unit_rate?: number | null
          gross_amount?: number | null
          cd_percent?: number | null
          cd_amount?: number | null
          scheme_unit_amount?: number | null
          scheme_amount?: number | null
          taxable_amount?: number | null
          cgst_rate?: number | null
          cgst_amount?: number | null
          sgst_rate?: number | null
          sgst_amount?: number | null
          tax_amount?: number | null
          hsn_code?: string | null
          lot_code?: string | null
          lot_number?: string | null
          article_code?: string | null
          source_line_no?: number | null
          line_kind?: string | null
          amounts_reconciled?: boolean | null
          customer_mobile?: string | null
        }
        Update: {
          id?: string
          report_id?: string | null
          store_id?: string | null
          sale_date?: string | null
          bill_no?: string | null
          item_name?: string | null
          sku?: string | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          size?: string | null
          color?: string | null
          quantity?: number | null
          mrp?: number | null
          discount?: number | null
          net_sale?: number | null
          staff_name?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          raw_data?: Json | null
          created_at?: string | null
          unit_rate?: number | null
          gross_amount?: number | null
          cd_percent?: number | null
          cd_amount?: number | null
          scheme_unit_amount?: number | null
          scheme_amount?: number | null
          taxable_amount?: number | null
          cgst_rate?: number | null
          cgst_amount?: number | null
          sgst_rate?: number | null
          sgst_amount?: number | null
          tax_amount?: number | null
          hsn_code?: string | null
          lot_code?: string | null
          lot_number?: string | null
          article_code?: string | null
          source_line_no?: number | null
          line_kind?: string | null
          amounts_reconciled?: boolean | null
          customer_mobile?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "sales_rows_report_id_fkey",
            "columns": [
              "report_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "reports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "sales_rows_store_id_fkey",
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
          pending_auth_user_id: string | null
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
          pending_auth_user_id?: string | null
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
          pending_auth_user_id?: string | null
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
          id: string
          report_id: string | null
          store_id: string | null
          stock_month: string | null
          item_name: string | null
          sku: string | null
          barcode: string | null
          brand: string | null
          category: string | null
          size: string | null
          color: string | null
          quantity: number | null
          mrp: number | null
          cost_price: number | null
          supplier: string | null
          purchase_date: string | null
          ageing_days: number | null
          raw_data: Json | null
          created_at: string | null
          purchase_rate: number | null
          basic_rate: number | null
          hsn_code: string | null
          lot_code: string | null
          lot_number: string | null
          article_code: string | null
        }
        Insert: {
          id?: string
          report_id?: string | null
          store_id?: string | null
          stock_month?: string | null
          item_name?: string | null
          sku?: string | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          size?: string | null
          color?: string | null
          quantity?: number | null
          mrp?: number | null
          cost_price?: number | null
          supplier?: string | null
          purchase_date?: string | null
          ageing_days?: number | null
          raw_data?: Json | null
          created_at?: string | null
          purchase_rate?: number | null
          basic_rate?: number | null
          hsn_code?: string | null
          lot_code?: string | null
          lot_number?: string | null
          article_code?: string | null
        }
        Update: {
          id?: string
          report_id?: string | null
          store_id?: string | null
          stock_month?: string | null
          item_name?: string | null
          sku?: string | null
          barcode?: string | null
          brand?: string | null
          category?: string | null
          size?: string | null
          color?: string | null
          quantity?: number | null
          mrp?: number | null
          cost_price?: number | null
          supplier?: string | null
          purchase_date?: string | null
          ageing_days?: number | null
          raw_data?: Json | null
          created_at?: string | null
          purchase_rate?: number | null
          basic_rate?: number | null
          hsn_code?: string | null
          lot_code?: string | null
          lot_number?: string | null
          article_code?: string | null
        }
        Relationships: [
          {
            "foreignKeyName": "stock_rows_report_id_fkey",
            "columns": [
              "report_id"
            ],
            "isOneToOne": false,
            "referencedRelation": "reports",
            "referencedColumns": [
              "id"
            ]
          },
          {
            "foreignKeyName": "stock_rows_store_id_fkey",
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
          id: string
          name: string
          code: string
          type: string | null
          location: string | null
          is_active: boolean | null
          monthly_target_enabled: boolean | null
          monthly_target: number | null
          slow_stock_days: number | null
          dead_stock_days: number | null
          created_at: string | null
          updated_at: string | null
          firm_name: string | null
          estimated_margin_pct: number | null
          google_review_url: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          type?: string | null
          location?: string | null
          is_active?: boolean | null
          monthly_target_enabled?: boolean | null
          monthly_target?: number | null
          slow_stock_days?: number | null
          dead_stock_days?: number | null
          created_at?: string | null
          updated_at?: string | null
          firm_name?: string | null
          estimated_margin_pct?: number | null
          google_review_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          code?: string
          type?: string | null
          location?: string | null
          is_active?: boolean | null
          monthly_target_enabled?: boolean | null
          monthly_target?: number | null
          slow_stock_days?: number | null
          dead_stock_days?: number | null
          created_at?: string | null
          updated_at?: string | null
          firm_name?: string | null
          estimated_margin_pct?: number | null
          google_review_url?: string | null
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
      supplier_dues: { Args: { p_until: string }; Returns: { voucher_id: string; firm_name: string; party_id: string; party_name: string; voucher_no: string; reference_no: string | null; voucher_date: string; due_date: string; open_amount: number; days_overdue: number }[] }
      gstr2b_reconcile: { Args: { p_firm: string; p_period: string }; Returns: { status: string; supplier_gstin: string; supplier_name: string | null; doc_no: string; doc_date: string | null; invoice_id: string | null; books_taxable: number | null; books_tax: number | null; portal_taxable: number | null; portal_tax: number | null; itc_available: boolean | null; other_period: string | null }[] }
      import_gstr2b: { Args: { p_document: string; p_firm: string; p_period: string; p_rows: Json }; Returns: number }
      stock_position_store_ids: { Args: Record<PropertyKey, never>; Returns: string[] }
      stock_count_summary: { Args: { p_count: string }; Returns: Json }
      review_stock_count: { Args: { p_count: string; p_note: string | null }; Returns: undefined }
      submit_stock_count: { Args: { p_count: string }; Returns: undefined }
      add_stock_count_extra: { Args: { p_count: string; p_code: string | null; p_item: string | null; p_size: string | null; p_qty: number }; Returns: undefined }
      record_stock_count: { Args: { p_line: string; p_qty: number | null }; Returns: undefined }
      stock_count_sheet: { Args: { p_count: string }; Returns: { id: string; lot_code: string | null; brand: string | null; item_name: string | null; size: string | null; mrp: number | null; expected_qty: number | null; counted_qty: number | null; is_extra: boolean }[] }
      start_stock_count: { Args: { p_store: string; p_title: string | null; p_brand: string | null; p_category: string | null }; Returns: string }
      budget_status: { Args: Record<PropertyKey, never>; Returns: { id: string; brand_id: string; brand: string; store_id: string | null; store_name: string | null; season: string; starts_on: string; ends_on: string; budget_amount: number; purchased: number; remaining: number; used_pct: number; sold_units: number; net_sales: number }[] }
      markdown_candidates: { Args: { p_store: string }; Returns: { brand: string; item_name: string; size: string | null; category: string | null; mrp: number | null; on_hand: number; value_mrp: number; last_sale: string | null; days_without_sale: number; first_seen: string | null; suggested_pct: number }[] }
      transfer_suggestions: { Args: Record<PropertyKey, never>; Returns: { brand: string; item_name: string; size: string | null; from_store_id: string; from_store: string; to_store_id: string; to_store: string; from_on_hand: number; to_sold_30: number; qty: number }[] }
      reorder_suggestions: { Args: { p_store: string; p_days: number; p_cover_days: number }; Returns: { brand: string; item_name: string; size: string | null; sold: number; on_hand: number; suggest_qty: number; other_store_on_hand: number; other_store_names: string | null; last_sale: string }[] }
      brand_sell_through: { Args: { p_store: string; p_days: number }; Returns: { brand: string; sold_units: number; net_sales: number; on_hand: number; on_hand_mrp: number; on_hand_cost: number | null; cost_known_units: number; sell_through_pct: number | null; days_cover: number | null; no_sale_90_units: number; snapshot_date: string | null }[] }
      refresh_stock_position: { Args: { p_store: string }; Returns: boolean }
      customer_visible: { Args: { p_mobile: string }; Returns: boolean }
      customer_purchases: { Args: { p_mobile: string }; Returns: { sale_date: string; store_name: string; bill_no: string | null; item_name: string | null; brand: string | null; size: string | null; quantity: number | null; net_sale: number | null; staff_name: string | null; customer_name: string | null }[] }
      customer_kpis: { Args: { p_store: string | null; p_from: string; p_to: string }; Returns: Json }
      customer_list: { Args: { p_store: string | null; p_segment: string; p_search: string | null; p_limit: number; p_offset: number }; Returns: { mobile: string; name: string | null; first_visit: string; last_visit: string; bills: number; items: number; spend: number; store_count: number; marketing_consent: boolean; do_not_contact: boolean; birthday: string | null; last_message_at: string | null; total_count: number }[] }
      log_customer_message: { Args: { p_mobile: string; p_store: string; p_kind: string }; Returns: undefined }
      save_customer_profile: { Args: { p_mobile: string; p_name: string | null; p_birthday: string | null; p_anniversary: string | null; p_consent: boolean; p_source: string | null; p_do_not_contact: boolean; p_note: string | null }; Returns: undefined }
      store_profit: { Args: { p_store: string; p_month: string }; Returns: Json }
      missing_day_closes: { Args: { p_store: string; p_days?: number }; Returns: string[] }
      day_close_overview: { Args: { p_store: string; p_from: string; p_to: string }; Returns: { id: string; close_date: string; status: string; opening_cash: number; cash_counted: number; upi_amount: number; card_amount: number; other_amount: number; other_note: string | null; cash_deposited: number; note: string | null; review_note: string | null; submitted_by_name: string | null; submitted_at: string; logic_net_sale: number | null; sales_report_uploaded: boolean; cash_expenses: number; expected_cash: number | null; difference: number | null }[] }
      review_day_close: { Args: { p_id: string; p_action: string; p_note: string | null }; Returns: undefined }
      submit_day_close: { Args: { p_store: string; p_date: string; p_opening: number | null; p_cash: number; p_upi: number; p_card: number; p_other: number; p_other_note: string | null; p_deposited: number; p_note: string | null }; Returns: string }
      batches_with_remaining: { Args: { p_store: string | null; p_party: string | null; p_search: string | null; p_unattributed: boolean | null; p_limit: number | null }; Returns: { id: string; store_id: string; firm_id: string; party_id: string | null; brand_id: string | null; source: string; lot_code: string | null; barcode: string | null; article: string | null; size: string | null; description: string | null; mrp: number | null; unit_cost: number | null; cost_basis: string; qty_in: number; received_date: string; attribution: string; remaining: number }[] }
      accounts_summary: { Args: { p_firm: string | null; p_store: string | null; p_brand: string | null; p_from: string; p_to: string }; Returns: { firm_id: string; store_id: string | null; party_id: string; brand_id: string | null; purchases_taxable: number; purchases_total: number; payments: number; credit_notes: number; debit_notes: number; purchase_qty: number }[] }
      statement_comparison: { Args: { p_statement: string }; Returns: Json }
      match_statement: { Args: { p_statement: string }; Returns: number }
      save_supplier_statement: { Args: { p_firm: string; p_party: string; p_from: string; p_to: string; p_opening: number | null; p_closing: number; p_document: string | null; p_lines: Json; p_notes: string | null }; Returns: string }
      reopen_period: { Args: { p_firm: string; p_month: string; p_reason: string }; Returns: undefined }
      close_period: { Args: { p_firm: string; p_month: string }; Returns: undefined }
      period_is_closed: { Args: { p_firm: string; p_date: string }; Returns: boolean }
      settlement_balances: { Args: { p_firm: string | null; p_as_of?: string | null }; Returns: { firm_id: string; party_id: string; settlement_open: number; settlement_due: number; cn_expected: number; cn_pending: number }[] }
      pay_settlement: { Args: { p_settlement: string; p_voucher: string; p_amount: number }; Returns: undefined }
      match_claim: { Args: { p_claim: string; p_voucher: string }; Returns: undefined }
      record_company_figures: { Args: { p_run: string; p_payment: number | null; p_cn: number | null; p_note: string | null }; Returns: undefined }
      set_working_status: { Args: { p_run: string; p_status: string; p_note: string | null }; Returns: undefined }
      prepare_working: { Args: { p_arrangement: string; p_from: string; p_to: string; p_rule_set: string; p_rules: Json | null; p_notes: string | null }; Returns: string }
      compute_working: { Args: { p_rules: Json; p_lines: Json }; Returns: Json }
      transfer_stock_between_stores: { Args: { p_to_store: string; p_date: string; p_items: Json; p_document: string | null; p_note: string | null }; Returns: number }
      record_distributor_transfer: { Args: { p_firm: string; p_from: string; p_to: string; p_date: string; p_amount: number; p_document: string; p_batches: string[] | null; p_narration: string }; Returns: string }
      return_credit_pending: { Args: { p_firm: string | null }; Returns: { firm_id: string; party_id: string; pending: number; returns: number }[] }
      advance_supplier_return: { Args: { p_id: string; p_action: string; p_date: string; p_ref: string | null; p_amount: number | null; p_lines: Json | null; p_cgst: number | null; p_sgst: number | null; p_igst: number | null }; Returns: Json }
      create_supplier_return: { Args: { p_firm: string; p_store: string; p_party: string; p_date: string; p_lines: Json; p_notes: string | null; p_deduct_on: string | null }; Returns: string }
      attribution_summary: { Args: { p_store: string; p_from: string; p_to: string }; Returns: { party_id: string | null; brand_id: string | null; method: string; qty: number; lines: number }[] }
      allocate_sales_line_manually: { Args: { p_allocation: string; p_batch: string; p_note: string }; Returns: undefined }
      allocate_store_sales: { Args: { p_store: string; p_from: string; p_to: string }; Returns: Json }
      attribute_batches: { Args: { p_store: string | null; p_brand: string | null; p_party: string; p_note: string; p_batch?: string | null }; Returns: number }
      create_opening_batches: { Args: { p_report: string; p_as_of: string }; Returns: number }
      batch_remaining: { Args: { p_batch: string }; Returns: number | null }
      open_vouchers: { Args: { p_firm: string; p_party: string; p_side: string }; Returns: { id: string; voucher_no: string; voucher_type: string; voucher_date: string; reference_no: string | null; due_date: string | null; amount: number; settlement_basis: string | null; store_id: string | null; open_amount: number }[] }
      party_ledger: { Args: { p_firm: string; p_party: string; p_from: string; p_to: string; p_offset: number; p_limit: number }; Returns: { voucher_id: string; voucher_no: string; voucher_type: string; voucher_date: string; reference_no: string | null; narration: string | null; status: string; debit: number; credit: number; running_balance: number; opening_balance: number; total_rows: number }[] }
      party_balances: { Args: { p_firm: string | null; p_party?: string | null; p_as_of?: string | null }; Returns: { firm_id: string; party_id: string; ledger_balance: number; open_bills: number; due_now: number; overdue: number; due_unknown: number; sales_basis_open: number; advance: number; unadjusted_notes: number; cn_received: number; disputed: number }[] }
      reverse_voucher: { Args: { p_id: string; p_date: string; p_reason: string }; Returns: string }
      record_supplier_voucher: { Args: { p_type: string; p_firm: string; p_store: string | null; p_party: string; p_date: string; p_amount: number; p_mode: string | null; p_reference: string | null; p_reference_date: string | null; p_reason: string | null; p_taxable: number | null; p_cgst: number | null; p_sgst: number | null; p_igst: number | null; p_narration: string | null; p_allocations: Json | null; p_due_date: string | null }; Returns: string }
      post_purchase_invoice: { Args: { p_id: string; p_brand?: string | null }; Returns: string }
      purchase_invoice_check: { Args: { p_id: string }; Returns: Json }
      release_allocation: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      allocate_voucher: { Args: { p_from: string; p_to: string; p_amount: number }; Returns: string }
      voucher_open_amount: { Args: { p_voucher: string }; Returns: number | null }
      finance_create_store: { Args: { p_name: string; p_code: string; p_firm: string; p_from: string; p_location: string | null }; Returns: string }
      sales_input_coverage: { Args: { p_store: string; p_from: string; p_to: string }; Returns: { day: string; status: string; report_id: string | null; item_lines: number; summary_lines: number; no_amount_lines: number; unreconciled_lines: number; net_sale: number | null }[] }
      review_finance_document: { Args: { p_id: string; p_kind: string; p_firm: string | null; p_store: string | null; p_party: string | null; p_title: string | null; p_doc_no: string | null; p_doc_date: string | null; p_amount: number | null; p_status: string; p_notes: string | null }; Returns: undefined }
      finalize_finance_document: { Args: { p_id: string }; Returns: Json }
      reserve_finance_document: { Args: { p_kind: string; p_store: string | null; p_firm: string | null; p_party: string | null; p_file_name: string; p_mime: string; p_size: number; p_sha256: string; p_title: string | null; p_doc_no: string | null; p_doc_date: string | null }; Returns: Json }
      store_billing_firm_label: { Args: { p_store: string; p_date: string }; Returns: string | null }
      store_firm_on: { Args: { p_store: string; p_date: string }; Returns: string | null }
      finance_any: { Args: { p_action: string }; Returns: boolean }
      finance_can: { Args: { p_action: string; p_firm: string | null; p_store: string | null }; Returns: boolean }
      convert_owner_note_to_task: { Args: { p_note_id: string }; Returns: string }
      create_followup_task: {
        Args: {
          p_evidence?: string
          p_key: string
          p_signal?: Json
          p_source: string
          p_source_chat_id?: string
          p_title: string
        }
        Returns: string
      }
      evaluate_business_decision: { Args: { p_decision_id: string }; Returns: Json }
      review_business_decision: {
        Args: { p_decision_id: string; p_learned?: string; p_result: string; p_result_note?: string }
        Returns: Json
      }
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
      archive_stock_report: {
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
      publish_stock_import_part: { Args: { p_import: string }; Returns: Json }
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
