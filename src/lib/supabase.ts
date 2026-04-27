/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Supabase React StrictMode Lock Warning/Error Mitigation ---
// React StrictMode double-mounts components in development, causing Supabase GoTrue to
// attempt concurrent lock acquisitions. This inherently triggers benign timeout and steal logs.
// See: https://github.com/supabase/supabase-js/issues/873
const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg &&
    (msg.includes('Lock') || msg.includes('lock')) &&
    (msg.includes('stole it') || msg.includes('acquisition timed out') || msg.includes('was not released within'))
  ) {
    return;
  }
  // Recharts antes do ResizeObserver (stack aponta para este arquivo por causa do patch)
  if (msg && msg.includes('width(-1) and height(-1) of chart')) {
    return;
  }
  // Falha benigna ao fechar Realtime antes do handshake (StrictMode / troca de rota)
  if (
    msg &&
    msg.includes('WebSocket connection to') &&
    msg.includes('supabase.co') &&
    (msg.includes('failed') || msg.includes('closed before the connection is established'))
  ) {
    return;
  }
  originalWarn(...args);
};

console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (
    msg &&
    (msg.includes('Lock') || msg.includes('lock')) &&
    (msg.includes('stole it') || msg.includes('acquisition timed out') || msg.includes('steal'))
  ) {
    return;
  }
  if (
    msg &&
    msg.includes('WebSocket connection to') &&
    msg.includes('supabase.co') &&
    (msg.includes('failed') || msg.includes('closed before the connection is established'))
  ) {
    return;
  }
  // Allow GoTrue's unhandled rejection to be swallowed if it's the specific lock error
  if (args[0] && (args[0] as { isAcquireTimeout?: boolean }).isAcquireTimeout) {
    return;
  }
  originalError(...args);
};
// ----------------------------------------------------------------

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please check your .env file.');
}

const nativeFetch = globalThis.fetch.bind(globalThis);

/** Rotas onde 401 indica sessão inválida e vale tentar refresh (não inclui /token para evitar recursão no fetch). */
function isSupabaseRecoverable401(urlStr: string): boolean {
  if (!supabaseUrl || !urlStr.includes(new URL(supabaseUrl).hostname)) return false;
  if (urlStr.includes('/auth/v1/token')) return false;
  return (
    urlStr.includes('/rest/v1/') ||
    urlStr.includes('/storage/v1/') ||
    urlStr.includes('/auth/v1/user')
  );
}

/**
 * Fetch resiliente: em 401 tenta refresh da sessão uma vez e refaz o request.
 * Se ainda falhar ou não houver sessão, força logout rápido (evita loading infinito no PWA).
 */
function createResilientFetch(getClient: () => SupabaseClient): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let response: Response;
    try {
      response = await nativeFetch(input, init);
    } catch (err) {
      // Falha de rede / abort — repassa; App pode mostrar estado offline
      throw err;
    }

    if (response.status !== 401) return response;

    const urlStr = typeof input === 'string' ? input : (input as Request).url;
    if (!isSupabaseRecoverable401(urlStr)) return response;

    const supabase = getClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      void import('./logout').then((m) => m.performFastLogout());
      return response;
    }

    const { error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) {
      void import('./logout').then((m) => m.performFastLogout());
      return response;
    }

    try {
      response = await nativeFetch(input, init);
    } catch (err) {
      throw err;
    }

    if (response.status === 401) {
      void import('./logout').then((m) => m.performFastLogout());
    }

    return response;
  };
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'axecloud-auth-token',
    },
    global: {
      fetch: createResilientFetch(() => supabase),
    },
  },
);
