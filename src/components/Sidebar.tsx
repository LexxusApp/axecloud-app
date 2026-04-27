import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar as CalendarIcon, 
  Package, 
  Wallet, 
  Bell,
  Settings as SettingsIcon, 
  LogOut,
  Smartphone,
  Download,
  Sun,
  ShieldCheck,
  User,
  X,
  BookOpen,
  ShoppingBag,
  Lock,
  Crown,
  Star,
  Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { performFastLogout } from '../lib/logout';
import { hasPlanAccess } from '../constants/plans';
import { usePwaInstall } from '../contexts/PwaInstallContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  isAdmin?: boolean;
  userRole?: 'admin' | 'filho';
  tenantData?: { 
    nome: string; 
    plan: string;
    foto_url?: string | null;
    cargo?: string | null;
    role?: string | null;
  } | null;
  pendingDonationsCount?: number;
  onSwitchToMaster?: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard },
  { id: 'children', label: 'Filhos de Santo', icon: Users },
  { id: 'calendar', label: 'Calendário / Eventos', icon: CalendarIcon },
  { id: 'mural', label: 'Mural', icon: Bell },
  { id: 'inventory', label: 'Almoxarifado', icon: Package },
  { id: 'financial', label: 'Financeiro', icon: Wallet },
];

export default function Sidebar({ activeTab, setActiveTab, isMobileOpen, setIsMobileOpen, isAdmin, userRole = 'admin', tenantData, onSwitchToMaster }: SidebarProps) {
  const [pendingDonations, setPendingDonations] = React.useState(0);
  const { canPromptInstall, promptInstall } = usePwaInstall();

  React.useEffect(() => {
    if (userRole !== 'admin') return;

    const fetchPending = async () => {
      const { count } = await supabase
        .from('caixinha_doacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente');
      
      setPendingDonations(count || 0);
    };

    fetchPending();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = window.setTimeout(() => {
      channel = supabase
        .channel('pending_donations')
        .on('postgres_changes', { event: '*', table: 'caixinha_doacoes', schema: 'public' }, () => {
          fetchPending();
        })
        .subscribe();
    }, 0);

    return () => {
      window.clearTimeout(subscribeTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userRole]);

  const handleLogout = () => {
    performFastLogout();
  };

  const currentNavItems = userRole === 'filho' 
    ? [
        { id: 'profile', label: 'Meu Perfil', icon: User },
        { id: 'financial', label: 'Mensalidade', icon: Wallet },
        { id: 'calendar', label: 'Calendário / Eventos', icon: CalendarIcon },
        { id: 'library', label: 'Biblioteca de Estudo', icon: BookOpen },
        { id: 'store', label: 'Loja do Axé', icon: ShoppingBag },
        { id: 'settings', label: 'Configurações', icon: SettingsIcon },
      ]
    : [
        ...navItems,
        { id: 'library', label: 'Biblioteca de Estudo', icon: BookOpen },
        { id: 'store', label: 'Loja do Axé', icon: ShoppingBag },
        { id: 'settings', label: 'Configurações', icon: SettingsIcon },
      ];
  
  const isSuperAdmin = isAdmin; // In the App.tsx, isAdminGlobal is passed as isAdmin

  const getPlanBadge = (plan: string) => {
    const p = plan.toLowerCase();
    const config = {
      premium: { label: 'PREMIUM', color: 'text-[#FBBC00]', bg: 'bg-[#FBBC00]/10' },
      oro: { label: 'ORO', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      axe: { label: 'AXÉ', color: 'text-blue-500', bg: 'bg-blue-500/10' },
      free: { label: 'AXÉ', color: 'text-blue-500', bg: 'bg-blue-500/10' },
      cortesia: { label: 'CORTESIA', color: 'text-purple-500', bg: 'bg-purple-500/10' },
      vita: { label: 'PLANO VITA', color: 'text-purple-400', bg: 'bg-purple-400/10' },
      'plano vita': { label: 'PLANO VITA', color: 'text-purple-400', bg: 'bg-purple-400/10' },
    };
    
    const item = config[p as keyof typeof config] || config.axe;

    return (
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full font-black text-[9px] tracking-[0.15em] transition-all",
        item.bg, item.color
      )}>
        <span className="w-1 h-1 rounded-full bg-current opacity-50" />
        {item.label}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Overlay — sem backdrop-blur (pesado em GPU no celular) */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-black/65 transition-opacity duration-200 ease-out lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar — só translateX animado; blur só no desktop */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 z-[70] flex w-72 flex-col border-r border-white/5 lg:w-56",
        "will-change-transform [transition:transform_250ms_cubic-bezier(0.4,0,0.2,1)] lg:will-change-auto",
        "max-lg:bg-[#0a0a0a]/[0.98] max-lg:backdrop-blur-none",
        "lg:bg-black/80 lg:backdrop-blur-md",
        isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="flex flex-col h-full p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Marca AXÉCLOUD sem imagem externa */}
          <div className="mb-6 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary">
                  <div className="w-3 h-3 bg-primary rounded-full" />
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-primary" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-primary" />
                  <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-0.5 bg-primary" />
                  <div className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-0.5 bg-primary" />
                </div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-black tracking-[0.1em] text-white leading-none">AXÉCLOUD</h1>
                <p className="text-[10px] font-bold tracking-[0.2em] text-primary mt-1">GESTÃO SAGRADA</p>
              </div>
            </div>
          </div>


          {/* Navigation */}
          <nav className="flex-1 space-y-1 overflow-y-auto no-scrollbar pb-4">
            {currentNavItems.map((item) => {
              const isActive = activeTab === item.id;
              const isLocked = !hasPlanAccess(tenantData?.plan, item.id, isAdmin);
              const Icon = item.icon;
              
              return (
                <div key={item.id} className="relative group">
                  <button
                    onClick={() => {
                      if (isLocked) {
                        alert(`Este recurso é exclusivo e não está disponível no plano ${tenantData?.plan?.toUpperCase() || 'AXÉ'}. Atualize seu plano para acessar.`);
                        return;
                      }
                      setActiveTab(item.id);
                      setIsMobileOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-4 px-6 py-3 lg:px-4 lg:py-2 rounded-lg font-bold transition-all duration-300 relative",
                      isActive 
                        ? "bg-primary/10 text-primary shadow-[0_0_20px_rgba(251,188,0,0.05)]" 
                        : "text-gray-400 hover:text-white hover:bg-white/5",
                      isLocked && "opacity-50"
                    )}
                  >
                    <Icon className={cn(
                      "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
                      isActive ? "text-primary" : "text-gray-500"
                    )} />
                    <span className="flex-1 text-left">{item.label}</span>
                    
                    {item.id === 'financial' && pendingDonations > 0 && (
                      <span className="absolute right-10 w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                    )}

                    {isLocked && <Lock className="w-4 h-4 text-[#FBBC00]" />}
                    
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute left-0 w-1 h-6 bg-primary rounded-r-full"
                      />
                    )}
                  </button>

                  {isLocked && (
                    <div className="absolute left-full ml-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-card border border-primary/20 rounded-lg text-[10px] font-black text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                      DISPONÍVEL NO PLANO {item.id === 'financial' || item.id === 'store' ? 'FUNDAMENTO' : 'ORÔ'}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer: Logout */}
          <div className="pt-4 mt-auto border-t border-white/10 shrink-0 space-y-2">
            {isSuperAdmin && (
              <button 
                onClick={onSwitchToMaster}
                className="w-full flex items-center gap-4 px-6 py-3 rounded-xl font-black text-[10px] text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all uppercase tracking-widest"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Master Portal
              </button>
            )}
            {canPromptInstall && (
              <button
                type="button"
                onClick={() => {
                  void promptInstall();
                  setIsMobileOpen(false);
                }}
                className="w-full flex items-center gap-4 px-6 py-3 rounded-xl font-bold text-emerald-100 bg-emerald-500/20 border-2 border-emerald-400/50 shadow-[0_0_18px_rgba(16,185,129,0.12)] hover:bg-emerald-500/30 transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <Smartphone className="w-5 h-5 shrink-0 text-emerald-300" />
                  <Download className="w-4 h-4 shrink-0 text-emerald-400/90" />
                </span>
                Instalar Aplicativo
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-4 px-6 py-3 rounded-xl font-bold text-red-500 hover:bg-red-500/10 transition-all group"
            >
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
              Sair do Sistema
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
