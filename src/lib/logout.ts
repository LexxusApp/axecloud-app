import { supabase } from './supabase';
import { APP_VERSION } from '../config/version';

/**
 * Remove todos os caches do Cache Storage (PWA / Workbox).
 */
async function deleteAllCacheStorage(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* Safari / modo privado */
  }
}

/** Desregistra service workers para não servir shell antigo após logout. */
async function unregisterAllServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    /* ignorar */
  }
}

/**
 * Logout com reset completo (mobile/PWA): encerra sessão no Supabase, apaga storage,
 * limpa caches do PWA e força navegação full reload para /login.
 *
 * Regrava só `axecloud_version` com a versão atual do app após o clear, para não
 * disparar o fluxo de “nova versão” no próximo carregamento.
 */
export async function performFastLogout(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await supabase.auth.signOut();
  } catch {
    /* rede / timeout — emergência no finally */
  }

  try {
    await deleteAllCacheStorage();
    await unregisterAllServiceWorkers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    try {
      localStorage.setItem('axecloud_version', APP_VERSION);
    } catch {
      /* ignorar */
    }
  } catch {
    /* limpeza falhou — mesmo assim redireciona */
  } finally {
    window.location.href = '/login';
  }
}

/**
 * Deploy / nova versão: mesmo reset agressivo, grava a nova versão e recarrega na raiz.
 */
export async function performVersionBumpLogout(systemVersion: string): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await supabase.auth.signOut();
  } catch {
    /* ignorar */
  }

  try {
    await deleteAllCacheStorage();
    await unregisterAllServiceWorkers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    try {
      localStorage.setItem('axecloud_version', systemVersion);
    } catch {
      /* ignorar */
    }
    window.location.assign('/?updated=true');
  } catch {
    try {
      window.localStorage.clear();
      localStorage.setItem('axecloud_version', systemVersion);
    } catch {
      /* ignorar */
    }
    window.location.assign('/?updated=true');
  }
}
