/**
 * Chave pública VAPID (só a pública no cliente).
 * O par com a chave **privada** no servidor (api/index.ts, server.ts) tem que ser o mesmo.
 */
export const VAPID_PUBLIC_KEY =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  'BEKar2pRRjBhX5Pz-EtX1QT07JbDBhSBx_-t5mAPZ3TevskbdG0w9JJNz-TbR-TzuIigtXTg27vCX_8GElZUM7Y';
