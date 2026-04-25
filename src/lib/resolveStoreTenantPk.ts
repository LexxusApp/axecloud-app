import { supabase } from './supabase';

/**
 * Coluna `produtos.tenant_id` / `loja_pedidos.tenant_id` costuma ser o `id` de `perfil_lider`,
 * enquanto o app expõe às vezes `perfil_lider.tenant_id` (UUID “lógico”) ou o auth id do zelador.
 */
export async function resolveStoreTenantPk(params: {
  tenantIdFromContext?: string | null;
  fallbackUserId?: string | null;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const tenantFromContext =
    params.tenantIdFromContext != null && String(params.tenantIdFromContext).trim() !== ''
      ? String(params.tenantIdFromContext).trim()
      : '';
  const candidate =
    tenantFromContext ||
    (typeof params.fallbackUserId === 'string' && params.fallbackUserId.trim() !== ''
      ? params.fallbackUserId.trim()
      : '') ||
    user.id;
  const { data: perfilRow } = await supabase
    .from('perfil_lider')
    .select('id')
    .or(`id.eq.${candidate},tenant_id.eq.${candidate}`)
    .maybeSingle();
  const id = (perfilRow?.id ?? candidate) as string;
  if (id == null || String(id).trim() === '') return null;
  return id;
}
