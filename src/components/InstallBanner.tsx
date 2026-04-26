import { useState, useEffect, useCallback } from 'react';
import { Download } from 'lucide-react';
import { cn } from '../lib/utils';

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

  const onInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      /* ignorado */
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  if (!deferredPrompt) return null;

  return (
    <div
      className={cn(
        'fixed left-2 right-2 z-[55] mx-auto max-w-lg rounded-2xl border border-emerald-500/25',
        'bg-gradient-to-r from-emerald-950/95 via-emerald-900/85 to-zinc-950/95 px-3 py-3 shadow-xl shadow-emerald-950/50 backdrop-blur-xl',
        'sm:left-4 sm:right-4 lg:left-auto lg:right-6 lg:max-w-md',
        'top-[calc(5rem+env(safe-area-inset-top,0px))] lg:top-[calc(1rem+env(safe-area-inset-top,0px))]',
        'animate-in fade-in slide-in-from-top-2 duration-300'
      )}
      role="region"
      aria-label="Instalar AxéCloud"
    >
      <div className="flex items-center gap-3">
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
        <button
          type="button"
          onClick={onInstallClick}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-black uppercase tracking-wide text-background',
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
