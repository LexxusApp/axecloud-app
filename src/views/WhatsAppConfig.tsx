import React, { useState, useEffect } from 'react';
import { MessageSquare, Link, Shield, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

export default function WhatsAppConfig() {
  const [status, setStatus] = useState<'DISCONNECTED' | 'LOADING' | 'QRCODE' | 'CONNECTED'>('DISCONNECTED');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Polling para checar status
  useEffect(() => {
    let intervalId: any;

    const checkStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const res = await fetch('/api/whatsapp/status', {
          headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        
        setStatus(data.status);
        setQrCode(data.qrcode);
      } catch (err) {
        console.error('Erro ao checar status do WhatsApp:', err);
      }
    };

    checkStatus();
    intervalId = setInterval(checkStatus, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/whatsapp/start', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      setStatus('LOADING');
    } catch (err) {
      console.error('Erro ao iniciar WhatsApp:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm('Deseja realmente desconectar o WhatsApp? Isso limpará sua sessão atual.')) return;
    
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch('/api/whatsapp/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      setStatus('DISCONNECTED');
      setQrCode(null);
    } catch (err) {
      console.error('Erro ao deslogar WhatsApp:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTestMessage = async () => {
    if (!testPhone) return;
    
    setSendingTest(true);
    setTestStatus('idle');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('/api/whatsapp/test-message', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ phone: testPhone })
      });

      if (!response.ok) throw new Error('Falha no envio');
      
      setTestStatus('success');
      setTestPhone('');
    } catch (err) {
      console.error('Erro ao enviar mensagem de teste:', err);
      setTestStatus('error');
    } finally {
      setSendingTest(false);
      setTimeout(() => setTestStatus('idle'), 5000);
    }
  };

  return (
    <div className="card-luxury p-10 space-y-8">
      <div className="flex items-center gap-6 pb-6 border-b border-white/5">
        <div className="p-5 rounded-3xl bg-emerald-500/10 text-emerald-500 shadow-2xl shadow-emerald-500/10 border border-emerald-500/20">
          <MessageSquare className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-white">Conexão WhatsApp</h2>
          <p className="text-gray-500 font-medium">Integre seu Terreiro com notificações automáticas via WhatsApp usando Baileys (Leve).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-left">
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Status da Instância
            </h3>
            <div className={`p-6 rounded-3xl border transition-all ${
              status === 'CONNECTED' 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 font-black' 
                : status === 'LOADING' || status === 'QRCODE'
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-white/5 border-white/5 text-gray-400'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {status === 'LOADING' ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : status === 'CONNECTED' ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : status === 'QRCODE' ? (
                    <Loader2 className="w-6 h-6 animate-pulse" />
                  ) : (
                    <AlertCircle className="w-6 h-6" />
                  )}
                  <span className="font-black uppercase tracking-widest text-sm">
                    {status === 'CONNECTED' ? 'Conectado' : 
                     status === 'LOADING' ? 'Inicializando...' : 
                     status === 'QRCODE' ? 'Aguardando QR Code' : 'Desconectado'}
                  </span>
                </div>
                {status === 'DISCONNECTED' && (
                  <button 
                    onClick={handleStart}
                    disabled={loading}
                    className="px-6 py-2 bg-emerald-500 text-background rounded-xl font-black text-xs hover:scale-105 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'CONECTAR AGORA'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-white/5 border border-white/5 space-y-4">
            <h4 className="text-sm font-black text-white uppercase tracking-widest">Recursos Ativos</h4>
            <ul className="space-y-3">
              {[
                'Avisos de Mural Automáticos',
                'Lembretes de Mensalidade',
                'Confirmação de Eventos',
                'Transmissão de Recados'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-400 font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-8 rounded-[2.5rem] bg-background border border-white/5 flex flex-col items-center justify-center text-center space-y-6 min-h-[300px]">
            <AnimatePresence mode="wait">
              {status === 'DISCONNECTED' ? (
                <motion.div 
                  key="disconnected"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="w-48 h-48 bg-white/5 rounded-3xl p-4 flex items-center justify-center border border-white/5 border-dashed">
                    <Link className="w-12 h-12 text-white/10" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-white font-bold">Inicie a Conexão</p>
                    <p className="text-xs text-gray-500 max-w-[200px] mx-auto">
                      Clique no botão "CONECTAR AGORA" para gerar o QR Code de autenticação.
                    </p>
                  </div>
                </motion.div>
              ) : status === 'QRCODE' && qrCode ? (
                <motion.div 
                  key="qrcode"
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                  className="space-y-6"
                >
                  <div className="w-48 h-48 bg-white rounded-3xl p-4 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full" referrerPolicy="no-referrer" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-white font-bold">Escaneie o QR Code</p>
                    <p className="text-xs text-gray-500 max-w-[200px] mx-auto">
                      Abra o WhatsApp no seu celular, vá em Aparelhos Conectados e escaneie o código acima.
                    </p>
                  </div>
                </motion.div>
              ) : status === 'LOADING' ? (
                <motion.div 
                   key="loading"
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                   className="flex flex-col items-center justify-center space-y-4"
                >
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-primary font-black uppercase tracking-widest text-xs animate-pulse">Sincronizando com WhatsApp...</p>
                </motion.div>
              ) : (
                <motion.div 
                  key="connected"
                  initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center space-y-6"
                >
                  <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                    <CheckCircle2 className="w-12 h-12 text-background" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-emerald-500 font-black uppercase tracking-widest">Conexão Estabelecida</p>
                    <p className="text-xs text-gray-500">Seu Terreiro já está conectado e pronto para enviar mensagens.</p>
                  </div>
                  
                  {/* Test Message Section */}
                  <div className="w-full max-w-sm mt-6 p-4 rounded-3xl bg-white/5 border border-white/10 space-y-4">
                    <p className="text-xs font-bold text-white text-left uppercase tracking-widest">Teste de Conexão</p>
                    <div className="flex flex-col gap-3">
                      <input 
                        type="text" 
                        value={testPhone}
                        onChange={(e) => setTestPhone(e.target.value)}
                        placeholder="Ex: 11999999999"
                        className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none transition-all placeholder:text-gray-600"
                      />
                      <button 
                        onClick={handleTestMessage}
                        disabled={sendingTest || !testPhone}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-background px-4 py-3 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-400 transition-colors"
                      >
                        {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        {sendingTest ? 'Enviando...' : 'Enviar Mensagem de Teste'}
                      </button>
                    </div>
                    {testStatus === 'success' && (
                      <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Mensagem Enviada!
                      </div>
                    )}
                    {testStatus === 'error' && (
                      <div className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center justify-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Erro ao enviar
                      </div>
                    )}
                  </div>

                  <button 
                    onClick={handleLogout}
                    disabled={loading}
                    className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline disabled:opacity-50 mt-4"
                  >
                    {loading ? 'DESCONECTANDO...' : 'Desconectar Instância'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-amber-500 font-black uppercase tracking-widest text-[10px]">Aviso Importante</h4>
          <p className="text-xs text-amber-500/80 font-medium text-left">
            Certifique-se de manter o celular conectado à internet ocasionalmente para manter a sessão ativa. O Baileys é uma biblioteca leve e segura para automação de mensagens.
          </p>
        </div>
      </div>
    </div>
  );
}
