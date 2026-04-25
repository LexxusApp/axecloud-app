import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Plus, X, CheckCircle2, Loader2, MessageCircle, Download, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface Transaction {
  id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  descricao: string;
  data: string;
}

interface FinanceiroBasicoProps {
  tenantId?: string;
  userId?: string;
}

export default function FinanceiroBasico({ tenantId, userId }: FinanceiroBasicoProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    tipo: 'entrada' as 'entrada' | 'saida',
    valor: '',
    descricao: '',
    data: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchTransactions();
  }, [tenantId]);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('financeiro')
        .select('id, tipo, valor, descricao, data')
        .eq('tenant_id', tenantId)
        .order('data', { ascending: false })
        .limit(20);

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('financeiro')
        .insert([{
          ...formData,
          valor: parseFloat(formData.valor) || 0,
          tenant_id: tenantId,
          lider_id: userId
        }]);

      if (error) throw error;
      
      setIsModalOpen(false);
      setFormData({
        tipo: 'entrada',
        valor: '',
        descricao: '',
        data: new Date().toISOString().split('T')[0]
      });
      fetchTransactions();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Erro ao realizar lançamento.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const stats = transactions.reduce((acc, curr) => {
    if (curr.tipo === 'entrada') acc.entradas += curr.valor;
    else acc.saidas += curr.valor;
    return acc;
  }, { entradas: 0, saidas: 0 });

  const saldo = stats.entradas - stats.saidas;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header com Saldo em Destaque */}
      <div className="text-center space-y-4">
        <p className="text-xs font-black text-gray-500 uppercase tracking-[0.3em]">Saldo Atual</p>
        <h3 className="text-5xl md:text-6xl font-black text-[#FBBC00] tracking-tighter">
          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldo)}
        </h3>
        
        <div className="flex flex-col items-center gap-4 pt-4">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-primary text-background px-8 py-4 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
          >
            <Plus className="w-5 h-5" />
            Novo Lançamento
          </button>

          {/* Botão de Relatório Bloqueado */}
          <div className="relative group">
            <button 
              disabled
              className="opacity-40 bg-white/5 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 border border-white/10 cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              Gerar Relatório Mensal em PDF
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-4 py-2 bg-black border border-white/10 rounded-xl text-[10px] font-bold text-primary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
              Relatórios em PDF são exclusivos para assinantes do Plano Superior
            </div>
          </div>
        </div>
      </div>

      {/* Lista Minimalista de Transações */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest ml-2">Últimos Registros</h4>
        <div className="space-y-2">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors group">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center",
                  t.tipo === 'entrada' ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
                )}>
                  {t.tipo === 'entrada' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{t.descricao}</p>
                  <p className="text-[10px] text-gray-500 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <span className={cn(
                  "text-sm font-black",
                  t.tipo === 'entrada' ? "text-emerald-500" : "text-red-500"
                )}>
                  {t.tipo === 'entrada' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                </span>
                
                {/* Botão WhatsApp com Bloqueio */}
                <button 
                  onClick={() => setIsUpgradeModalOpen(true)}
                  className="p-2 text-gray-600 hover:text-[#25D366] transition-colors"
                  title="Enviar Comprovante"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          
          {transactions.length === 0 && !loading && (
            <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-[2.5rem]">
              <p className="text-gray-500 font-medium">Nenhum lançamento registrado.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Lançamento */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-card shadow-2xl sm:max-w-md sm:rounded-3xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <h3 className="text-base font-black text-white sm:text-xl">Novo Registro</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-500 transition-colors hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'entrada' })}
                    className={cn(
                      "py-3 rounded-xl font-bold border transition-all",
                      formData.tipo === 'entrada' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-white/5 border-white/5 text-gray-500"
                    )}
                  >
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'saida' })}
                    className={cn(
                      "py-3 rounded-xl font-bold border transition-all",
                      formData.tipo === 'saida' ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-white/5 border-white/5 text-gray-500"
                    )}
                  >
                    Saída
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Valor (R$)</label>
                    <input required type="number" step="0.01" value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
                      placeholder="0,00" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Descrição</label>
                    <input required type="text" value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-primary"
                      placeholder="Ex: Compra de Velas" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Data</label>
                    <input required type="date" value={formData.data}
                      onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-black px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3 font-black text-background disabled:opacity-50">
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                  Salvar Registro
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Upgrade */}
      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsUpgradeModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 w-full space-y-5 rounded-t-3xl border border-primary/20 bg-[#1B1C1C] px-6 py-8 text-center sm:max-w-md sm:rounded-3xl sm:px-10"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white">Recurso Exclusivo</h3>
                <p className="text-gray-400 font-medium">
                  A automação de mensagens e envio de comprovantes via WhatsApp é exclusiva para assinantes do <span className="text-primary font-bold">Plano Premium</span> ou <span className="text-primary font-bold">Plano Vita</span>.
                </p>
              </div>
              <div className="pt-4 space-y-3">
                <button 
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    // Aqui você pode disparar uma navegação para a aba de assinaturas
                    window.dispatchEvent(new CustomEvent('navigate-to-subscription'));
                  }}
                  className="w-full bg-primary text-background font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                >
                  Fazer Upgrade Agora
                </button>
                <button 
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="w-full text-gray-500 font-bold py-2 hover:text-white transition-colors"
                >
                  Talvez mais tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
