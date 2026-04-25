import React from 'react';
import { 
  Calendar, 
  ShoppingBag, 
  BookOpen, 
  DollarSign, 
  LogOut,
  User as UserIcon,
  CreditCard,
  X,
  Home
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';

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
  // Prioridade: foto do banco (filhos_de_santo) → metadata do auth → avatar gerado
  const fotoUrl = filhoFotoUrl || user?.user_metadata?.foto_url;

  const SidebarContent = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="space-y-10">
        {/* Profile Area */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative mb-5">
            <div className="w-20 h-20 rounded-full border-4 border-yellow-500/20 p-1 bg-black/40 shadow-2xl shadow-yellow-500/10 overflow-hidden ring-4 ring-black/40">
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

        {/* Navigation Menu */}
        <div className="space-y-1.5">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group relative overflow-hidden",
                activeTab === item.id
                  ? "text-yellow-500 font-black bg-yellow-500/10 shadow-[0_0_20px_rgba(234,179,8,0.05)]"
                  : "text-gray-500 hover:text-white hover:bg-white/5"
              )}
            >
              {activeTab === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-yellow-500 rounded-r-full shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
              )}
              <item.icon className={cn(
                "w-5 h-5 transition-transform duration-300 group-hover:scale-110",
                activeTab === item.id ? "text-yellow-500" : "text-gray-500"
              )} />
              <span className="text-[11px] uppercase font-black tracking-[0.15em]">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="pt-6 border-t border-white/5">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-4 px-6 py-4 text-gray-500 hover:text-red-500 transition-all group rounded-2xl hover:bg-red-500/5"
        >
          <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="text-[11px] uppercase font-black tracking-[0.2em]">Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — visível apenas em lg+ */}
      <div className="w-64 bg-black/40 backdrop-blur-3xl border-r border-white/5 h-screen p-8 hidden lg:flex flex-col fixed left-0 top-0 z-[100]">
        <SidebarContent />
      </div>

      {/* Mobile drawer — visível apenas abaixo de lg */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Overlay */}
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setIsMobileOpen?.(false)}
            />

            {/* Drawer */}
            <motion.div
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 z-[120] w-72 bg-black/90 backdrop-blur-3xl border-r border-white/10 p-8 flex flex-col lg:hidden"
            >
              {/* Botão fechar */}
              <button
                onClick={() => setIsMobileOpen?.(false)}
                className="absolute top-5 right-5 p-2 text-gray-500 hover:text-white transition-colors rounded-xl hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
