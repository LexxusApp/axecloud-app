import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import {PwaInstallProvider} from './contexts/PwaInstallContext';
import {EmergencyReloadBeacon} from './components/EmergencyReloadBeacon';
import App from './App.tsx';
import './index.css';

let swRegistration: ServiceWorkerRegistration | undefined;
let reloadingFromSwUpdate = false;

function hardReloadForSwUpdate() {
  if (reloadingFromSwUpdate) return;
  reloadingFromSwUpdate = true;
  // Compatibilidade explícita com navegadores antigos/PWA embarcado.
  window.location.reload(true as any);
}

function checkServiceWorkerUpdate() {
  void swRegistration?.update().catch(() => {
    /* offline ou SW indisponível */
  });
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    // Nova versão publicada — reload completo para não ficar preso em bundle/cache antigo
    hardReloadForSwUpdate();
  },
  onRegisteredSW(swUrl, registration) {
    swRegistration = registration;
    if (import.meta.env.DEV) {
      console.info('[PWA] Service Worker ativo:', swUrl, registration?.scope);
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Falha ao registrar o Service Worker:', error);
  },
});

/** Ao voltar ao app (mobile/PWA), verifica atualização do SW — evita estado quebrado após deploy. */
window.addEventListener('focus', checkServiceWorkerUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkServiceWorkerUpdate();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    hardReloadForSwUpdate();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PwaInstallProvider>
      <EmergencyReloadBeacon />
      <App />
    </PwaInstallProvider>
  </StrictMode>,
);
