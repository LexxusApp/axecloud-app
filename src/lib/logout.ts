import { supabase } from './supabase';

/** Mantido entre sessões só para controle de deploy / atualização forçada. */
const PRESERVED_LS_KEYS = new Set(['axecloud_version']);

/**
 * Remove sessão Supabase, caches de tenant e dados do app em localStorage/sessionStorage.
 * Preserva `axecloud_version` (ser sobrescrito depois em atualização forçada, se aplicável).
 */
export function clearClientAuthAndTenantStorage(): void {
  if (typeof window === 'undefined') return;

  const lsRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || PRESERVED_LS_KEYS.has(key)) continue;
    if (
      key.startsWith('sb-') ||
      key.includes('supabase') ||
      key.startsWith('axecloud_') ||
      key.startsWith('axe_v2_')
    ) {
      lsRemove.push(key);
    }
  }
  lsRemove.forEach((k) => localStorage.removeItem(k));

  const ssRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith('sb-') ||
      key.includes('supabase') ||
      key.startsWith('axecloud_') ||
      key.startsWith('axe_v2_')
    ) {
      ssRemove.push(key);
    }
  }
  ssRemove.forEach((k) => sessionStorage.removeItem(k));
}

function invalidateServiceWorkerAndCachesBestEffort(): void {
  if (typeof window === 'undefined') return;
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => void r.unregister());
    });
  }
  if (typeof caches !== 'undefined') {
    void caches.keys().then((keys) => {
      keys.forEach((k) => void caches.delete(k));
    });
  }
}

/**
 * Logout imediato (mobile): não aguarda rede.
 * signOut em segundo plano + limpeza síncrona + navegação full reload para /login.
 */
export function performFastLogout(): void {
  void supabase.auth.signOut();
  clearClientAuthAndTenantStorage();
  invalidateServiceWorkerAndCachesBestEffort();
  window.location.href = '/login';
}

/**
 * Atualização de versão (APP_VERSION): mesma limpeza agressiva, grava nova versão e recarrega na raiz.
 */
export function performVersionBumpLogout(systemVersion: string): void {
  void supabase.auth.signOut();
  clearClientAuthAndTenantStorage();
  try {
    localStorage.setItem('axecloud_version', systemVersion);
  } catch {
    /* quota / privado */
  }
  invalidateServiceWorkerAndCachesBestEffort();
  window.location.assign('/?updated=true');
}
