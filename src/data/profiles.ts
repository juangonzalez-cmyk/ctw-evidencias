import type { Tables } from "@/integrations/supabase/types";

export type Profile = Tables<"profiles">;

export const getProfileBySlug = (profiles: Profile[], slug: string | null) =>
  profiles.find((p) => p.slug === slug) || null;
