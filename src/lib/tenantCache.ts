/** Persiste o tenant do terreiro por usuário (útil quando props ainda não hidrataram no mobile). */
const LS_PREFIX = 'axecloud_tenant_cache_v1';
const SS_PREFIX = 'axecloud_tenant_ss_v1';

function parseTenantPayload(raw: string | null): string {
  if (!raw) return '';
  try {
    const j = JSON.parse(raw) as { tenant_id?: string };
    return String(j?.tenant_id || '').trim();
  } catch {
    return '';
  }
}

export function writeCachedTenantIdForUser(userId: string, tenantId: string) {
  if (!userId || !tenantId || typeof window === 'undefined') return;
  const payload = JSON.stringify({ tenant_id: tenantId, t: Date.now() });
  try {
    localStorage.setItem(`${LS_PREFIX}:${userId}`, payload);
  } catch {
    /* quota / modo privado */
  }
  try {
    sessionStorage.setItem(`${SS_PREFIX}:${userId}`, payload);
  } catch {
    /* sessão / iframe */
  }
}

export function readCachedTenantIdForUser(userId: string): string {
  if (!userId || typeof window === 'undefined') return '';
  try {
    const ls = parseTenantPayload(localStorage.getItem(`${LS_PREFIX}:${userId}`));
    if (ls) return ls;
  } catch {
    /* */
  }
  try {
    return parseTenantPayload(sessionStorage.getItem(`${SS_PREFIX}:${userId}`));
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
  try {
    sessionStorage.removeItem(`${SS_PREFIX}:${userId}`);
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
