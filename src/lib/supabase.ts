/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

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
  if (args[0] && args[0].isAcquireTimeout) {
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

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: 'axecloud-auth-token'
    }
  }
);
