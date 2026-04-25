import React from 'react';
import { Lock, Crown, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface PaywallProps {
  featureName: string;
  requiredPlan: string;
  onUpgrade: () => void;
}

export default function Paywall({ featureName, requiredPlan, onUpgrade }: PaywallProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full bg-card/50 backdrop-blur-xl border border-[#FBBC00]/20 rounded-3xl p-10 shadow-2xl shadow-[#FBBC00]/5"
      >
        <div className="w-20 h-20 bg-[#FBBC00]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#FBBC00]/20">
          <Lock className="w-10 h-10 text-[#FBBC00]" />
        </div>
        
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">
          🔒 Módulo Exclusivo
        </h2>
        
        <p className="text-gray-400 mb-8 leading-relaxed">
          O módulo de <span className="text-white font-bold">{featureName}</span> não está disponível no seu plano atual. 
          Melhore sua gestão agora com o <span className="text-[#FBBC00] font-bold">{requiredPlan}</span>.
        </p>

        <div className="space-y-4">
          <button
            onClick={onUpgrade}
            className="w-full flex items-center justify-center gap-3 bg-[#FBBC00] hover:bg-[#FBBC00]/90 text-background font-black py-4 rounded-2xl transition-all shadow-lg shadow-[#FBBC00]/20 group"
          >
            <Crown className="w-5 h-5" />
            VER PLANOS E PREÇOS
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>
          
          <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
            AxéCloud • Gestão com Fundamento
          </p>
        </div>
      </motion.div>
    </div>
  );
}
