-- CTW Evidencias — schema multi-evento
-- Proyecto permanente: eventos → perfiles → tareas → informes → encuestas

create extension if not exists "pgcrypto";

-- ========== EVENTS ==========
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_name text,
  description text,
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  logo_url text,
  brand_primary text default '#96e631',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== PROFILES ==========
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slug text not null,
  name text not null,
  role text not null default '',
  emoji text not null default '👤',
  accent text not null default 'from-[#96e631] to-[#009542]',
  is_coordinator boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slug)
);

create index if not exists idx_profiles_event on public.profiles(event_id);

-- ========== TASKS ==========
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  marca text not null,
  tipo_beneficio text not null,
  dia text,
  hora text,
  responsable text not null,
  status text not null default 'pendiente',
  evidencia_url text,
  subido_por text,
  hora_subida timestamptz,
  notas text,
  speaker text,
  is_timed boolean not null default false,
  category text,
  notion_page_id text,
  media_type text not null default 'photo',
  stage text,
  brands text[],
  captured_brands text[],
  fase text not null default 'durante_evento',
  tipo_entrega text not null default 'evidencia',
  flujo text not null default 'simple' check (flujo in ('simple', 'stand_recepcion')),
  acta_recepcion_url text,
  firma_nombre text,
  entrega_ctw_at timestamptz,
  entrega_sponsor_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tasks_event on public.tasks(event_id);
create index if not exists idx_tasks_responsable on public.tasks(event_id, responsable);
create index if not exists idx_tasks_status on public.tasks(event_id, status);
create index if not exists idx_tasks_marca on public.tasks(event_id, marca);

-- ========== SPONSOR REPORTS ==========
create table if not exists public.sponsor_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sponsor_unified_name text not null,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz not null default now(),
  unique (event_id, sponsor_unified_name)
);

create index if not exists idx_sponsor_reports_event on public.sponsor_reports(event_id);
create index if not exists idx_sponsor_reports_token on public.sponsor_reports(token);

-- ========== SURVEY ==========
create table if not exists public.survey_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null default 'Encuesta de satisfacción',
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.survey_templates(id) on delete cascade,
  prompt text not null,
  question_type text not null default 'scale' check (question_type in ('scale', 'scale_10', 'text', 'yes_no', 'choice')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Migración segura si la tabla ya existía con el check antiguo
alter table public.survey_questions drop constraint if exists survey_questions_question_type_check;
alter table public.survey_questions
  add constraint survey_questions_question_type_check
  check (question_type in ('scale', 'scale_10', 'text', 'yes_no', 'choice'));
alter table public.survey_questions
  add column if not exists options jsonb not null default '[]'::jsonb;

create index if not exists idx_survey_questions_template on public.survey_questions(template_id);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sponsor_report_id uuid not null references public.sponsor_reports(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (sponsor_report_id)
);

create index if not exists idx_survey_responses_event on public.survey_responses(event_id);

-- ========== TRIGGERS ==========
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

drop trigger if exists survey_templates_set_updated_at on public.survey_templates;
create trigger survey_templates_set_updated_at before update on public.survey_templates
for each row execute function public.set_updated_at();

-- ========== RLS (operación de evento; sin auth por ahora) ==========
alter table public.events enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.sponsor_reports enable row level security;
alter table public.survey_templates enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;

drop policy if exists "events_all" on public.events;
drop policy if exists "profiles_all" on public.profiles;
drop policy if exists "tasks_all" on public.tasks;
drop policy if exists "sponsor_reports_all" on public.sponsor_reports;
drop policy if exists "survey_templates_all" on public.survey_templates;
drop policy if exists "survey_questions_all" on public.survey_questions;
drop policy if exists "survey_responses_all" on public.survey_responses;

create policy "events_all" on public.events for all using (true) with check (true);
create policy "profiles_all" on public.profiles for all using (true) with check (true);
create policy "tasks_all" on public.tasks for all using (true) with check (true);
create policy "sponsor_reports_all" on public.sponsor_reports for all using (true) with check (true);
create policy "survey_templates_all" on public.survey_templates for all using (true) with check (true);
create policy "survey_questions_all" on public.survey_questions for all using (true) with check (true);
create policy "survey_responses_all" on public.survey_responses for all using (true) with check (true);

-- ========== STORAGE ==========
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

drop policy if exists "evidencias_read" on storage.objects;
drop policy if exists "evidencias_insert" on storage.objects;
drop policy if exists "evidencias_update" on storage.objects;
drop policy if exists "evidencias_delete" on storage.objects;
create policy "evidencias_read" on storage.objects for select using (bucket_id = 'evidencias');
create policy "evidencias_insert" on storage.objects for insert with check (bucket_id = 'evidencias');
create policy "evidencias_update" on storage.objects for update using (bucket_id = 'evidencias');
create policy "evidencias_delete" on storage.objects for delete using (bucket_id = 'evidencias');

-- Sin seed de evento: la app inicia el wizard "crear desde cero".
-- (Opcional) Puedes crear CTF manualmente desde la UI.

do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;
