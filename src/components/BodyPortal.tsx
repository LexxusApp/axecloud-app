import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Renderiza filhos em document.body para modais fixed ancorarem na viewport (evita blur/scroll no main). */
export default function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
