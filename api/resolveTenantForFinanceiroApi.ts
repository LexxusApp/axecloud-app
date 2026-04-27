/**
 * Normalização e resolução de tenant para rotas `/api/transactions` e `/api/children`
 * (evita query string "undefined" / vazio no mobile e garante escopo no financeiro).
 */

export function normalizeQueryTenantId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return '';
  return s;
}

/** Resolve o ID do terreiro / líder usado em `.eq('tenant_id', …)` e `.or(...)` no service role. */
export async function resolveFinanceiroTenantScope(
  supabaseAdmin: { from: (t: string) => any },
  userId: string | undefined,
  userRole: string | undefined,
  tenantFromQuery: string
): Promise<string> {
  const q = normalizeQueryTenantId(tenantFromQuery);
  const role = String(userRole || '').toLowerCase();

  if (q) return q;

  if (!userId) return '';

  const { data: profile } = await supabaseAdmin
    .from('perfil_lider')
    .select('tenant_id, id')
    .eq('id', userId)
    .maybeSingle();

  const fromProfile = String(profile?.tenant_id || '').trim();
  if (fromProfile) return fromProfile;

  const leaderPk = String(profile?.id || '').trim();
  if (role !== 'filho' && leaderPk) return leaderPk;

  if (role === 'filho') {
    const { data: child } = await supabaseAdmin
      .from('filhos_de_santo')
      .select('lider_id, tenant_id')
      .eq('user_id', userId)
      .maybeSingle();
    const ref = String(child?.lider_id || child?.tenant_id || '').trim();
    if (!ref) return '';
    const { data: leader } = await supabaseAdmin
      .from('perfil_lider')
      .select('tenant_id, id')
      .eq('id', ref)
      .maybeSingle();
    const tid = String(leader?.tenant_id || '').trim();
    if (tid) return tid;
    const lid = String(leader?.id || '').trim();
    if (lid) return lid;
    const ct = String(child?.tenant_id || '').trim();
    if (ct) return ct;
  }

  return '';
}
