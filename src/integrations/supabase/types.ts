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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      actions_relance: {
        Row: {
          client_id: string | null
          contenu_email: string | null
          created_at: string | null
          date_executee: string | null
          date_prevue: string
          facture_id: string | null
          id: string
          notes: string | null
          statut: string | null
          type_action: string | null
        }
        Insert: {
          client_id?: string | null
          contenu_email?: string | null
          created_at?: string | null
          date_executee?: string | null
          date_prevue: string
          facture_id?: string | null
          id?: string
          notes?: string | null
          statut?: string | null
          type_action?: string | null
        }
        Update: {
          client_id?: string | null
          contenu_email?: string | null
          created_at?: string | null
          date_executee?: string | null
          date_prevue?: string
          facture_id?: string | null
          id?: string
          notes?: string | null
          statut?: string | null
          type_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "actions_relance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_relance_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archive: boolean | null
          code_client: string
          conditions_paiement: string | null
          created_at: string | null
          email: string | null
          exclusion_relance: boolean | null
          id: string
          nom: string
          pays: string | null
          telephone: string | null
          updated_at: string | null
        }
        Insert: {
          archive?: boolean | null
          code_client: string
          conditions_paiement?: string | null
          created_at?: string | null
          email?: string | null
          exclusion_relance?: boolean | null
          id?: string
          nom: string
          pays?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Update: {
          archive?: boolean | null
          code_client?: string
          conditions_paiement?: string | null
          created_at?: string | null
          email?: string | null
          exclusion_relance?: boolean | null
          id?: string
          nom?: string
          pays?: string | null
          telephone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      factures: {
        Row: {
          client_id: string | null
          created_at: string | null
          date_echeance: string
          date_emission: string
          derniere_apparition: string | null
          id: string
          mois_extraction: string | null
          montant: number
          numero_facture: string
          premiere_apparition: string | null
          solde_restant: number | null
          source: string | null
          statut: string | null
          type_document: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date_echeance: string
          date_emission: string
          derniere_apparition?: string | null
          id?: string
          mois_extraction?: string | null
          montant: number
          numero_facture: string
          premiere_apparition?: string | null
          solde_restant?: number | null
          source?: string | null
          statut?: string | null
          type_document?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date_echeance?: string
          date_emission?: string
          derniere_apparition?: string | null
          id?: string
          mois_extraction?: string | null
          montant?: number
          numero_facture?: string
          premiere_apparition?: string | null
          solde_restant?: number | null
          source?: string | null
          statut?: string | null
          type_document?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      imputations_paiement: {
        Row: {
          client_id: string
          commentaire: string | null
          created_at: string
          created_by: string | null
          facture_id: string
          id: string
          montant_impute: number
          paiement_id: string
        }
        Insert: {
          client_id: string
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          facture_id: string
          id?: string
          montant_impute: number
          paiement_id: string
        }
        Update: {
          client_id?: string
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          facture_id?: string
          id?: string
          montant_impute?: number
          paiement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "imputations_paiement_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imputations_paiement_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imputations_paiement_paiement_id_fkey"
            columns: ["paiement_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          date_import: string | null
          emitido_em: string | null
          erreurs: string | null
          id: string
          mois: string
          nb_lignes_brutes: number | null
          nb_lignes_parsees: number | null
          nom_fichier: string
          source: string | null
          statut: string | null
          storage_path: string | null
        }
        Insert: {
          date_import?: string | null
          emitido_em?: string | null
          erreurs?: string | null
          id?: string
          mois: string
          nb_lignes_brutes?: number | null
          nb_lignes_parsees?: number | null
          nom_fichier: string
          source?: string | null
          statut?: string | null
          storage_path?: string | null
        }
        Update: {
          date_import?: string | null
          emitido_em?: string | null
          erreurs?: string | null
          id?: string
          mois?: string
          nb_lignes_brutes?: number | null
          nb_lignes_parsees?: number | null
          nom_fichier?: string
          source?: string | null
          statut?: string | null
          storage_path?: string | null
        }
        Relationships: []
      }
      rapports_quotidiens: {
        Row: {
          created_at: string | null
          date_rapport: string
          factures_payees_depuis_dernier: string | null
          id: string
          nb_actions_jour: number | null
          nb_appels_j15: number | null
          nb_emails_j7: number | null
          nb_factures_en_cours: number | null
          nb_mises_en_demeure_j30: number | null
          nouvelles_factures: string | null
          resume_ia: string | null
          total_creances: number | null
          total_en_retard: number | null
        }
        Insert: {
          created_at?: string | null
          date_rapport: string
          factures_payees_depuis_dernier?: string | null
          id?: string
          nb_actions_jour?: number | null
          nb_appels_j15?: number | null
          nb_emails_j7?: number | null
          nb_factures_en_cours?: number | null
          nb_mises_en_demeure_j30?: number | null
          nouvelles_factures?: string | null
          resume_ia?: string | null
          total_creances?: number | null
          total_en_retard?: number | null
        }
        Update: {
          created_at?: string | null
          date_rapport?: string
          factures_payees_depuis_dernier?: string | null
          id?: string
          nb_actions_jour?: number | null
          nb_appels_j15?: number | null
          nb_emails_j7?: number | null
          nb_factures_en_cours?: number | null
          nb_mises_en_demeure_j30?: number | null
          nouvelles_factures?: string | null
          resume_ia?: string | null
          total_creances?: number | null
          total_en_retard?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      can_write: {
        Args: Record<string, never>
        Returns: boolean
      }
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "reader"
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
    Enums: {},
  },
} as const
