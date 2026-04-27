import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, LogOut, User } from 'lucide-react';
import { performFastLogout } from '../lib/logout';
import { cn } from '../lib/utils';

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  tenantData?: any;
  setActiveTab: (tab: string) => void;
}

export default function PageHeader({ title, subtitle, actions, tabs, tenantData, setActiveTab }: PageHeaderProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <div className="mb-0 w-full min-w-0 max-w-full overflow-x-hidden bg-transparent px-3 py-3 sm:px-4 md:mb-6 md:px-6 md:py-8 lg:px-10">
      <header className="mx-auto flex min-w-0 max-w-[1440px] flex-col justify-between gap-6 md:gap-8 lg:flex-row lg:items-center">
        <div className="min-w-0 max-w-full space-y-1 md:space-y-2">
          <h2 className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl md:text-4xl lg:text-4xl [&>*]:min-w-0">
            {title}
          </h2>
          {subtitle && (
            <p className="max-w-full text-sm font-medium text-gray-400 md:text-base break-words">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex w-full min-w-0 max-w-full flex-col items-stretch gap-4 pb-2 lg:w-auto lg:max-w-none lg:flex-row lg:items-center lg:pb-0 md:gap-6">
          {actions && (
            <div className="w-full min-w-0 max-w-full lg:w-auto lg:max-w-none">
              {actions}
            </div>
          )}

          {/* User Profile - Top Right - Hidden on mobile as it's redundant */}
          <div className="relative shrink-0 hidden lg:block">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-3 p-1 pr-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"
            >
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-primary flex items-center justify-center text-background font-black text-sm border border-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105 overflow-hidden">
                {tenantData?.foto_url ? (
                  <img 
                    src={tenantData.foto_url} 
                    alt={tenantData?.nome || 'Terreiro'} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const fallbackInitial = (tenantData?.nome?.[0] || 'T').toUpperCase();
                        parent.innerHTML = fallbackInitial;
                      }
                    }}
                  />
                ) : (
                  (tenantData?.nome?.[0] || 'T').toUpperCase()
                )}
              </div>
              <div className="hidden md:flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-tight">
                    {tenantData?.nome || 'Zelador'}
                  </span>
                  <span className="bg-[#FBBC00]/10 text-[#FBBC00] text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] tracking-wider">
                    {tenantData?.plan?.toUpperCase() || 'PREMIUM'}
                  </span>
                </div>
                {(tenantData?.role === 'filho' || tenantData?.cargo?.trim()) && (
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest max-w-[180px] truncate">
                    {tenantData?.role === 'filho' ? 'Filho de Santo' : tenantData?.cargo?.trim()}
                  </span>
                )}
              </div>
            </button>

            <AnimatePresence>
              {isProfileOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsProfileOpen(false)} 
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-56 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
                  >
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => {
                          setActiveTab('settings');
                          setIsProfileOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                      >
                        <Settings className="w-4 h-4" />
                        Configurações
                      </button>
                      <button
                        type="button"
                        onClick={() => performFastLogout()}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-bold text-red-500 hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="w-4 h-4" />
                        Sair do Sistema
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      {tabs && (
        <div className="mx-auto mt-2 w-full min-w-0 max-w-[1440px] md:mt-0">
          {tabs}
        </div>
      )}
    </div>
  );
}
