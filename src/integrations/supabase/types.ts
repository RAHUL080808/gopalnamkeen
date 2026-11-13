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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bills: {
        Row: {
          amount: number
          balance: number | null
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          paid_amount: number
          shop_id: string
          status: string | null
        }
        Insert: {
          amount: number
          balance?: number | null
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          shop_id: string
          status?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number
          shop_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_order_bills: {
        Row: {
          bill_date: string
          bill_id: string
          created_at: string
          created_by: string
          id: string
          visit_date: string
        }
        Insert: {
          bill_date: string
          bill_id: string
          created_at?: string
          created_by?: string
          id?: string
          visit_date: string
        }
        Update: {
          bill_date?: string
          bill_id?: string
          created_at?: string
          created_by?: string
          id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_order_bills_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: true
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_by: string | null
          amount: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          allocated_by?: string | null
          amount: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          allocated_by?: string | null
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_corrections: {
        Row: {
          created_at: string
          id: string
          new_amount: number | null
          new_mode: Database["public"]["Enums"]["payment_mode"] | null
          payment_id: string
          reason: string
          requested_by: string
          requested_by_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["correction_status"]
          void_payment: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          new_amount?: number | null
          new_mode?: Database["public"]["Enums"]["payment_mode"] | null
          payment_id: string
          reason: string
          requested_by?: string
          requested_by_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          void_payment?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          new_amount?: number | null
          new_mode?: Database["public"]["Enums"]["payment_mode"] | null
          payment_id?: string
          reason?: string
          requested_by?: string
          requested_by_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          void_payment?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_corrections_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bill_id: string | null
          created_at: string
          employee_id: string
          employee_name: string
          employee_role: string
          id: string
          is_void: boolean
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at: string
          reference: string | null
          remarks: string | null
          shop_id: string
        }
        Insert: {
          amount: number
          bill_id?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          employee_role?: string
          id?: string
          is_void?: boolean
          mode: Database["public"]["Enums"]["payment_mode"]
          paid_at?: string
          reference?: string | null
          remarks?: string | null
          shop_id: string
        }
        Update: {
          amount?: number
          bill_id?: string | null
          created_at?: string
          employee_id?: string
          employee_name?: string
          employee_role?: string
          id?: string
          is_void?: boolean
          voided_at?: string | null
          voided_by?: string | null
          void_reason?: string | null
          mode?: Database["public"]["Enums"]["payment_mode"]
          paid_at?: string
          reference?: string | null
          remarks?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      shops: {
        Row: {
          address: string | null
          area: string | null
          contact_name: string | null
          contact_person: string | null
          created_at: string
          id: string
          incharge: string | null
          mobile_number: string | null
          name: string
          phone: string | null
          shop_name: string | null
        }
        Insert: {
          address?: string | null
          area?: string | null
          contact_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          incharge?: string | null
          mobile_number?: string | null
          name: string
          phone?: string | null
          shop_name?: string | null
        }
        Update: {
          address?: string | null
          area?: string | null
          contact_name?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          incharge?: string | null
          mobile_number?: string | null
          name?: string
          phone?: string | null
          shop_name?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_shops: { Args: { _rows: Json }; Returns: Json }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      owner_exists: { Args: never; Returns: boolean }
      recalc_bill: { Args: { _bill_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "owner" | "driver" | "salesman"
      correction_status: "pending" | "approved" | "rejected"
      payment_mode: "cash" | "upi" | "bank_transfer" | "cheque"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["owner", "driver", "salesman"],
      correction_status: ["pending", "approved", "rejected"],
      payment_mode: ["cash", "upi", "bank_transfer", "cheque"],
    },
  },
} as const
