import { MonitorSmartphone } from 'lucide-react';
import { usePwaInstall } from '../contexts/PwaInstallContext';
import { cn } from '../lib/utils';

type PwaInstallTopbarButtonProps = {
  className?: string;
};

export function PwaInstallTopbarButton({ className }: PwaInstallTopbarButtonProps) {
  const { canPromptInstall, promptInstall } = usePwaInstall();

  if (!canPromptInstall) return null;

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/45 bg-emerald-500/15 text-emerald-300 transition-colors hover:bg-emerald-500/25',
        className
      )}
      aria-label="Instalar aplicativo AxéCloud"
      title="Instalar aplicativo"
    >
      <MonitorSmartphone className="h-5 w-5" aria-hidden />
    </button>
  );
}
