import React from 'react';
import { 
  Calendar, 
  ShoppingBag, 
  BookOpen, 
  LogOut,
  Smartphone,
  Download,
  User as UserIcon,
  CreditCard,
  X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { usePwaInstall } from '../contexts/PwaInstallContext';

const MOBILE_DRAWER_TRANSITION =
  'will-change-transform [transition:transform_250ms_cubic-bezier(0.4,0,0.2,1)] lg:will-change-auto';

interface FilhoSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tenantData?: any;
  user?: any;
  filhoFotoUrl?: string | null;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
}

export default function FilhoSidebar({
  activeTab,
  setActiveTab,
  tenantData,
  user,
  filhoFotoUrl,
  isMobileOpen = false,
  setIsMobileOpen,
}: FilhoSidebarProps) {
  const { canPromptInstall, promptInstall } = usePwaInstall();

  const menuItems = [
    { id: 'profile', label: 'Meu Perfil', icon: UserIcon },
    { id: 'financial', label: 'Mensalidade', icon: CreditCard },
    { id: 'calendar', label: 'Giras', icon: Calendar },
    { id: 'library', label: 'Biblioteca', icon: BookOpen },
    { id: 'store', label: 'Loja Axé', icon: ShoppingBag },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleNav = (id: string) => {
    setActiveTab(id);
    setIsMobileOpen?.(false);
  };

  const displayName = user?.user_metadata?.nome || 'Filho de Santo';
  const fotoUrl = filhoFotoUrl || user?.user_metadata?.foto_url;

  const SidebarContent = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="space-y-10">
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-5">
            <div className="w-20 h-20 rounded-full border-4 border-yellow-500/20 p-1 bg-black/40 shadow-lg shadow-yellow-500/5 overflow-hidden ring-2 ring-black/40">
              <img
                src={fotoUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName)}`}
                alt="Profile"
                className="w-full h-full object-cover rounded-full"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-yellow-500 rounded-full border-4 border-[#0a0a0a] flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-black rounded-full" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black text-yellow-500 uppercase tracking-[0.3em] opacity-80">
              {tenantData?.nome || 'TERREIRO'}
            </p>
            <h2 className="text-sm font-black text-white uppercase tracking-tight truncate w-full px-2">
              {displayName}
            </h2>
          </div>
        </div>

        <div className="space-y-1.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors duration-200 group relative overflow-hidden",
                activeTab === item.id
                  ? "text-yellow-500 font-black bg-yellow-500/10"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              )}
            >
              {activeTab === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-yellow-500 rounded-r-full" />
              )}
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-200 group-hover:scale-110",
                activeTab === item.id ? "text-yellow-500" : "text-gray-500"
              )} />
              <span className="text-[11px] uppercase font-black tracking-[0.15em]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-white/5 space-y-2">
        {canPromptInstall && (
          <button
            type="button"
            onClick={() => {
              void promptInstall();
              setIsMobileOpen?.(false);
            }}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-emerald-100 bg-emerald-500/20 border-2 border-emerald-400/50 hover:bg-emerald-500/30 transition-colors duration-200"
          >
            <span className="flex items-center gap-1.5">
              <Smartphone className="w-5 h-5 shrink-0 text-emerald-300" />
              <Download className="w-4 h-4 shrink-0 text-emerald-400/90" />
            </span>
            <span className="text-[11px] uppercase font-black tracking-[0.15em]">Instalar Aplicativo</span>
          </button>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-6 py-4 text-gray-500 hover:text-red-500 transition-colors duration-200 group rounded-2xl hover:bg-red-500/5"
        >
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform duration-200" />
          <span className="text-[11px] uppercase font-black tracking-[0.2em]">Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden lg:flex w-64 h-screen flex-col fixed left-0 top-0 z-[100] border-r border-white/5 bg-black/40 backdrop-blur-md p-8">
        <SidebarContent />
      </div>

      {isMobileOpen && (
        <div
          className="fixed inset-0 z-[110] bg-black/65 transition-opacity duration-200 ease-out lg:hidden"
          onClick={() => setIsMobileOpen?.(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 bottom-0 z-[120] flex w-72 flex-col border-r border-white/10 bg-[#0a0a0a]/[0.98] p-8 lg:hidden',
          MOBILE_DRAWER_TRANSITION,
          isMobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        )}
        aria-hidden={!isMobileOpen}
      >
        <button
          type="button"
          onClick={() => setIsMobileOpen?.(false)}
          className="absolute top-5 right-5 z-10 p-2 text-gray-500 hover:text-white transition-colors duration-200 rounded-xl hover:bg-white/5"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent />
      </aside>
    </>
  );
}
