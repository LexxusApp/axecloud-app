/**
 * Fallback no cliente (JWT do usuário): recupera tenant vinculado ao login
 * quando `tenantData.tenant_id` e o cache local estão vazios.
 */
import { supabase } from './supabase';

export async function resolveTenantFromSupabase(
  userId: string,
  email?: string | null
): Promise<string> {
  if (!userId) return '';

  const { data: byId } = await supabase
    .from('perfil_lider')
    .select('tenant_id, id')
    .eq('id', userId)
    .maybeSingle();

  if (byId) {
    const tid = String(byId.tenant_id || '').trim() || String(byId.id || '').trim();
    if (tid) return tid;
  }

  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const { data: byEmail } = await supabase
      .from('perfil_lider')
      .select('tenant_id, id')
      .eq('email', em)
      .maybeSingle();
    if (byEmail) {
      const tid = String(byEmail.tenant_id || '').trim() || String(byEmail.id || '').trim();
      if (tid) return tid;
    }
  }

  const { data: child } = await supabase
    .from('filhos_de_santo')
    .select('lider_id, tenant_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!child) return '';

  const leaderRef = String(child.lider_id || child.tenant_id || '').trim();
  if (leaderRef) {
    const { data: leader } = await supabase
      .from('perfil_lider')
      .select('tenant_id, id')
      .eq('id', leaderRef)
      .maybeSingle();
    if (leader) {
      const tid = String(leader.tenant_id || '').trim() || String(leader.id || '').trim();
      if (tid) return tid;
    }
  }

  const ct = String(child.tenant_id || '').trim();
  if (ct) {
    const { data: rows } = await supabase
      .from('perfil_lider')
      .select('tenant_id, id')
      .eq('tenant_id', ct)
      .limit(1);
    const row = rows?.[0];
    if (row) {
      const tid = String(row.tenant_id || '').trim() || String(row.id || '').trim();
      if (tid) return tid;
    }
    return ct;
  }

  return '';
}
