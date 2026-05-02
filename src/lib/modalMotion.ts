import type { Transition } from 'framer-motion';

/** Tween curto — evita spring (muitos recálculos por frame) em modais no mobile. */
export const MODAL_TW: Transition = {
  type: 'tween',
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1],
};

export const MODAL_PANEL_IN = { opacity: 0, y: 8 };
export const MODAL_PANEL_DONE = { opacity: 1, y: 0 };
export const MODAL_PANEL_OUT = { opacity: 0, y: 6 };

/** Painéis com leve escala (ex.: admin, meta financeira). */
export const MODAL_DLG_IN = { opacity: 0, scale: 0.98, y: 8 };
export const MODAL_DLG_DONE = { opacity: 1, scale: 1, y: 0 };
export const MODAL_DLG_OUT = { opacity: 0, scale: 0.98, y: 6 };
