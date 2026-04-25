-- AxéCloud — tabela usada por POST /api/push-subscribe (api/index.ts)
-- Colunas: user_id, tenant_id, subscription_object (JSON do PushManager: endpoint, keys.auth, keys.p256dh), updated_at
-- O app faz upsert com onConflict: 'user_id,tenant_id'

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  -- Objeto completo retornado por subscription.toJSON() / PushSubscription
  subscription_object JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_user_tenant_key UNIQUE (user_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant_id
  ON public.push_subscriptions (tenant_id);

-- Opcional: consulta por endpoint (código remove inscrição inválida)
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint
  ON public.push_subscriptions ((subscription_object->>'endpoint'));

COMMENT ON TABLE public.push_subscriptions IS 'Web Push: uma linha por (usuário, terreiro); keys dentro de subscription_object';

-- RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A API na Vercel usa SUPABASE_SERVICE_ROLE_KEY e ignora RLS; estas políticas cobrem acesso via cliente/PostgREST com JWT.
DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;

CREATE POLICY "push_subs_select_own"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "push_subs_insert_own"
  ON public.push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subs_update_own"
  ON public.push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "push_subs_delete_own"
  ON public.push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- anon: sem política = sem acesso direto
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;
