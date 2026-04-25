import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, CheckCircle2, CreditCard, RefreshCw, Zap, Info, Trash2, Megaphone } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { PLAN_NAMES, canonicalPlanSlug } from '../constants/plans';

export interface AppNotification {
  id: string;
  type: 'payment' | 'plan' | 'system' | 'info' | 'mural';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  tenantData?: any;
  systemVersion: string;
  userRole?: string | null;
  userId?: string | null;
}

const TYPE_META: Record<AppNotification['type'], { icon: React.ReactNode; color: string; bg: string }> = {
  payment: {
    icon: <CreditCard className="w-4 h-4" />,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
  },
  plan: {
    icon: <RefreshCw className="w-4 h-4" />,
    color: 'text-[#FBBC00]',
    bg: 'bg-[#FBBC00]/10 border-[#FBBC00]/20',
  },
  system: {
    icon: <Zap className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
  },
  info: {
    icon: <Info className="w-4 h-4" />,
    color: 'text-gray-400',
    bg: 'bg-white/5 border-white/10',
  },
  mural: {
    icon: <Megaphone className="w-4 h-4" />,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
  },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Agora mesmo';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const STORAGE_KEY = 'axecloud_notifications';
const MURAL_READ_KEY = 'axecloud_mural_read';

function loadNotifications(): AppNotification[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function saveNotifications(notifs: AppNotification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs));
}
function loadMuralRead(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(MURAL_READ_KEY) || '[]')); } catch { return new Set(); }
}
function saveMuralRead(ids: Set<string>) {
  localStorage.setItem(MURAL_READ_KEY, JSON.stringify([...ids]));
}

export default function NotificationPanel({ tenantData, systemVersion, userRole, userId }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  // Avisos do mural (apenas para filhos de santo)
  const [muralNotifs, setMuralNotifs] = useState<AppNotification[]>([]);
  const [muralRead, setMuralRead] = useState<Set<string>>(loadMuralRead);
  const panelRef = useRef<HTMLDivElement>(null);
  const isFilho = userRole === 'filho';

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Notificações do sistema / plano / pagamento (zelador) ──
  useEffect(() => {
    if (isFilho) return; // filho usa canal próprio (mural)

    let saved = loadNotifications();
    saved = saved.filter(n => !(n.type === 'system' && n.id?.startsWith('sys_') && n.id !== `sys_${systemVersion}`));
    if (tenantData?.plan) {
      const canonical = canonicalPlanSlug(tenantData.plan);
      const planKey = `plan_${canonical}_active`;
      saved = saved.filter(n => !(n.type === 'plan' && n.id?.startsWith('plan_') && n.id?.endsWith('_active') && n.id !== planKey));
    }

    const toAdd: AppNotification[] = [];

    const sysKey = `sys_${systemVersion}`;
    if (!saved.find(n => n.id === sysKey)) {
      toAdd.push({ id: sysKey, type: 'system', title: `Sistema atualizado para v${systemVersion}`, body: 'Novidades e correções foram aplicadas. Aproveite as melhorias.', read: false, created_at: new Date().toISOString() });
    }

    if (tenantData?.plan) {
      const canonical = canonicalPlanSlug(tenantData.plan);
      const planKey = `plan_${canonical}_active`;
      const planDisplayName = PLAN_NAMES[canonical] || canonical.toUpperCase();
      if (!saved.find(n => n.id === planKey)) {
        toAdd.push({ id: planKey, type: 'plan', title: 'Plano ativo', body: `Seu plano ${planDisplayName} está ativo. Aproveite todos os recursos disponíveis.`, read: true, created_at: new Date().toISOString() });
      }
    }

    if (tenantData?.tenant_id) {
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const payKey = `payment_${tenantData.tenant_id}_${thisMonth}`;
      supabase.from('financeiro').select('id, descricao, valor, created_at').eq('tenant_id', tenantData.tenant_id).eq('tipo', 'entrada').gte('created_at', `${thisMonth}-01`).limit(1).maybeSingle().then(({ data }) => {
        if (data) {
          setNotifs(prev => {
            if (prev.find(n => n.id === payKey)) return prev;
            const updated = [{ id: payKey, type: 'payment' as const, title: 'Entrada registrada', body: `${data.descricao || 'Entrada'} — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.valor)} registrada neste mês.`, read: false, created_at: data.created_at }, ...prev];
            saveNotifications(updated);
            return updated;
          });
        }
      });
    }

    const merged = toAdd.length ? [...toAdd, ...saved] : saved;
    saveNotifications(merged);
    setNotifs(merged);
  }, [tenantData, systemVersion, isFilho]);

  // ── Avisos do mural para filho de santo ──
  useEffect(() => {
    if (!isFilho || !tenantData?.tenant_id) return;

    let cancelled = false;

    // Carrega avisos existentes
    supabase
      .from('mural_avisos')
      .select('id, titulo, conteudo, data_publicacao')
      .eq('tenant_id', tenantData.tenant_id)
      .order('data_publicacao', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const readIds = loadMuralRead();
        const items: AppNotification[] = data.map(n => ({
          id: `mural_${n.id}`,
          type: 'mural' as const,
          title: n.titulo,
          body: (n.conteudo || '').substring(0, 120),
          read: readIds.has(`mural_${n.id}`),
          created_at: n.data_publicacao,
        }));
        setMuralNotifs(items);
      });

    // Realtime após tick: evita fechar WebSocket ainda em CONNECTING (React StrictMode / troca rápida de tela)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = window.setTimeout(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`mural_filho_${tenantData.tenant_id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'mural_avisos',
          filter: `tenant_id=eq.${tenantData.tenant_id}`,
        }, (payload: any) => {
          const n = payload.new;
          const newNotif: AppNotification = {
            id: `mural_${n.id}`,
            type: 'mural',
            title: n.titulo,
            body: (n.conteudo || '').substring(0, 120),
            read: false,
            created_at: n.data_publicacao || new Date().toISOString(),
          };
          setMuralNotifs(prev => [newNotif, ...prev]);
        })
        .subscribe();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [isFilho, tenantData?.tenant_id]);

  // Notificações combinadas para exibição
  const allNotifs = isFilho ? muralNotifs : notifs;
  const unread = allNotifs.filter(n => !n.read).length;

  function markAllRead() {
    if (isFilho) {
      const newRead = new Set([...muralRead, ...muralNotifs.map(n => n.id)]);
      saveMuralRead(newRead);
      setMuralRead(newRead);
      setMuralNotifs(prev => prev.map(n => ({ ...n, read: true })));
    } else {
      const updated = notifs.map(n => ({ ...n, read: true }));
      saveNotifications(updated);
      setNotifs(updated);
    }
  }

  function markRead(id: string) {
    if (isFilho) {
      const newRead = new Set([...muralRead, id]);
      saveMuralRead(newRead);
      setMuralRead(newRead);
      setMuralNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } else {
      const updated = notifs.map(n => n.id === id ? { ...n, read: true } : n);
      saveNotifications(updated);
      setNotifs(updated);
    }
  }

  function dismiss(id: string) {
    if (isFilho) {
      setMuralNotifs(prev => prev.filter(n => n.id !== id));
    } else {
      const updated = notifs.filter(n => n.id !== id);
      saveNotifications(updated);
      setNotifs(updated);
    }
  }

  function clearAll() {
    if (isFilho) {
      setMuralNotifs([]);
    } else {
      setNotifs([]);
      saveNotifications([]);
    }
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Botão sino */}
      <button
        aria-label="Notificações"
        onClick={() => { setOpen(o => !o); }}
        className="relative p-2 text-gray-400 hover:text-white transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-black text-white border border-black">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute right-0 top-full mt-2 w-[min(360px,90vw)] rounded-2xl border border-white/10 bg-[#161616] shadow-2xl z-[200] overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#FBBC00]" />
                <span className="text-sm font-black text-white">
                  {isFilho ? 'Avisos do Terreiro' : 'Notificações'}
                </span>
                {unread > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[9px] font-black text-white">{unread}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button onClick={markAllRead} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-white transition-colors uppercase tracking-widest">
                    <CheckCircle2 className="w-3 h-3" /> Marcar lidas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 text-gray-500 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Lista */}
            <div className="max-h-[400px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {allNotifs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Bell className="w-8 h-8 text-gray-700" />
                  <p className="text-sm font-bold text-gray-600">
                    {isFilho ? 'Nenhum aviso do terreiro.' : 'Nenhuma notificação'}
                  </p>
                  <p className="text-xs text-gray-700">
                    {isFilho ? 'Quando o zelador postar, você verá aqui.' : 'Tudo em ordem no terreiro.'}
                  </p>
                </div>
              ) : (
                allNotifs.map(n => {
                  const meta = TYPE_META[n.type];
                  return (
                    <div
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-white/5 transition-colors cursor-pointer hover:bg-white/[0.03]",
                        !n.read && "bg-white/[0.03]"
                      )}
                    >
                      <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border", meta.bg, meta.color)}>
                        {meta.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn("text-xs font-black leading-tight", n.read ? "text-gray-400" : "text-white")}>
                            {n.title}
                          </p>
                          {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FBBC00]" />}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-gray-500 line-clamp-2">{n.body}</p>
                        <p className="mt-1 text-[10px] text-gray-700">{timeAgo(n.created_at)}</p>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                        className="mt-0.5 shrink-0 text-gray-700 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {allNotifs.length > 0 && (
              <div className="border-t border-white/5 px-4 py-2 text-center">
                <button onClick={clearAll} className="text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-red-400 transition-colors">
                  Limpar todas
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
