ALTER TABLE public.tasks ADD COLUMN fase TEXT NOT NULL DEFAULT 'durante_evento';
ALTER TABLE public.tasks ADD CONSTRAINT fase_valida CHECK (fase IN ('pre_evento', 'durante_evento', 'post_evento'));
CREATE INDEX idx_tasks_fase ON public.tasks(fase);