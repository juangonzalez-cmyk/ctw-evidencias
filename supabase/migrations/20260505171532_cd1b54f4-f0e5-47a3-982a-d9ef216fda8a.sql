-- Add media_type and stage to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS stage text;

-- Allow public delete (needed to wipe & reseed via client)
DROP POLICY IF EXISTS "anyone can delete tasks" ON public.tasks;
CREATE POLICY "anyone can delete tasks" ON public.tasks FOR DELETE USING (true);

-- Wipe existing tasks so the app re-seeds with new schedule + media_type
DELETE FROM public.tasks;