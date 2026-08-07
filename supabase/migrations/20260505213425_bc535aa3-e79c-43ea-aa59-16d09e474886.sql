
ALTER TABLE public.tasks ADD COLUMN brands text[] DEFAULT NULL;
ALTER TABLE public.tasks ADD COLUMN captured_brands text[] DEFAULT '{}';
