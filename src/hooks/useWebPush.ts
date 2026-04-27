import { useState, useEffect, useCallback, useRef } from 'react';
import { VAPID_PUBLIC_KEY } from '../config/vapidPublic';

export function useWebPush(
  userId: string | null,
  tenantId: string | null,
  /** Só filhos de santo devem registrar push; gestores não solicitam permissão. */
  enabled: boolean = true
) {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // Evita loop infinito quando o push service falha (AbortError)
  const hasFailed = useRef(false);
  const hasAttempted = useRef(false);
  const prevUserId = useRef<string | null>(null);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = useCallback(async () => {
    if (!enabled) return;
    if (!userId || !tenantId) return;
    if (hasFailed.current) return; // Não tenta novamente após falha
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[PUSH] Push notifications não suportadas neste navegador.');
      hasFailed.current = true;
      return;
    }

    setLoading(true);
    try {
      // 1. Solicitar permissão
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        hasFailed.current = true;
        return;
      }

      // 2. Registrar Service Worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 3. Verificar se já existe inscrição
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      }

      // 4. Enviar para o Backend
      const response = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, userId, tenantId })
      });

      if (!response.ok) throw new Error('Falha ao salvar inscrição no servidor');

      setIsSubscribed(true);
      hasFailed.current = false;
    } catch (error: any) {
      hasFailed.current = true; // Marca como falhou para não tentar novamente

      // AbortError = push service indisponível (rede, FCM, chave VAPID). Falha silenciosa.
      if (error?.name === 'AbortError' || error?.message?.includes('push service')) {
        return;
      }
    } finally {
      setLoading(false);
    }
  }, [userId, tenantId, enabled]);

  useEffect(() => {
    // Reseta tentativas quando o usuário muda (ex.: logout/login com outra conta)
    if (userId !== prevUserId.current) {
      hasFailed.current = false;
      hasAttempted.current = false;
      setIsSubscribed(false);
      prevUserId.current = userId;
    }
  }, [userId]);

  // Alinhar com o navegador quando o papel vira "filho" (antes enabled era false) ou após voltar à aba
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const sync = () => setPermission(Notification.permission);
    sync();
    const onVis = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled, userId]);

  useEffect(() => {
    // Auto-subscribe apenas 1 vez se já tiver permissão — sem loops (somente quando push está habilitado p/ o papel atual)
    if (
      enabled &&
      permission === 'granted' &&
      userId &&
      tenantId &&
      !isSubscribed &&
      !hasFailed.current &&
      !hasAttempted.current
    ) {
      hasAttempted.current = true;
      subscribe();
    }
  }, [enabled, permission, userId, tenantId, isSubscribed, subscribe]);

  return {
    /** Estado real do navegador — não forçar 'denied' após falha de rede/push (senão some o banner sem o usuário ter respondido). */
    permission,
    isSubscribed,
    loading,
    subscribe
  };
}
