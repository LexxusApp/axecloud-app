/**
 * Recarga agressiva para PWA preso em bundle/cache antigo ou sessão inconsistente.
 * Não usar reload(true) — depreciado; reload() basta após limpar SW/caches.
 */
export function performEmergencyHardReload(): void {
  try {
    sessionStorage.setItem('axecloud_emergency_reload_at', String(Date.now()));
  } catch {
    /* */
  }
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

  window.location.reload();
}
