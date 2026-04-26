import { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X } from 'lucide-react';
import { cn } from '../lib/utils';

const PWA_BANNER_DISMISSED_KEY = 'pwa_banner_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return false;
}

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isStandaloneDisplay()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setDeferredPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!deferredPrompt) {
      setIsRendered(false);
      setIsVisible(false);
      return;
    }
    if (sessionStorage.getItem(PWA_BANNER_DISMISSED_KEY) === 'true') {
      setIsRendered(false);
      setIsVisible(false);
      return;
    }
    setIsRendered(true);
    const id = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(id);
  }, [deferredPrompt]);

  const dismissBanner = useCallback(() => {
    sessionStorage.setItem(PWA_BANNER_DISMISSED_KEY, 'true');
    setIsVisible(false);
  }, []);

  useEffect(() => {
    if (!isVisible || !isRendered || !deferredPrompt) {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
      return;
    }
    autoHideTimerRef.current = setTimeout(() => {
      dismissBanner();
      autoHideTimerRef.current = null;
    }, 8000);
    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
        autoHideTimerRef.current = null;
      }
    };
  }, [isVisible, isRendered, deferredPrompt, dismissBanner]);

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* ignorado */
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'opacity' || isVisible) return;
    setIsRendered(false);
  };

  if (!isRendered || !deferredPrompt) return null;

  return (
    <div
      className={cn(
        'fixed left-2 right-2 z-[55] mx-auto max-w-lg rounded-2xl border border-emerald-500/25',
        'relative bg-gradient-to-r from-emerald-950/95 via-emerald-900/85 to-zinc-950/95 px-3 pb-3 pt-7 shadow-xl shadow-emerald-950/50 backdrop-blur-xl',
        'sm:left-4 sm:right-4 lg:left-auto lg:right-6 lg:max-w-md',
        'top-[calc(5rem+env(safe-area-inset-top,0px))] lg:top-[calc(1rem+env(safe-area-inset-top,0px))]',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      )}
      role="region"
      aria-label="Instalar AxéCloud"
      onTransitionEnd={handleTransitionEnd}
    >
      <button
        type="button"
        onClick={dismissBanner}
        className="absolute right-1.5 top-1.5 z-[1] flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="Fechar aviso de instalação"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/95 shadow-md">
            <img
              src="/axecloud_192.png"
              alt=""
              className="h-full w-full object-cover"
              width={44}
              height={44}
            />
          </div>
          <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-white">
            Instale o AxéCloud no seu celular para uma experiência completa!
          </p>
        </div>
        <button
          type="button"
          onClick={onInstallClick}
          className={cn(
            'flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-black uppercase tracking-wide text-background sm:w-auto',
            'shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] active:scale-[0.98]'
          )}
        >
          <Download className="h-4 w-4" aria-hidden />
          Instalar Agora
        </button>
      </div>
    </div>
  );
}
