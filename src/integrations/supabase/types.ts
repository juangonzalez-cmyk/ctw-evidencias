export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          slug: string;
          name: string;
          short_name: string | null;
          description: string | null;
          starts_on: string | null;
          ends_on: string | null;
          status: string;
          logo_url: string | null;
          brand_primary: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          short_name?: string | null;
          description?: string | null;
          starts_on?: string | null;
          ends_on?: string | null;
          status?: string;
          logo_url?: string | null;
          brand_primary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          short_name?: string | null;
          description?: string | null;
          starts_on?: string | null;
          ends_on?: string | null;
          status?: string;
          logo_url?: string | null;
          brand_primary?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          event_id: string;
          slug: string;
          name: string;
          role: string;
          emoji: string;
          accent: string;
          is_coordinator: boolean;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          slug: string;
          name: string;
          role?: string;
          emoji?: string;
          accent?: string;
          is_coordinator?: boolean;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          slug?: string;
          name?: string;
          role?: string;
          emoji?: string;
          accent?: string;
          is_coordinator?: boolean;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          event_id: string;
          marca: string;
          tipo_beneficio: string;
          dia: string | null;
          hora: string | null;
          responsable: string;
          status: string;
          evidencia_url: string | null;
          subido_por: string | null;
          hora_subida: string | null;
          notas: string | null;
          speaker: string | null;
          is_timed: boolean;
          category: string | null;
          notion_page_id: string | null;
          media_type: string;
          stage: string | null;
          brands: string[] | null;
          captured_brands: string[] | null;
          fase: string;
          tipo_entrega: string;
          flujo: string;
          acta_recepcion_url: string | null;
          firma_nombre: string | null;
          entrega_ctw_at: string | null;
          entrega_sponsor_at: string | null;
          evidencias: Json;
          approved_at: string | null;
          rejected_at: string | null;
          edited_at: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          marca: string;
          tipo_beneficio: string;
          dia?: string | null;
          hora?: string | null;
          responsable: string;
          status?: string;
          evidencia_url?: string | null;
          subido_por?: string | null;
          hora_subida?: string | null;
          notas?: string | null;
          speaker?: string | null;
          is_timed?: boolean;
          category?: string | null;
          notion_page_id?: string | null;
          media_type?: string;
          stage?: string | null;
          brands?: string[] | null;
          captured_brands?: string[] | null;
          fase?: string;
          tipo_entrega?: string;
          flujo?: string;
          acta_recepcion_url?: string | null;
          firma_nombre?: string | null;
          entrega_ctw_at?: string | null;
          entrega_sponsor_at?: string | null;
          evidencias?: Json;
          approved_at?: string | null;
          rejected_at?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          marca?: string;
          tipo_beneficio?: string;
          dia?: string | null;
          hora?: string | null;
          responsable?: string;
          status?: string;
          evidencia_url?: string | null;
          subido_por?: string | null;
          hora_subida?: string | null;
          notas?: string | null;
          speaker?: string | null;
          is_timed?: boolean;
          category?: string | null;
          notion_page_id?: string | null;
          media_type?: string;
          stage?: string | null;
          brands?: string[] | null;
          captured_brands?: string[] | null;
          fase?: string;
          tipo_entrega?: string;
          flujo?: string;
          acta_recepcion_url?: string | null;
          firma_nombre?: string | null;
          entrega_ctw_at?: string | null;
          entrega_sponsor_at?: string | null;
          evidencias?: Json;
          approved_at?: string | null;
          rejected_at?: string | null;
          edited_at?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sponsor_reports: {
        Row: {
          id: string;
          event_id: string;
          sponsor_unified_name: string;
          token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          sponsor_unified_name: string;
          token?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          sponsor_unified_name?: string;
          token?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      survey_templates: {
        Row: {
          id: string;
          event_id: string;
          title: string;
          description: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          title?: string;
          description?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          title?: string;
          description?: string | null;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      survey_questions: {
        Row: {
          id: string;
          template_id: string;
          prompt: string;
          question_type: string;
          options: Json;
          required: boolean;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          prompt: string;
          question_type?: string;
          options?: Json;
          required?: boolean;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          prompt?: string;
          question_type?: string;
          options?: Json;
          required?: boolean;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      survey_responses: {
        Row: {
          id: string;
          event_id: string;
          sponsor_report_id: string;
          answers: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          sponsor_report_id: string;
          answers?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_id?: string;
          sponsor_report_id?: string;
          answers?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
