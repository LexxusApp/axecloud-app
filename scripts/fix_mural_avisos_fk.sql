-- AxéCloud — mural: remove QUALQUER FK em mural_avisos.tenant_id e recria apontando para perfil_lider(id).
-- Supabase → SQL Editor → rode o bloco inteiro.
--
-- Confirme que o app (.env) usa o MESMO projeto em que você executa este SQL.
--
-- Linhas órfãs (avisos sem líder em perfil_lider) impedem VALIDATE; o INSERT novo ainda é checado pela FK.
-- Descomente se o VALIDATE falhar:
--
-- DELETE FROM public.mural_avisos ma
-- WHERE NOT EXISTS (SELECT 1 FROM public.perfil_lider p WHERE p.id = ma.tenant_id);

-- 1) Remove todas as FKs da coluna tenant_id (nomes de constraint variam entre projetos)
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

-- 2) Recria FK (NOT VALID = não revalida linhas antigas agora; novos inserts passam pela FK)
ALTER TABLE public.mural_avisos
  ADD CONSTRAINT mural_avisos_tenant_id_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES public.perfil_lider(id)
  ON DELETE CASCADE
  NOT VALID;

-- 3) Opcional: validar linhas antigas (pode falhar se houver órfãos)
-- ALTER TABLE public.mural_avisos VALIDATE CONSTRAINT mural_avisos_tenant_id_fkey;
