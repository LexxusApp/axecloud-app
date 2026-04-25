import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Mail, ArrowRight, Loader2, UserCircle2, KeyRound, AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function Login() {
  const [loginType, setLoginType] = useState<'zelador' | 'filho'>('zelador');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [childId, setChildId] = useState('');
  const [cpfPrefix, setCpfPrefix] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true = exibir o aviso amarelo (somente se a URL tiver vindo de atualização; não usar useState(true) fixo)
  const [showAlert, setShowAlert] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('updated') === 'true';
  });
  const alertHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('updated') !== 'true') return;

    window.history.replaceState({}, document.title, window.location.pathname);

    alertHideTimerRef.current = window.setTimeout(() => {
      setShowAlert(false);
      alertHideTimerRef.current = null;
    }, 4000);

    return () => {
      if (alertHideTimerRef.current) {
        clearTimeout(alertHideTimerRef.current);
        alertHideTimerRef.current = null;
      }
    };
  }, []);

  const closeUpdateAlert = () => {
    if (alertHideTimerRef.current) {
      clearTimeout(alertHideTimerRef.current);
      alertHideTimerRef.current = null;
    }
    setShowAlert(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (loginType === 'zelador') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        // Filho de Santo Login
        if (cpfPrefix.length < 4) {
          throw new Error("Digite pelo menos os 4 primeiros dígitos do CPF.");
        }

        const response = await fetch('/api/auth/filho-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ childId, cpfPrefix })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erro ao fazer login.");
        }

        // Login with generated credentials
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (signInError) throw signInError;
      }
      // Pós-login: rota inicial é controlada pelo App (aba dashboard / ajuste para filho em loadAllTenantData).
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Image Optimizado */}
      <img 
        src="https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80" 
        alt="Floresta Background" 
        loading="lazy" 
        crossOrigin="anonymous"
        className="fixed inset-0 w-full h-full object-cover pointer-events-none -z-20 opacity-70"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80 pointer-events-none -z-10" />
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 blur-[80px] rounded-full -z-10" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-10 w-full max-w-[380px] space-y-6"
      >
        {showAlert && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/15 px-4 py-3 text-primary shadow-[0_0_30px_rgba(251,188,0,0.12)]">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm font-black leading-snug flex-1 pr-1">
              Sistema Atualizado. Faça o Login Novamente.
            </p>
            <button
              type="button"
              onClick={closeUpdateAlert}
              aria-label="Fechar aviso de atualização"
              className="shrink-0 rounded-md p-1 text-primary/80 hover:bg-primary/20 hover:text-primary transition-colors -mr-1 -mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Logo & Title */}
        <div className="text-center space-y-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center"
          >
            <div className="flex flex-col items-center">
              <div className="flex items-baseline gap-3">
                <h1 className="text-6xl font-black tracking-tighter flex items-baseline">
                  <span className="text-white">AX</span>
                  <span className="text-primary ml-1">É</span>
                </h1>
              </div>
              <h2 className="text-3xl font-black text-white/60 tracking-[0.3em] -mt-2 ml-2">
                CLOUD
              </h2>
              <div className="flex items-center gap-4 mt-6 w-full max-w-[300px]">
                <div className="h-[1px] w-10 bg-white/20" />
                <p className="text-white/40 font-bold tracking-[0.5em] uppercase text-[9px] whitespace-nowrap">
                  GESTÃO SAGRADA
                </p>
                <div className="h-[1px] w-10 bg-white/20" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Login Card - Glassmorphism */}
        <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-6 md:p-8 shadow-2xl space-y-6 relative overflow-hidden">
          
          {/* Login Type Toggle */}
          <div className="flex p-1 bg-black/40 rounded-lg border border-white/5 backdrop-blur-sm">
            <button
              onClick={() => setLoginType('zelador')}
              aria-label="Acesso Zelador"
              className={cn(
                "flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-md transition-all flex items-center justify-center gap-2",
                loginType === 'zelador' 
                  ? "bg-primary text-black shadow-lg" 
                  : "text-gray-500 hover:text-white"
              )}
            >
              <UserCircle2 className="w-4 h-4" />
              Zelador
            </button>
            <button
              onClick={() => setLoginType('filho')}
              aria-label="Acesso Filho de Santo"
              className={cn(
                "flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-md transition-all flex items-center justify-center gap-2",
                loginType === 'filho' 
                  ? "bg-primary text-black shadow-lg" 
                  : "text-gray-500 hover:text-white"
              )}
            >
              <KeyRound className="w-4 h-4" />
              Filho de Santo
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-5">
            <AnimatePresence mode="wait">
              {loginType === 'zelador' ? (
                <motion.div 
                  key="zelador"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full bg-black border border-white/10 rounded-md py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Senha</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full bg-black border border-white/10 rounded-md py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="filho"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">ID (4 Dígitos)</label>
                    <div className="relative">
                      <UserCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="text"
                        required
                        maxLength={4}
                        value={childId}
                        onChange={(e) => setChildId(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                        placeholder="Ex: 2E6B"
                        className="w-full bg-black border border-white/10 rounded-md py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">4 Primeiros Dígitos do CPF</label>
                    <div className="relative">
                      <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                      <input 
                        type="text"
                        required
                        maxLength={4}
                        value={cpfPrefix}
                        onChange={(e) => setCpfPrefix(e.target.value.replace(/\D/g, ''))}
                        placeholder="Ex: 1234"
                        className="w-full bg-black border border-white/10 rounded-md py-3.5 pl-12 pr-4 text-white placeholder:text-gray-700 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <p className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-3 rounded-md border border-red-500/20">
                {error}
              </p>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-black font-black py-3.5 rounded-md flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(251,188,0,0.2)] group disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <div className="pt-5 border-t border-white/10">
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2">
                Deseja levar o AxéCloud para o seu terreiro?
              </p>
              <a 
                href="https://wa.me/5511912276156" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs font-black text-primary hover:text-primary/80 transition-colors"
              >
                Entre em contato com o nosso comercial
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-[10px] font-black uppercase tracking-[0.2em]">
          © 2026 AxéCloud - CNPJ: 66.335.964/0001-07
        </p>
      </motion.div>
    </div>
  );
}
