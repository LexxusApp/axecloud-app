import React from 'react';
import { Lock, CreditCard, ShieldAlert, Sparkles, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { CHECKOUT_URLS } from '../constants/plans';

interface SubscriptionLockProps {
  plan?: string;
}

export default function SubscriptionLock({ plan }: SubscriptionLockProps) {
  const handleCheckout = () => {
    if (plan && CHECKOUT_URLS[plan.toLowerCase()]) {
       // Abre o link de pagamento do plano específico dele usando window.open em nova aba igual Kiwify pop up original
       const url = CHECKOUT_URLS[plan.toLowerCase()];
       const width = 500;
       const height = 750;
       const left = (window.screen.width / 2) - (width / 2);
       const top = (window.screen.height / 2) - (height / 2);
       window.open(
        url, 
        'KiwifyCheckout', 
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
      );
    } else {
       // Fallback de segurança se não tiver o plano
       window.open('https://kiwify.com.br/', '_blank');
    }
  };

  const handleSupport = () => {
    window.open('https://wa.me/558481232810?text=Ol%C3%A1,%20minha%20assinatura%20est%C3%A1%20suspensa%20e%20preciso%20de%20ajuda%20para%20renovar%20meu%20plano%20no%20Ax%C3%A9Cloud', '_blank');
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 overflow-hidden">
      {/* Background Image - Árvore */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
        style={{ 
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/login-bg.png')`,
          backgroundAttachment: 'fixed'
        }}
      />
      {/* Animated Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-md w-full bg-card border border-primary/20 p-12 rounded-[2rem] text-center relative shadow-[0_0_50px_rgba(212,175,55,0.1)]"
      >
        {/* Luxury Icon Container */}
        <div className="w-24 h-24 bg-gradient-to-br from-primary to-primary/40 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-[0_10px_30px_rgba(212,175,55,0.3)] relative group">
          <Lock className="w-10 h-10 text-black" />
          <div className="absolute -top-2 -right-2 w-8 h-8 bg-black border border-primary/30 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-primary" />
          </div>
        </div>

        <h2 className="text-3xl font-black tracking-tight text-white mb-4 leading-tight">
          Seu acesso ao <span className="text-primary">AxéCloud</span> está suspenso
        </h2>
        
        <p className="text-gray-400 text-sm mb-10 leading-relaxed font-medium">
          Identificamos que sua assinatura expirou. Para continuar desfrutando da gestão mística de alto padrão, regularize seu plano agora.
        </p>

        <div className="space-y-4">
          <button 
            onClick={handleCheckout}
            className="w-full bg-primary hover:bg-primary/90 text-black font-black py-4 rounded-2xl transition-all duration-500 flex items-center justify-center gap-3 group shadow-[0_10px_20px_rgba(212,175,55,0.2)] hover:shadow-[0_15px_30px_rgba(212,175,55,0.4)] hover:-translate-y-1"
          >
            <CreditCard className="w-5 h-5" />
            REGULARIZAR ASSINATURA ({plan ? plan.toUpperCase() : 'AGORA'})
          </button>
          
          <button 
            onClick={handleSupport}
            className="w-full bg-transparent hover:bg-white/5 text-gray-500 hover:text-white font-bold py-4 rounded-2xl transition-all duration-300 text-xs tracking-widest uppercase flex flex-col items-center gap-1"
          >
            <span className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Falar com Suporte VIP
            </span>
          </button>
        </div>

        {/* Luxury Badge */}
        <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-primary/40" />
          <span className="text-[10px] font-black text-gray-600 tracking-[0.3em] uppercase">
            SaaS Multitenant • Enterprise Edition
          </span>
        </div>
      </motion.div>
    </div>
  );
}
