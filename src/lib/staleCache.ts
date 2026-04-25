/**
 * Cache leve (localStorage) para stale-while-revalidate: última sessão aparece na hora;
 * a rede atualiza em segundo plano. Prefixo isola de outras apps no mesmo domínio.
 */
const PREFIX = 'axe_v2_';
const MAX_BYTES = 4_000_000;

/** Retorna null se a chave não existir. Permite cachear array vazio []. */
export function readStaleCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    const { data } = JSON.parse(raw) as { t: number; data: T };
    return data as T;
  } catch {
    return null;
  }
}

export function writeStaleCache(key: string, data: unknown): void {
  try {
    const payload = JSON.stringify({ t: Date.now(), data });
    if (payload.length > MAX_BYTES) {
      console.warn('[staleCache] payload too large, skip', key);
      return;
    }
    localStorage.setItem(PREFIX + key, payload);
  } catch (e) {
    console.warn('[staleCache] write failed', key, e);
  }
}

export function clearStaleCacheKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
