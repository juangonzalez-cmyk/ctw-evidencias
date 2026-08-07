-- Tasks table
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tasks_responsable on public.tasks(responsable);
create index idx_tasks_status on public.tasks(status);

alter table public.tasks enable row level security;

create policy "anyone can view tasks" on public.tasks for select using (true);
create policy "anyone can insert tasks" on public.tasks for insert with check (true);
create policy "anyone can update tasks" on public.tasks for update using (true);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger tasks_set_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

-- Storage bucket
insert into storage.buckets (id, name, public) values ('evidencias', 'evidencias', true);

create policy "public read evidencias" on storage.objects for select using (bucket_id = 'evidencias');
create policy "public upload evidencias" on storage.objects for insert with check (bucket_id = 'evidencias');
create policy "public update evidencias" on storage.objects for update using (bucket_id = 'evidencias');