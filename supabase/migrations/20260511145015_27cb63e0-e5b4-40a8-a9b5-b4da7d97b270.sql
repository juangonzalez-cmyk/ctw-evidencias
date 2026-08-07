ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz NULL;