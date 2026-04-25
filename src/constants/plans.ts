export type PlanType = 'axe' | 'oro' | 'premium' | 'cortesia' | 'vita';

const PREMIUM_LIKE_FEATURES = [
  'dashboard', 'children', 'calendar', 'gestao_eventos', 'mural', 'inventory', 'library', 'notes',
  'financial', 'financial_reports', 'financial_whatsapp', 'whatsapp_invites', 'store', 'settings',
  'admin', 'caixinha', 'saude_axe',
] as const;

/** Normaliza slug gravado no banco (ex.: "Plano Vita", "plano_vita", "Orô") para chave usada em PLAN_FEATURES / PLAN_LIMITS. */
export function canonicalPlanSlug(plan: string | undefined): string {
  if (!plan) return 'axe';
  // Normaliza acentos/diacríticos: "Orô" → "oro", "Axé" → "axe", etc.
  const stripped = plan.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const p = stripped.toLowerCase().trim().replace(/\s+/g, ' ');
  const compact = p.replace(/[\s_-]/g, '');

  if (p === 'vita' || p === 'plano vita' || compact === 'planovita') return 'vita';
  if (p === 'premium' || compact === 'premium') return 'premium';
  if (p === 'oro' || p === 'oro' || compact === 'oro' || compact === 'planoor') return 'oro';
  if (p === 'cortesia' || compact === 'cortesia') return 'cortesia';
  if (p === 'axe' || p === 'free' || compact === 'axe' || compact === 'free') return p === 'free' ? 'free' : 'axe';
  return p;
}

/** Cortesia e Plano Vita: acesso completo e sem exigência de renovação por data. */
export function isLifetimePlan(plan: string | undefined): boolean {
  const c = canonicalPlanSlug(plan);
  return c === 'cortesia' || c === 'vita';
}

/** Premium + planos vitalícios com todas as funções. */
export function hasPremiumTierFeatures(plan: string | undefined): boolean {
  const c = canonicalPlanSlug(plan);
  return c === 'premium' || c === 'cortesia' || c === 'vita';
}

/** Assinatura com data distante (evita bloqueio por expiração). */
export function usesDistantSubscriptionExpiry(plan: string | undefined): boolean {
  if (!plan) return false;
  const raw = plan.toLowerCase().trim();
  if (raw === 'premium') return true;
  return isLifetimePlan(plan);
}

export const PLAN_LIMITS: Record<string, number> = {
  free: 20,
  axe: 20,
  oro: 50,
  premium: 999999,
  cortesia: 999999,
  vita: 999999,
};

export const PLAN_FEATURES: Record<string, string[]> = {
  free: ['dashboard', 'children', 'calendar', 'financial', 'settings'],
  axe: ['dashboard', 'children', 'calendar', 'financial', 'settings'],
  oro: ['dashboard', 'children', 'calendar', 'mural', 'inventory', 'financial', 'settings'],
  premium: [...PREMIUM_LIKE_FEATURES],
  cortesia: [...PREMIUM_LIKE_FEATURES],
  vita: [...PREMIUM_LIKE_FEATURES],
};

export const PLAN_NAMES: Record<string, string> = {
  free: 'Axé',
  axe: 'Axé',
  oro: 'Orô',
  premium: 'Premium',
  cortesia: 'Cortesia',
  vita: 'Plano Vita',
};

// import.meta.env só existe no contexto Vite (browser). No Node.js (servidor), é undefined.
// Usamos optional chaining para não quebrar o servidor ao importar este arquivo.
const _env = (import.meta as any).env ?? {};
export const CHECKOUT_URLS: Record<string, string> = {
  axe: _env.VITE_KIWIFY_AXE_URL || '',
  oro: _env.VITE_KIWIFY_ORO_URL || '',
  premium: _env.VITE_KIWIFY_PREMIUM_URL || '',
};

export type Feature = 'dashboard' | 'children' | 'calendar' | 'gestao_eventos' | 'whatsapp_invites' | 'mural' | 'inventory' | 'library' | 'notes' | 'financial' | 'store' | 'settings' | 'admin' | 'subscription' | 'caixinha' | 'saude_axe';

export const hasPlanAccess = (plan: string | undefined, feature: string, isAdminGlobal: boolean = false): boolean => {
  if (isAdminGlobal) return true;
  if (!plan) return PLAN_FEATURES.axe.includes(feature);

  const key = canonicalPlanSlug(plan);
  const features = PLAN_FEATURES[key] || PLAN_FEATURES.axe;

  return features.includes(feature);
};
