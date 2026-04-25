-- Último recurso: remove TODAS as FKs em mural_avisos.tenant_id e NÃO recria.
-- O app deixa de ter checagem de FK no Postgres para esse campo (integridade só no código).
-- Supabase → SQL Editor.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'mural_avisos'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'tenant_id'
  LOOP
    EXECUTE format('ALTER TABLE public.mural_avisos DROP CONSTRAINT IF EXISTS %I CASCADE', r.constraint_name);
  END LOOP;
END $$;
