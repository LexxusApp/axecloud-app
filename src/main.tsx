import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (import.meta.env.DEV) {
      console.info('[PWA] Service Worker ativo:', swUrl, registration?.scope);
    }
  },
  onRegisterError(error) {
    console.error('[PWA] Falha ao registrar o Service Worker:', error);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
