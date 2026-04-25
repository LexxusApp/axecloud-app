-- AxéCloud — colunas esperadas por /api/tenant-info (erro Postgres 42703 = coluna inexistente)
-- Rode no Supabase: SQL Editor → Run (pode executar várias vezes; IF NOT EXISTS)

-- ========== public.perfil_lider ==========
-- .select em tenant-info: id, nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url
-- upsert: id, email, nome_terreiro, role, is_admin_global, tenant_id, updated_at
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS nome_terreiro TEXT;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS cargo TEXT;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS is_admin_global BOOLEAN DEFAULT false;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.perfil_lider ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ========== public.filhos_de_santo ==========
-- .select: id, nome, lider_id, tenant_id | lider_id, tenant_id
-- filtros: user_id, email
ALTER TABLE public.filhos_de_santo ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.filhos_de_santo ADD COLUMN IF NOT EXISTS lider_id UUID;
ALTER TABLE public.filhos_de_santo ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE public.filhos_de_santo ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.filhos_de_santo ADD COLUMN IF NOT EXISTS email TEXT;

-- ========== public.subscriptions ==========
-- .select: plan, status, expires_at — id = auth user (mesmo UUID do perfil_lider)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'axe';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
