-- Pedidos da loja (filho compra/reserva) visíveis ao zelador no dashboard e na Loja.
-- Execute no SQL Editor do Supabase (projeto AxéCloud).

CREATE TABLE IF NOT EXISTS public.loja_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  filho_id UUID REFERENCES public.filhos_de_santo (id) ON DELETE SET NULL,
  filho_nome TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'reserva')),
  metodo_pagamento TEXT NOT NULL,
  resumo_itens TEXT NOT NULL DEFAULT '',
  valor_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loja_pedidos_tenant_created
  ON public.loja_pedidos (tenant_id, created_at DESC);

COMMENT ON TABLE public.loja_pedidos IS 'Registro de compras/reservas na loja do terreiro (filhos de santo).';

ALTER TABLE public.loja_pedidos ENABLE ROW LEVEL SECURITY;

-- Zelador / gestor: vê pedidos do próprio terreiro (perfil_lider.id = tenant_id na tabela produtos)
DROP POLICY IF EXISTS "loja_pedidos_select_gestor" ON public.loja_pedidos;
CREATE POLICY "loja_pedidos_select_gestor"
  ON public.loja_pedidos FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT pl.id FROM public.perfil_lider pl
      WHERE pl.id = auth.uid() OR pl.tenant_id = auth.uid()
    )
  );

-- Filho: insere pedido vinculado ao próprio cadastro e ao líder (tenant_id = terreiro)
DROP POLICY IF EXISTS "loja_pedidos_insert_filho" ON public.loja_pedidos;
CREATE POLICY "loja_pedidos_insert_filho"
  ON public.loja_pedidos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.filhos_de_santo f
      WHERE f.id = loja_pedidos.filho_id
        AND f.user_id = auth.uid()
        AND (
          loja_pedidos.tenant_id = f.tenant_id
          OR loja_pedidos.tenant_id = f.lider_id
        )
    )
  );
