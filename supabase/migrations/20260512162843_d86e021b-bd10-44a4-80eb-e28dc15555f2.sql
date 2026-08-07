DROP FUNCTION IF EXISTS public.get_sponsor_report(text);

CREATE OR REPLACE FUNCTION public.get_sponsor_report(p_token text)
 RETURNS TABLE(
    sponsor_unified_name text,
    task_id uuid,
    marca text,
    tipo_beneficio text,
    tipo_entrega text,
    fase text,
    dia text,
    hora text,
    stage text,
    speaker text,
    responsable text,
    notas text,
    evidencia_url text,
    media_type text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sponsor text;
BEGIN
  SELECT sr.sponsor_unified_name INTO v_sponsor
  FROM public.sponsor_reports sr
  WHERE sr.token = p_token;

  IF v_sponsor IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_sponsor,
    t.id,
    t.marca,
    t.tipo_beneficio,
    t.tipo_entrega,
    t.fase,
    t.dia,
    t.hora,
    t.stage,
    t.speaker,
    t.responsable,
    t.notas,
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
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sponsor_report(text) TO anon, authenticated;