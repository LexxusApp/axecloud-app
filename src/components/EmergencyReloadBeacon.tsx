import { performEmergencyHardReload } from '../lib/emergencyReload';

/**
 * Área quase invisível no canto inferior direito — toque para limpar SW/cache e recarregar (PWA preso após deploy).
 */
export function EmergencyReloadBeacon() {
  return (
    <button
      type="button"
      aria-label="Recarregar aplicativo"
      title="Recarga de emergência (limpa cache do app)"
      className="pointer-events-auto fixed bottom-0 right-0 z-[99999] h-14 w-14 opacity-[0.06] hover:opacity-25 active:bg-white/10"
      onClick={() => performEmergencyHardReload()}
    />
  );
}
