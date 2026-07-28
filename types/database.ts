// Hand-authored to mirror /database/migrations/*.sql exactly. Keep in sync manually —
// there is no live Supabase project link in this environment to run `supabase gen types`.

export type UserRole = "worker" | "recruiter" | "company_owner" | "support" | "admin";
export type UserStatus = "incomplete" | "pending_verification" | "active" | "suspended" | "blocked";
export type VerificationTier = "t0" | "t1" | "t2" | "t3";
export type SkillLevel = "base" | "intermedio" | "avanzato";
export type CompanyStatus = "pending_verification" | "active" | "limited" | "suspended";
export type CompanyMemberRole = "owner" | "recruiter";
export type JobStatus =
  | "draft"
  | "published"
  | "in_selection"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "disputed"
  | "canceled"
  | "expired";
export type UrgencyTier = "standard" | "blinknow";
export type ApplicationType = "application" | "invite";
export type ApplicationStatus =
  | "sent"
  | "viewed"
  | "shortlisted"
  | "info_requested"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "expired";
export type AssignmentStatus = "confirmed" | "in_progress" | "completed" | "disputed" | "canceled";
export type CheckEventType = "check_in" | "check_out";
export type CheckEventMethod = "gps" | "manual" | "qr";
export type PaymentStatus = "draft" | "pending" | "confirmed" | "paid" | "refunded" | "disputed";
export type ModerationStatus = "pending" | "published" | "hidden";
export type DisputeStatus = "open" | "collecting" | "deciding" | "resolved" | "appealed" | "closed";
export type NotificationChannel = "in_app" | "email";
export type SkillTaxonomyStatus = "active" | "deprecated";

/** geography(Point,4326) columns are read via the `*_geojson` RPC helpers, not parsed client-side. */
export type GeographyPoint = string;

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          role: UserRole;
          status: UserStatus;
          full_name: string;
          consents: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          phone?: string | null;
          role?: UserRole;
          status?: UserStatus;
          full_name: string;
          consents?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      worker_profiles: {
        Row: {
          user_id: string;
          birth_date: string | null;
          home_location: GeographyPoint | null;
          operating_radius_km: number;
          bio: string | null;
          completeness_score: number;
          reliability_score: number;
          verification_tier: VerificationTier;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          birth_date?: string | null;
          home_location?: GeographyPoint | null;
          operating_radius_km?: number;
          bio?: string | null;
          completeness_score?: number;
          reliability_score?: number;
          verification_tier?: VerificationTier;
        };
        Update: Partial<Database["public"]["Tables"]["worker_profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "worker_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      skill_taxonomy: {
        Row: {
          id: string;
          name: string;
          category: string;
          synonyms: string[];
          status: SkillTaxonomyStatus;
          version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          synonyms?: string[];
          status?: SkillTaxonomyStatus;
          version?: number;
        };
        Update: Partial<Database["public"]["Tables"]["skill_taxonomy"]["Insert"]>;
        Relationships: [];
      };
      worker_skills: {
        Row: {
          worker_id: string;
          skill_id: string;
          level: SkillLevel;
          verified: boolean;
          verified_at: string | null;
        };
        Insert: {
          worker_id: string;
          skill_id: string;
          level?: SkillLevel;
          verified?: boolean;
          verified_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["worker_skills"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "worker_skills_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "worker_profiles";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "worker_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skill_taxonomy";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_availability: {
        Row: {
          id: string;
          worker_id: string;
          day_of_week: number | null;
          start_time: string;
          end_time: string;
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          worker_id: string;
          day_of_week?: number | null;
          start_time: string;
          end_time: string;
          expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["worker_availability"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "worker_availability_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "worker_profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      companies: {
        Row: {
          id: string;
          legal_name: string;
          vat_number: string | null;
          status: CompanyStatus;
          billing_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          legal_name: string;
          vat_number?: string | null;
          status?: CompanyStatus;
          billing_email?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
        Relationships: [];
      };
      company_members: {
        Row: {
          company_id: string;
          user_id: string;
          role: CompanyMemberRole;
          invited_at: string;
          accepted_at: string | null;
        };
        Insert: {
          company_id: string;
          user_id: string;
          role?: CompanyMemberRole;
          invited_at?: string;
          accepted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["company_members"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      company_locations: {
        Row: {
          id: string;
          company_id: string;
          label: string;
          address: string;
          location: GeographyPoint;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          label: string;
          address: string;
          location: GeographyPoint;
        };
        Update: Partial<Database["public"]["Tables"]["company_locations"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_locations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      jobs: {
        Row: {
          id: string;
          company_id: string;
          location_id: string;
          created_by: string;
          title: string;
          description: string;
          category: string;
          positions_count: number;
          pay_amount_cents: number;
          pay_currency: string;
          starts_at: string;
          ends_at: string;
          application_deadline: string;
          status: JobStatus;
          version: number;
          urgency_tier: UrgencyTier;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          location_id: string;
          created_by: string;
          title: string;
          description: string;
          category: string;
          positions_count: number;
          pay_amount_cents: number;
          pay_currency?: string;
          starts_at: string;
          ends_at: string;
          application_deadline: string;
          status?: JobStatus;
          version?: number;
          urgency_tier?: UrgencyTier;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "company_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      job_requirements: {
        Row: { job_id: string; skill_id: string; mandatory: boolean };
        Insert: { job_id: string; skill_id: string; mandatory?: boolean };
        Update: Partial<Database["public"]["Tables"]["job_requirements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "job_requirements_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_requirements_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skill_taxonomy";
            referencedColumns: ["id"];
          },
        ];
      };
      applications: {
        Row: {
          id: string;
          job_id: string;
          worker_id: string;
          type: ApplicationType;
          status: ApplicationStatus;
          match_score: number | null;
          match_reasons: unknown[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          worker_id: string;
          type?: ApplicationType;
          status?: ApplicationStatus;
          match_score?: number | null;
          match_reasons?: unknown[];
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "applications_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "worker_profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      assignments: {
        Row: {
          id: string;
          application_id: string;
          job_id: string;
          worker_id: string;
          status: AssignmentStatus;
          confirmed_terms_snapshot: Record<string, unknown>;
          confirmed_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          job_id: string;
          worker_id: string;
          status?: AssignmentStatus;
          confirmed_terms_snapshot: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["assignments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "assignments_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: true;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assignments_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "worker_profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      check_events: {
        Row: {
          id: string;
          assignment_id: string;
          type: CheckEventType;
          occurred_at: string;
          method: CheckEventMethod;
          location: GeographyPoint | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          type: CheckEventType;
          occurred_at?: string;
          method?: CheckEventMethod;
          location?: GeographyPoint | null;
          note?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["check_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "check_events_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          assignment_id: string;
          gross_amount_cents: number;
          platform_fee_cents: number;
          fee_version: string;
          net_amount_cents: number;
          currency: string;
          status: PaymentStatus;
          provider: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          gross_amount_cents: number;
          platform_fee_cents?: number;
          fee_version?: string;
          net_amount_cents: number;
          currency?: string;
          status?: PaymentStatus;
          provider?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payments_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          assignment_id: string;
          author_id: string;
          recipient_id: string;
          rating_dimensions: Record<string, number>;
          comment: string | null;
          published_at: string | null;
          moderation_status: ModerationStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          author_id: string;
          recipient_id: string;
          rating_dimensions?: Record<string, number>;
          comment?: string | null;
          published_at?: string | null;
          moderation_status?: ModerationStatus;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "reviews_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      disputes: {
        Row: {
          id: string;
          assignment_id: string;
          opened_by: string;
          type: string;
          status: DisputeStatus;
          resolution: string | null;
          economic_impact_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          opened_by: string;
          type: string;
          status?: DisputeStatus;
          resolution?: string | null;
          economic_impact_cents?: number;
        };
        Update: Partial<Database["public"]["Tables"]["disputes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "disputes_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          channel: NotificationChannel;
          payload: Record<string, unknown>;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: string;
          channel?: NotificationChannel;
          payload?: Record<string, unknown>;
          read_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          resource_type: string;
          resource_id?: string | null;
          metadata?: Record<string, unknown>;
        };
        Update: never;
        Relationships: [];
      };
      feature_flags: {
        Row: {
          key: string;
          description: string;
          enabled_globally: boolean;
          enabled_cities: string[];
          enabled_categories: string[];
          updated_at: string;
        };
        Insert: {
          key: string;
          description: string;
          enabled_globally?: boolean;
          enabled_cities?: string[];
          enabled_categories?: string[];
        };
        Update: Partial<Database["public"]["Tables"]["feature_flags"]["Insert"]>;
        Relationships: [];
      };
      points_ledger: {
        Row: {
          id: string;
          user_id: string;
          points: number;
          reason: string;
          reference_type: string | null;
          reference_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          points: number;
          reason: string;
          reference_type?: string | null;
          reference_id?: string | null;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_company_with_owner: {
        Args: { p_legal_name: string; p_vat_number?: string | null };
        Returns: string;
      };
      find_company_account_by_email: {
        Args: { p_email: string };
        Returns: { id: string; full_name: string }[];
      };
      candidate_workers_for_job: {
        Args: { p_job_id: string };
        Returns: {
          worker_id: string;
          full_name: string;
          distance_km: number;
          operating_radius_km: number;
          reliability_score: number;
          status: UserStatus;
        }[];
      };
      candidate_jobs_for_worker: {
        Args: { p_worker_id: string };
        Returns: { job_id: string; distance_km: number }[];
      };
      confirm_candidate: {
        Args: { p_application_id: string };
        Returns: string;
      };
      accept_invite: {
        Args: { p_application_id: string };
        Returns: string;
      };
      check_in_assignment: {
        Args: { p_assignment_id: string; p_method?: CheckEventMethod; p_note?: string | null };
        Returns: undefined;
      };
      check_out_assignment: {
        Args: { p_assignment_id: string; p_method?: CheckEventMethod; p_note?: string | null };
        Returns: undefined;
      };
      confirm_assignment_completion: {
        Args: { p_assignment_id: string };
        Returns: undefined;
      };
      cancel_assignment: {
        Args: { p_assignment_id: string; p_note?: string | null };
        Returns: undefined;
      };
      calculate_platform_fee_cents: {
        Args: { p_gross_amount_cents: number };
        Returns: number;
      };
      confirm_payment: {
        Args: { p_payment_id: string };
        Returns: undefined;
      };
      mark_payment_paid: {
        Args: { p_payment_id: string };
        Returns: undefined;
      };
      admin_set_user_status: {
        Args: { p_user_id: string; p_status: UserStatus };
        Returns: undefined;
      };
      admin_set_company_status: {
        Args: { p_company_id: string; p_status: CompanyStatus };
        Returns: undefined;
      };
      open_dispute: {
        Args: { p_assignment_id: string; p_type: string };
        Returns: string;
      };
      resolve_dispute: {
        Args: { p_dispute_id: string; p_resolution: string };
        Returns: undefined;
      };
    };
  };
}
