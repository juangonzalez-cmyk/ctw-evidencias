-- Marca como stand_recepcion todos los beneficios cuyo tipo o categoría diga Stand
update public.tasks
set
  flujo = 'stand_recepcion',
  category = case
    when category is null or btrim(category) = '' then 'Stands'
    else category
  end,
  -- Si solo tenían foto/doc, vuelven a pendiente hasta completar acta + horarios
  status = case
    when coalesce(status, '') = 'aprobada' then status
    when
      evidencia_url is not null
      and nullif(btrim(evidencia_url), '') is not null
      and acta_recepcion_url is not null
      and nullif(btrim(acta_recepcion_url), '') is not null
      and entrega_ctw_at is not null
      and entrega_sponsor_at is not null
    then 'por_validar'
    else 'pendiente'
  end,
  approved_at = case
    when coalesce(status, '') = 'aprobada' then approved_at
    else null
  end,
  edited_at = now()
where deleted_at is null
  and coalesce(flujo, 'simple') <> 'stand_recepcion'
  and (
    tipo_beneficio ilike '%stand%'
    or category ilike '%stand%'
  );
