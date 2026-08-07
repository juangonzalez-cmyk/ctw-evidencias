
-- 1. Table
CREATE TABLE public.sponsor_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_unified_name text NOT NULL UNIQUE,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX idx_sponsor_reports_token ON public.sponsor_reports(token);

ALTER TABLE public.sponsor_reports ENABLE ROW LEVEL SECURITY;

-- Public can read (needed to resolve token -> sponsor on the public page)
CREATE POLICY "anyone can read sponsor_reports"
  ON public.sponsor_reports FOR SELECT
  USING (true);

-- No public writes; writes happen only via SECURITY DEFINER RPC below.
-- (No INSERT/UPDATE/DELETE policies = denied.)

-- 2. Token generator (24 alphanumeric chars, crypto-secure via gen_random_bytes)
CREATE OR REPLACE FUNCTION public.generate_report_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  alphabet text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  bytes bytea;
  result text := '';
  i int;
BEGIN
  bytes := gen_random_bytes(24);
  FOR i IN 0..23 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- 3. Ensure tokens for a list of unified sponsor names (called from coordinator UI)
CREATE OR REPLACE FUNCTION public.ensure_sponsor_reports(p_names text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  n text;
BEGIN
  IF p_names IS NULL THEN RETURN; END IF;
  FOREACH n IN ARRAY p_names LOOP
    IF n IS NULL OR length(trim(n)) = 0 THEN CONTINUE; END IF;
    INSERT INTO public.sponsor_reports (sponsor_unified_name, token)
    VALUES (trim(n), public.generate_report_token())
    ON CONFLICT (sponsor_unified_name) DO NOTHING;
  END LOOP;
END;
$$;

-- 4. Public report fetcher: takes a token, returns sponsor name + approved evidence rows
CREATE OR REPLACE FUNCTION public.get_sponsor_report(p_token text)
RETURNS TABLE (
  sponsor_unified_name text,
  task_id uuid,
  marca text,
  tipo_beneficio text,
  fase text,
  dia text,
  hora text,
  stage text,
  speaker text,
  responsable text,
  evidencia_url text,
  media_type text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sponsor text;
BEGIN
  SELECT sr.sponsor_unified_name INTO v_sponsor
  FROM public.sponsor_reports sr
  WHERE sr.token = p_token;

  IF v_sponsor IS NULL THEN
    RETURN; -- empty result; caller treats as 404
  END IF;

  RETURN QUERY
  SELECT
    v_sponsor,
    t.id,
    t.marca,
    t.tipo_beneficio,
    t.fase,
    t.dia,
    t.hora,
    t.stage,
    t.speaker,
    t.responsable,
    t.evidencia_url,
    t.media_type,
    t.approved_at,
    t.created_at
  FROM public.tasks t
  WHERE t.status = 'aprobada'
    AND t.deleted_at IS NULL
    AND t.rejected_at IS NULL
    AND t.evidencia_url IS NOT NULL
    AND length(trim(t.evidencia_url)) > 0;
  -- Note: marca filtering happens client-side using BRAND_GROUPS to match the
  -- exact same unification logic used elsewhere in the app.
END;
$$;

-- Allow anonymous + authenticated to call the public RPCs
GRANT EXECUTE ON FUNCTION public.get_sponsor_report(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_sponsor_reports(text[]) TO anon, authenticated;
