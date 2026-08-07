-- Flujo de acta de recepción para stands (foto + firma + 2 horarios de entrega)

alter table public.tasks
  add column if not exists flujo text not null default 'simple';

alter table public.tasks
  drop constraint if exists tasks_flujo_check;

alter table public.tasks
  add constraint tasks_flujo_check
  check (flujo in ('simple', 'stand_recepcion'));

alter table public.tasks
  add column if not exists acta_recepcion_url text;

alter table public.tasks
  add column if not exists firma_nombre text;

alter table public.tasks
  add column if not exists entrega_ctw_at timestamptz;

alter table public.tasks
  add column if not exists entrega_sponsor_at timestamptz;

-- Beneficios de stand existentes pasan al flujo dual
update public.tasks
set flujo = 'stand_recepcion'
where coalesce(flujo, 'simple') = 'simple'
  and (
    category = 'Stands'
    or tipo_beneficio ilike 'Stand %'
  );
