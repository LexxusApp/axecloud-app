/** Persiste o tenant do terreiro por usuário (útil quando props ainda não hidrataram no mobile). */
const LS_PREFIX = 'axecloud_tenant_cache_v1';

export function writeCachedTenantIdForUser(userId: string, tenantId: string) {
  if (!userId || !tenantId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      `${LS_PREFIX}:${userId}`,
      JSON.stringify({ tenant_id: tenantId, t: Date.now() })
    );
  } catch {
    /* quota / modo privado */
  }
}

export function readCachedTenantIdForUser(userId: string): string {
  if (!userId || typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}:${userId}`);
    if (!raw) return '';
    const j = JSON.parse(raw) as { tenant_id?: string };
    return String(j?.tenant_id || '').trim();
  } catch {
    return '';
  }
}

export function clearCachedTenantIdForUser(userId: string) {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${LS_PREFIX}:${userId}`);
  } catch {
    /* */
  }
}

/** Preferência: sessão/tenant-info; fallback: último tenant gravado para este usuário. */
export function resolveTenantIdForFinance(
  tenantFromSession: string | null | undefined,
  userId?: string | null
): string {
  const fromSession = String(tenantFromSession ?? '').trim();
  if (fromSession) return fromSession;
  return readCachedTenantIdForUser(String(userId || ''));
}
