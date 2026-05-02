import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  AlertTriangle, 
  XCircle, 
  Plus, 
  Minus, 
  ShoppingCart, 
  Search, 
  X, 
  Copy, 
  CheckCircle2,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import LuxuryLoading from '../components/LuxuryLoading';
import PageHeader from '../components/PageHeader';
import BodyPortal from '../components/BodyPortal';

interface Product {
  id: string;
  item: string;
  categoria: 'Rituais' | 'Cozinha de Santo' | 'Vestuário' | 'Limpeza';
  quantidade_atual: number;
  quantidade_minima: number;
  status: string;
}

const categories = ['Todos', 'Rituais', 'Cozinha de Santo', 'Vestuário', 'Limpeza'] as const;

interface InventoryProps {
  tenantData?: any;
  userRole?: string;
  isAdminGlobal?: boolean;
  setActiveTab: (tab: string) => void;
}

export default function Inventory({ tenantData, userRole, isAdminGlobal, setActiveTab }: InventoryProps) {
  // Não-filhos são sempre gestores do terreiro (plano determina quais funções de gestão estão disponíveis).
  const isAdmin = userRole !== 'filho';
  const tenantId = tenantData?.tenant_id;
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    item: '',
    categoria: 'Limpeza' as any,
    quantidade_atual: 0,
    quantidade_minima: 5
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, [tenantId]);

  async function fetchInventory() {
    setLoading(true);
    try {
      const response = await fetch(`/api/inventory?tenantId=${tenantId || ''}`);
      if (!response.ok) throw new Error('Failed to fetch inventory');
      const { data } = await response.json();
      setProducts((data || []).map((p: any) => ({
        ...p,
        quantidade_atual: Number(p.quantidade_atual) || 0,
        quantidade_minima: Number(p.quantidade_minima) || 0
      })));
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Usuário não autenticado');

      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          item: formData.item,
          categoria: formData.categoria,
          quantidade_atual: Number(formData.quantidade_atual) || 0,
          quantidade_minima: Number(formData.quantidade_minima) || 5,
          autorId: session.user.id,
          tenantId: tenantId
        })
      });

      if (!response.ok) {
        const text = await response.text();
        let errDesc = 'Falha ao adicionar item';
        try {
          const errData = text ? JSON.parse(text) : {};
          errDesc = errData.error || errDesc;
        } catch (e) {
          console.error('[INVENTORY] Error parsing error response:', text);
        }
        throw new Error(errDesc);
      }
      
      setIsAddItemModalOpen(false);
      setFormData({
        item: '',
        categoria: 'Limpeza',
        quantidade_atual: 0,
        quantidade_minima: 5
      });
      fetchInventory();
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Erro ao adicionar item ao almoxarifado.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Deseja realmente excluir este item?')) return;
    
    try {
      const { error } = await supabase
        .from('almoxarifado')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchInventory();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Erro ao excluir item.');
    }
  }

  const adjustStock = async (id: string, delta: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    const newQty = Math.max(0, product.quantidade_atual + delta);
    
    try {
      const { error } = await supabase
        .from('almoxarifado')
        .update({ quantidade_atual: newQty })
        .eq('id', id);

      if (error) throw error;
      
      setProducts(prev => prev.map(p => 
        p.id === id ? { ...p, quantidade_atual: newQty } : p
      ));
    } catch (error) {
      console.error('Error updating stock:', error);
    }
  };

  const getStatus = (p: Product) => {
    if (p.quantidade_atual <= 0) return { label: 'Esgotado', color: 'text-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' };
    if (p.quantidade_atual <= p.quantidade_minima) return { label: 'Baixo Estoque', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' };
    return { label: 'Em Dia', color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
  };

  const filteredProducts = useMemo(() => products.filter(p => {
    const matchesCat = activeCategory === 'Todos' || p.categoria === activeCategory;
    const matchesSearch = p.item.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  }), [products, activeCategory, searchTerm]);

  const lowStockItems = useMemo(() => products.filter(p => p.quantidade_atual <= p.quantidade_minima), [products]);
  const outOfStockItems = useMemo(() => products.filter(p => p.quantidade_atual <= 0), [products]);

  const generateShoppingListText = () => {
    const list = lowStockItems.map(p => `• ${p.item}: Repor ${p.quantidade_minima * 2} un.`).join('\n');
    return `*LISTA DE COMPRAS - AXÉCLOUD*\n\nOlá, gostaria de solicitar os seguintes itens para reposição:\n\n${list}\n\nAguardo retorno com orçamento.`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateShoppingListText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading && products.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <LuxuryLoading />
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <PageHeader 
        title={<>Almoxarifado <span className="text-primary">Místico</span></>}
        subtitle="Gestão de estoque e insumos de axé."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
        actions={
          <div
            className={cn(
              'grid w-full min-w-0 max-w-full gap-2 sm:gap-3',
              isAdmin ? 'grid-cols-2' : 'grid-cols-1'
            )}
          >
            {isAdmin && (
              <button 
                onClick={() => setIsAddItemModalOpen(true)}
                className="flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-xs font-bold text-white transition-all hover:bg-white/10 active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
              >
                <Plus className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                <span className="truncate">Novo Item</span>
              </button>
            )}
            <button 
              onClick={() => setIsShoppingListOpen(true)}
              className={cn(
                'flex min-w-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-2 py-2.5 text-xs font-black text-black shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 active:scale-[0.98] sm:gap-2 sm:px-4 sm:py-3 sm:text-sm',
                !isAdmin && 'col-span-full'
              )}
            >
              <ShoppingCart className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
              <span className="min-w-0 truncate sm:hidden">Lista</span>
              <span className="hidden min-w-0 truncate sm:inline">Lista de Compras</span>
              {lowStockItems.length > 0 && (
                <span className="shrink-0 rounded-lg bg-black/20 px-1.5 py-0.5 text-[10px] font-black text-black sm:px-2 sm:text-[11px]">
                  {lowStockItems.length}
                </span>
              )}
            </button>
          </div>
        }
      />

      <div className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 space-y-10 px-4 pb-20 animate-in fade-in duration-700 md:px-6 lg:px-10">
        
        {/* Superior Dashboard Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Main Info Box */}
          <div className="card-luxury p-8 md:col-span-6 lg:col-span-5 relative overflow-hidden group flex flex-col justify-between min-h-[220px]">
             <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] -mr-20 -mt-20 group-hover:bg-primary/20 transition-all duration-700" />
             <div className="relative z-10 flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1">Total em Estoque</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black text-white tracking-tighter">{products.length}</span>
                    <span className="text-xl text-primary font-bold">itens</span>
                  </div>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shadow-lg backdrop-blur-md">
                   <Package className="w-7 h-7 text-primary" />
                </div>
             </div>
             
             <div className="relative z-10 flex items-center gap-4 mt-8">
               <div className="flex-1 bg-white/5 h-2 rounded-full overflow-hidden">
                 <div className="h-full bg-primary w-full" />
               </div>
               <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Geral</span>
             </div>
          </div>

          {/* Alerts Box */}
          <div className="md:col-span-6 lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="card-luxury p-6 relative overflow-hidden group border-primary/20 hover:border-primary/40 bg-primary/5 min-h-[220px] flex flex-col justify-between">
               <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[50px] -mr-10 -mt-10" />
               <div className="relative z-10 flex items-center gap-4 mb-4">
                 <div className="p-3.5 bg-primary/20 rounded-xl">
                   <AlertTriangle className="w-6 h-6 text-primary" />
                 </div>
                 <span className="text-sm font-black text-primary uppercase tracking-widest">Atenção</span>
               </div>
               <div className="relative z-10">
                 <div className="text-4xl font-black text-white tracking-tighter mb-1">{lowStockItems.length}</div>
                 <p className="text-sm font-bold text-gray-400 leading-snug">Itens se aproximando do limite mínimo de estoque.</p>
               </div>
            </div>

            <div className="card-luxury p-6 relative overflow-hidden group border-red-500/20 hover:border-red-500/40 bg-red-500/5 min-h-[220px] flex flex-col justify-between">
               <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 rounded-full blur-[50px] -mr-10 -mt-10" />
               <div className="relative z-10 flex items-center gap-4 mb-4">
                 <div className="p-3.5 bg-red-500/20 rounded-xl">
                   <XCircle className="w-6 h-6 text-red-500" />
                 </div>
                 <span className="text-sm font-black text-red-500 uppercase tracking-widest">Crítico</span>
               </div>
               <div className="relative z-10">
                 <div className="text-4xl font-black text-white tracking-tighter mb-1">{outOfStockItems.length}</div>
                 <p className="text-sm font-bold text-gray-400 leading-snug">Itens que acabaram e precisam de reposição urgente.</p>
               </div>
            </div>
          </div>

        </div>

        {/* Filters & Search - Glass style */}
        <div className="flex min-w-0 max-w-full flex-col gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-h-[44px] min-w-0 w-full max-w-full flex-nowrap gap-1 overflow-x-auto overscroll-x-contain p-1 touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:max-w-[55%] xl:max-w-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all whitespace-nowrap sm:px-5 sm:py-2.5 sm:text-sm',
                  activeCategory === cat 
                    ? "bg-primary text-black shadow-lg shadow-primary/20 scale-100" 
                    : "text-gray-400 hover:text-white hover:bg-white/5 scale-95 hover:scale-100"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          
          <div className="relative w-full min-w-0 max-w-full p-1 lg:max-w-md xl:w-96 xl:max-w-none">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              placeholder="Buscar insumos, ferramentas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-all font-medium placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* Product Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.length > 0 ? filteredProducts.map((product, idx) => {
          const status = getStatus(product);
          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="card-luxury p-1 relative overflow-hidden group flex flex-col hover:border-primary/30 transition-colors"
            >
              {/* Product Background Decoration */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full pointer-events-none opacity-50" />
              
              <div className="p-5 flex-1 flex flex-col gap-5 relative z-10">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 mt-1">
                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest leading-none">{product.categoria}</span>
                    <h4 className="text-xl font-black text-white group-hover:text-primary transition-colors leading-tight line-clamp-2">
                      {product.item}
                    </h4>
                  </div>
                  <div className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shrink-0", status.color, status.bg, status.border)}>
                    {status.label}
                  </div>
                </div>

                <div className="flex-1" />

                {/* Stock Controls - Minimalist Look */}
                <div className="flex items-center justify-between border-t border-white/5 pt-5 mt-2">
                  <div className="flex flex-col gap-1">
                     <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">MIN: {product.quantidade_minima}</span>
                     <div className="flex items-baseline gap-1.5">
                       <span className="text-3xl font-black text-white leading-none tracking-tighter">{product.quantidade_atual}</span>
                       <span className="text-[10px] font-bold text-gray-500 uppercase">UN</span>
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={() => adjustStock(product.id, -1)}
                      className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-gray-400 hover:bg-black hover:border-white/10 transition-all shadow-sm active:scale-95"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => adjustStock(product.id, 1)}
                      className="w-10 h-10 rounded-xl bg-primary text-black flex items-center justify-center hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:-translate-y-0.5 active:scale-95"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => deleteItem(product.id)}
                        className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95 ml-2"
                        title="Excluir item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        }) : (
          <div className="col-span-full py-20 text-center space-y-6 glass-panel rounded-3xl border border-dashed border-white/10">
            <div className="w-20 h-20 bg-primary/5 border border-primary/20 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-primary/5">
              <Package className="w-10 h-10 text-primary" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-white">Nenhum item encontrado</h3>
              <p className="text-gray-500 max-w-xs mx-auto font-medium">Seu almoxarifado ainda não possui itens cadastrados para esta categoria.</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo Item */}
      <AnimatePresence>
        {isAddItemModalOpen && (
          <BodyPortal>
          <div className="fixed inset-0 z-[100] flex min-h-0 items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddItemModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1F1F1F] shadow-2xl sm:max-w-lg"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white sm:text-xl">Novo Item</h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mt-0.5">Almoxarifado</p>
                </div>
                <button onClick={() => setIsAddItemModalOpen(false)} className="shrink-0 rounded-full p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Nome do Item</label>
                  <input required type="text" value={formData.item}
                    onChange={e => setFormData({ ...formData, item: e.target.value })}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white outline-none transition-all focus:border-primary"
                    placeholder="Ex: Vela de 7 Dias Branca" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Categoria</label>
                    <select value={formData.categoria}
                      onChange={e => setFormData({ ...formData, categoria: e.target.value as any })}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white outline-none transition-all focus:border-primary [&>option]:bg-[#1B1C1C]">
                      <option value="Limpeza">Limpeza</option>
                      <option value="Rituais">Rituais</option>
                      <option value="Cozinha de Santo">Cozinha</option>
                      <option value="Vestuário">Vestuário</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Qtd. Atual</label>
                    <input required type="number" value={formData.quantidade_atual}
                      onChange={e => setFormData({ ...formData, quantidade_atual: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white outline-none transition-all focus:border-primary" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Qtd. Mínima (Alerta)</label>
                  <input required type="number" value={formData.quantidade_minima}
                    onChange={e => setFormData({ ...formData, quantidade_minima: parseInt(e.target.value) || 0 })}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white outline-none transition-all focus:border-primary" />
                </div>

                <button disabled={isSubmitting} type="submit"
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-background shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50">
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Cadastrar Item'}
                </button>
              </form>
            </motion.div>
          </div>
          </BodyPortal>
        )}
      </AnimatePresence>

      {/* Shopping List Modal */}
      <AnimatePresence>
        {isShoppingListOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsShoppingListOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[88dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#1F1F1F] shadow-2xl sm:max-w-lg"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-white sm:text-xl">Lista de Compras</h3>
                    <p className="text-xs text-gray-500 font-medium">Itens para reposição imediata.</p>
                  </div>
                </div>
                <button onClick={() => setIsShoppingListOpen(false)} className="shrink-0 rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="rounded-2xl border border-white/5 bg-background/50 p-4 font-mono text-sm leading-relaxed text-gray-300 whitespace-pre-wrap sm:p-6">
                  {generateShoppingListText()}
                </div>
              </div>

              <div className="flex shrink-0 gap-3 border-t border-white/5 bg-background/30 px-5 py-4 sm:px-6">
                <button onClick={copyToClipboard}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/5 bg-white/5 py-3 font-black text-white transition-all hover:bg-white/10">
                  {copied ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Copy className="h-5 w-5" />}
                  <span className="text-sm">{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(generateShoppingListText())}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary py-3 font-black text-background shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]">
                  <MessageSquare className="h-5 w-5" />
                  <span className="text-sm">WhatsApp</span>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
