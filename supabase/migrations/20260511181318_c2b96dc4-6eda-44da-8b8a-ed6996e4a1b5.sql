-- Backup helper functions for the tasks table.
-- All names are strictly validated to prevent SQL injection.

CREATE OR REPLACE FUNCTION public.list_task_backups()
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
  cnt bigint;
BEGIN
  FOR rec IN
    SELECT t.table_name AS tname
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name LIKE 'tasks_backup_%'
    ORDER BY t.table_name DESC
  LOOP
    EXECUTE format('SELECT COUNT(*) FROM public.%I', rec.tname) INTO cnt;
    table_name := rec.tname;
    row_count := cnt;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_task_backup(p_name text)
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cnt bigint;
BEGIN
  IF p_name !~ '^tasks_backup_[0-9]{4}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}(_pre_restore)?$' THEN
    RAISE EXCEPTION 'Invalid backup name: %', p_name;
  END IF;
  EXECUTE format('CREATE TABLE public.%I AS TABLE public.tasks', p_name);
  EXECUTE format('SELECT COUNT(*) FROM public.%I', p_name) INTO cnt;
  table_name := p_name;
  row_count := cnt;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_task_backup(p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_name !~ '^tasks_backup_[0-9]{4}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}(_pre_restore)?$' THEN
    RAISE EXCEPTION 'Invalid backup name: %', p_name;
  END IF;
  EXECUTE format('DROP TABLE IF EXISTS public.%I', p_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_task_backup(p_name text, p_pre_restore_name text)
RETURNS TABLE(restored_from text, pre_restore text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cnt bigint;
BEGIN
  IF p_name !~ '^tasks_backup_[0-9]{4}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}(_pre_restore)?$' THEN
    RAISE EXCEPTION 'Invalid backup name: %', p_name;
  END IF;
  IF p_pre_restore_name !~ '^tasks_backup_[0-9]{4}_[0-9]{2}_[0-9]{2}_[0-9]{2}_[0-9]{2}_pre_restore$' THEN
    RAISE EXCEPTION 'Invalid pre-restore backup name: %', p_pre_restore_name;
  END IF;

  -- Verify backup exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_name
  ) THEN
    RAISE EXCEPTION 'Backup % does not exist', p_name;
  END IF;

  -- Create safety snapshot of current state
  EXECUTE format('CREATE TABLE public.%I AS TABLE public.tasks', p_pre_restore_name);

  -- Replace tasks contents with backup contents
  EXECUTE 'DELETE FROM public.tasks';
  EXECUTE format('INSERT INTO public.tasks SELECT * FROM public.%I', p_name);

  EXECUTE format('SELECT COUNT(*) FROM public.%I', p_name) INTO cnt;

  restored_from := p_name;
  pre_restore := p_pre_restore_name;
  row_count := cnt;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_task_backups() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_task_backup(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_task_backup(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_task_backup(text, text) TO anon, authenticated;