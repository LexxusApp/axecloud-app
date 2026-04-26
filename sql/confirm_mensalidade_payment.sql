-- Execute no SQL Editor do Supabase (projeto AxéCloud).
-- Garante lançamento atômico: financeiro + agregado mensal (caixa do mês).

CREATE TABLE IF NOT EXISTS financial_monthly_summary (
  tenant_id uuid NOT NULL,
  year_month text NOT NULL,
  total_entradas numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, year_month)
);

CREATE OR REPLACE FUNCTION public.confirm_mensalidade_payment(
  p_filho_id uuid,
  p_filho_nome text,
  p_valor numeric,
  p_competencia_date date,
  p_payment_date date,
  p_tenant_id uuid,
  p_lider_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_month text;
  v_desc text;
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'valor inválido';
  END IF;

  v_month := to_char(p_payment_date, 'YYYY-MM');
  v_desc := format(
    'Mensalidade - %s (competência %s) (ID:%s)',
    COALESCE(NULLIF(trim(p_filho_nome), ''), 'Filho'),
    to_char(p_competencia_date, 'YYYY-MM-DD'),
    p_filho_id::text
  );

  INSERT INTO financeiro (
    tipo,
    valor,
    categoria,
    data,
    descricao,
    tenant_id,
    lider_id,
    filho_id
  ) VALUES (
    'entrada',
    p_valor,
    'Mensalidade',
    p_payment_date,
    v_desc,
    p_tenant_id,
    p_lider_id,
    p_filho_id
  )
  RETURNING id INTO v_id;

  INSERT INTO financial_monthly_summary (tenant_id, year_month, total_entradas)
  VALUES (p_tenant_id, v_month, p_valor)
  ON CONFLICT (tenant_id, year_month)
  DO UPDATE SET
    total_entradas = financial_monthly_summary.total_entradas + EXCLUDED.total_entradas,
    updated_at = now();

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_mensalidade_payment(uuid, text, numeric, date, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_mensalidade_payment(uuid, text, numeric, date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_mensalidade_payment(uuid, text, numeric, date, date, uuid, uuid) TO service_role;
