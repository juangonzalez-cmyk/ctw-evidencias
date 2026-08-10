-- Varios soportes por beneficio (archivo + link, etc.)
alter table public.tasks
  add column if not exists evidencias jsonb not null default '[]'::jsonb;

comment on column public.tasks.evidencias is
  'Array de soportes: [{id,url,kind,label?,added_at,added_by?}]. evidencia_url sigue siendo el primario.';

-- Backfill: si hay evidencia_url y la lista está vacía, crear un ítem
update public.tasks
set evidencias = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'url', evidencia_url,
    'kind', case
      when coalesce(media_type, '') = 'link' then 'link'
      when coalesce(media_type, '') = 'video' then 'video'
      when coalesce(media_type, '') in ('pdf', 'document') then coalesce(media_type, 'document')
      else 'photo'
    end,
    'label', null,
    'added_at', coalesce(hora_subida, updated_at, now()),
    'added_by', subido_por
  )
)
where evidencia_url is not null
  and trim(evidencia_url) <> ''
  and (evidencias is null or evidencias = '[]'::jsonb);
