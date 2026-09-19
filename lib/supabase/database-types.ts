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
  public: {
    Tables: {
      availability: {
        Row: {
          business_id: string
          end_time: string
          id: string
          is_active: boolean
          start_time: string
          weekday: number
        }
        Insert: {
          business_id: string
          end_time: string
          id?: string
          is_active?: boolean
          start_time: string
          weekday: number
        }
        Update: {
          business_id?: string
          end_time?: string
          id?: string
          is_active?: boolean
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_blocks: {
        Row: {
          business_id: string
          created_at: string
          end_at: string
          id: string
          reason: string | null
          start_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          end_at: string
          id?: string
          reason?: string | null
          start_at: string
        }
        Update: {
          business_id?: string
          created_at?: string
          end_at?: string
          id?: string
          reason?: string | null
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_blocks_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancel_reason_category: string | null
          created_at: string
          customer_email_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_note: string | null
          customer_note_category: string | null
          customer_note_requires_follow_up: boolean
          customer_phone_snapshot: string
          duration_minutes_snapshot: number
          end_at: string
          id: string
          price_cents_snapshot: number
          public_code: string
          reminder_claim_token: string | null
          reminder_claimed_at: string | null
          reminder_sent_at: string | null
          service_id: string | null
          service_name_snapshot: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          cancel_reason_category?: string | null
          created_at?: string
          customer_email_snapshot?: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_note?: string | null
          customer_note_category?: string | null
          customer_note_requires_follow_up?: boolean
          customer_phone_snapshot: string
          duration_minutes_snapshot: number
          end_at: string
          id?: string
          price_cents_snapshot: number
          public_code?: string
          reminder_claim_token?: string | null
          reminder_claimed_at?: string | null
          reminder_sent_at?: string | null
          service_id: string
          service_name_snapshot: string
          start_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancel_reason_category?: string | null
          created_at?: string
          customer_email_snapshot?: string | null
          customer_id?: string
          customer_name_snapshot?: string
          customer_note?: string | null
          customer_note_category?: string | null
          customer_note_requires_follow_up?: boolean
          customer_phone_snapshot?: string
          duration_minutes_snapshot?: number
          end_at?: string
          id?: string
          price_cents_snapshot?: number
          public_code?: string
          reminder_claim_token?: string | null
          reminder_claimed_at?: string | null
          reminder_sent_at?: string | null
          service_id?: string
          service_name_snapshot?: string
          start_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          booking_window_days: number
          created_at: string
          current_subscription_id: string | null
          description: string | null
          id: string
          is_active: boolean
          min_notice_minutes: number
          name: string
          owner_id: string
          phone: string
          plan: Database["public"]["Enums"]["business_plan"]
          slot_interval_minutes: number
          slug: string
          updated_at: string
        }
        Insert: {
          booking_window_days?: number
          created_at?: string
          current_subscription_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_notice_minutes?: number
          name: string
          owner_id: string
          phone: string
          plan?: Database["public"]["Enums"]["business_plan"]
          slot_interval_minutes?: number
          slug: string
          updated_at?: string
        }
        Update: {
          booking_window_days?: number
          created_at?: string
          current_subscription_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          min_notice_minutes?: number
          name?: string
          owner_id?: string
          phone?: string
          plan?: Database["public"]["Enums"]["business_plan"]
          slot_interval_minutes?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          business_id: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          business_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price_cents?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          grace_period_end: string | null
          id: string
          mp_preapproval_id: string
          plan: Database["public"]["Enums"]["business_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          id?: string
          mp_preapproval_id: string
          plan?: Database["public"]["Enums"]["business_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          id?: string
          mp_preapproval_id?: string
          plan?: Database["public"]["Enums"]["business_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_attempts: {
        Row: {
          business_id: string
          claimed_at: string | null
          created_at: string
          expires_at: string | null
          expected_subscription_id: string | null
          id: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["billing_attempt_kind"]
          provider_preapproval_id: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["billing_attempt_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          claimed_at?: string | null
          created_at?: string
          expires_at?: string | null
          expected_subscription_id?: string | null
          id?: string
          idempotency_key: string
          kind: Database["public"]["Enums"]["billing_attempt_kind"]
          provider_preapproval_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["billing_attempt_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          claimed_at?: string | null
          created_at?: string
          expires_at?: string | null
          expected_subscription_id?: string | null
          id?: string
          idempotency_key?: string
          kind?: Database["public"]["Enums"]["billing_attempt_kind"]
          provider_preapproval_id?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["billing_attempt_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_attempts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_attempts_expected_subscription_id_fkey"
            columns: ["expected_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          business_id: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          service_id: string
          start_at: string
          status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          id?: string
          service_id: string
          start_at: string
          status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          id?: string
          service_id?: string
          start_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_booking_by_public_code: {
        Args: { p_cancel_reason?: string; p_code: string }
        Returns: {
          business_id: string
          cancel_reason: string | null
          cancel_reason_category: string | null
          created_at: string
          customer_email_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_note: string | null
          customer_note_category: string | null
          customer_note_requires_follow_up: boolean
          customer_phone_snapshot: string
          duration_minutes_snapshot: number
          end_at: string
          id: string
          price_cents_snapshot: number
          public_code: string
          reminder_sent_at: string | null
          service_id: string | null
          service_name_snapshot: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_booking_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      convert_waitlist_entry: {
        Args: { p_entry_id: string }
        Returns: {
          business_id: string
          cancel_reason: string | null
          cancel_reason_category: string | null
          created_at: string
          customer_email_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_note: string | null
          customer_note_category: string | null
          customer_note_requires_follow_up: boolean
          customer_phone_snapshot: string
          duration_minutes_snapshot: number
          end_at: string
          id: string
          price_cents_snapshot: number
          public_code: string
          reminder_sent_at: string | null
          service_id: string
          service_name_snapshot: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "waitlist_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_booking: {
        Args: {
          p_business_id: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_note?: string
          p_customer_phone: string
          p_service_id: string
          p_start_at: string
        }
        Returns: {
          business_id: string
          cancel_reason: string | null
          cancel_reason_category: string | null
          created_at: string
          customer_email_snapshot: string | null
          customer_id: string
          customer_name_snapshot: string
          customer_note: string | null
          customer_note_category: string | null
          customer_note_requires_follow_up: boolean
          customer_phone_snapshot: string
          duration_minutes_snapshot: number
          end_at: string
          id: string
          price_cents_snapshot: number
          public_code: string
          reminder_sent_at: string | null
          service_id: string | null
          service_name_snapshot: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      downgrade_expired_subscriptions: { Args: never; Returns: number }
      claim_billing_attempt: {
        Args: {
          p_business_id: string
          p_expected_subscription_id?: string
          p_idempotency_key?: string
          p_kind: Database["public"]["Enums"]["billing_attempt_kind"]
        }
        Returns: Database["public"]["Tables"]["billing_attempts"]["Row"]
      }
      apply_subscription_snapshot: {
        Args: {
          p_business_id: string
          p_current_period_end?: string | null
          p_current_period_start?: string | null
          p_expected_current_subscription_id?: string | null
          p_grace_period_end?: string | null
          p_make_current?: boolean
          p_mp_preapproval_id: string
          p_status: Database["public"]["Enums"]["subscription_status"]
          p_subscription_id: string
        }
        Returns: {
          business_id: string
          effective_grace_period_end: string | null
          effective_plan: Database["public"]["Enums"]["business_plan"]
          is_current: boolean
          subscription_id: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
        }[]
      }
      start_billing_attempt: {
        Args: { p_attempt_id: string; p_idempotency_key: string }
        Returns: Database["public"]["Tables"]["billing_attempts"]["Row"]
      }
      finish_billing_attempt: {
        Args: {
          p_attempt_id: string
          p_provider_preapproval_id?: string | null
          p_status: Database["public"]["Enums"]["billing_attempt_status"]
        }
        Returns: Database["public"]["Tables"]["billing_attempts"]["Row"]
      }
      link_billing_attempt_subscription: {
        Args: {
          p_attempt_id: string
          p_mp_preapproval_id: string
          p_status?: Database["public"]["Enums"]["subscription_status"]
        }
        Returns: Database["public"]["Tables"]["subscriptions"]["Row"]
      }
      start_billing_retry: {
        Args: {
          p_attempt_id: string
          p_expected_mp_preapproval_id: string
          p_expected_subscription_id: string
          p_idempotency_key: string
        }
        Returns: Database["public"]["Tables"]["billing_attempts"]["Row"]
      }
      claim_billing_reconciliation: {
        Args: { p_claim_token: string; p_lease_seconds?: number; p_resource_key: string }
        Returns: boolean
      }
      release_billing_reconciliation: {
        Args: { p_claim_token: string; p_resource_key: string }
        Returns: boolean
      }
      reconcile_billing_attempt_subscription: {
        Args: {
          p_attempt_id: string
          p_current_period_end?: string | null
          p_current_period_start?: string | null
          p_grace_period_end?: string | null
          p_mp_preapproval_id: string
          p_status: Database["public"]["Enums"]["subscription_status"]
          p_claim_token?: string | null
        }
        Returns: Database["public"]["Tables"]["subscriptions"]["Row"]
      }
      mark_billing_attempt_reconciliation: {
        Args: {
          p_attempt_id: string
          p_claim_token: string
          p_expected_status: Database["public"]["Enums"]["billing_attempt_status"]
          p_new_status: Database["public"]["Enums"]["billing_attempt_status"]
          p_provider_preapproval_id?: string | null
        }
        Returns: Database["public"]["Tables"]["billing_attempts"]["Row"]
      }
      generate_public_code: { Args: never; Returns: string }
      get_booking_by_public_code: {
        Args: { p_code: string }
        Returns: {
          business_name: string
          business_phone: string
          business_slug: string
          end_at: string
          service_name: string
          start_at: string
        }[]
      }
      get_public_business: {
        Args: { p_slug: string }
        Returns: {
          description: string | null
          id: string
          name: string
          slug: string
        }[]
      }
      get_public_services: {
        Args: { p_business_id: string }
        Returns: {
          business_id: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          price_cents: number
        }[]
      }
      get_due_booking_reminders: {
        Args: { p_lead_minutes?: number }
        Returns: {
          business_id: string
          business_name: string
          business_slug: string
          customer_email_snapshot: string
          customer_name_snapshot: string
          id: string
          public_code: string
          reminder_claim_token: string
          service_name_snapshot: string
          start_at: string
        }[]
      }
      get_waitlist_for_slot: {
        Args: { p_business_id: string; p_start_at: string }
        Returns: {
          business_id: string
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id: string
          service_id: string
          start_at: string
          status: string
        }[]
      }
      join_waitlist: {
        Args: {
          p_business_id: string
          p_customer_email?: string
          p_customer_name: string
          p_customer_phone: string
          p_service_id: string
          p_start_at: string
        }
        Returns: {
          business_id: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          service_id: string
          start_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "waitlist_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      notify_waitlist_entry: {
        Args: { p_entry_id: string }
        Returns: {
          business_id: string
          created_at: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          id: string
          service_id: string
          start_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "waitlist_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_booking_reminders: { Args: never; Returns: number }
      delete_service_if_unused: {
        Args: { p_business_id: string; p_now?: string; p_service_id: string }
        Returns: string
      }
      set_booking_reminders_sent: {
        Args: { p_booking_ids: string[]; p_claim_tokens?: string[] }
        Returns: number
      }
    }
    Enums: {
      booking_status: "confirmed" | "completed" | "cancelled" | "no_show"
      billing_attempt_kind: "initial" | "retry"
      billing_attempt_status: "reserved" | "creating" | "unknown" | "linked" | "failed" | "ambiguous"
      business_plan: "free" | "pro"
      subscription_status: "pending" | "authorized" | "paused" | "cancelled"
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
      booking_status: ["confirmed", "completed", "cancelled", "no_show"],
      billing_attempt_kind: ["initial", "retry"],
      billing_attempt_status: ["reserved", "creating", "unknown", "linked", "failed", "ambiguous"],
      business_plan: ["free", "pro"],
      subscription_status: ["pending", "authorized", "paused", "cancelled"],
    },
  },
} as const
