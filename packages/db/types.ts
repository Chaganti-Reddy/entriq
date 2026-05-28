// packages/db/types.ts
// Auto-generated database types mirroring the Supabase schema.
// These are used by the API service layer for type-safe DB access.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          name: string;
          email: string;
          password_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          password_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          password_hash?: string;
          created_at?: string;
        };
      };
      events: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          description: string | null;
          date: string | null;
          location: string | null;
          slug: string;
          admin_password: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          description?: string | null;
          date?: string | null;
          location?: string | null;
          slug: string;
          admin_password: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          description?: string | null;
          date?: string | null;
          location?: string | null;
          slug?: string;
          admin_password?: string;
          is_active?: boolean;
          created_at?: string;
        };
      };
      registrations: {
        Row: {
          id: string;
          event_id: string;
          email: string;
          name: string;
          surname: string;
          state: string;
          city: string;
          mobile: string;
          profession: string;
          other_info: string | null;
          unique_code: string;
          qr_url: string;
          status: 'not_approved' | 'approved';
          email_sent: boolean;
          registered_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          email: string;
          name: string;
          surname: string;
          state: string;
          city: string;
          mobile: string;
          profession: string;
          other_info?: string | null;
          unique_code: string;
          qr_url: string;
          status?: 'not_approved' | 'approved';
          email_sent?: boolean;
          registered_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          email?: string;
          name?: string;
          surname?: string;
          state?: string;
          city?: string;
          mobile?: string;
          profession?: string;
          other_info?: string | null;
          unique_code?: string;
          qr_url?: string;
          status?: 'not_approved' | 'approved';
          email_sent?: boolean;
          registered_at?: string;
        };
      };
      checkins: {
        Row: {
          id: string;
          registration_id: string;
          event_id: string;
          approved_at: string;
          approved_by: string;
        };
        Insert: {
          id?: string;
          registration_id: string;
          event_id: string;
          approved_at?: string;
          approved_by?: string;
        };
        Update: {
          id?: string;
          registration_id?: string;
          event_id?: string;
          approved_at?: string;
          approved_by?: string;
        };
      };
    };
  };
}
