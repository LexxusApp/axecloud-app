import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { resolveStoreTenantPk } from '../lib/resolveStoreTenantPk';
import { ShoppingBag, Plus, Minus, Trash2, X, AlertCircle, CheckCircle2, Image as ImageIcon, ClipboardList } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import * as Toast from '@radix-ui/react-toast';
import PageHeader from '../components/PageHeader';

interface Product {
  id: string;
  nome: string;
  descricao: string;
  preco: number;
  estoque_atual: number;
  estoque_minimo: number;
  categoria: string;
  imagem_url: string;
}

interface CartItem extends Product {
  quantidade: number;
}

interface LojaPedidoRow {
  id: string;
  created_at: string;
  filho_nome: string | null;
  tipo: string;
  metodo_pagamento: string;
  resumo_itens: string;
  valor_total: number;
}

interface StoreProps {
  userRole: string;
  tenantData: any;
  userId: string;
  isAdminGlobal?: boolean;
  setActiveTab: (tab: string) => void;
}

export default function Store({ userRole, tenantData, userId, isAdminGlobal, setActiveTab }: StoreProps) {
  // Não-filhos são sempre gestores do terreiro (plano determina quais funções de gestão estão disponíveis).
  const isAdmin = userRole !== 'filho';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    nome: '', descricao: '', preco: 0, estoque_atual: 0, estoque_minimo: 0, categoria: 'Velas'
  });
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState({ title: '', description: '', type: 'success' });
  const [filhoId, setFilhoId] = useState<string | null>(null);
  const [filhoNome, setFilhoNome] = useState('');
  /** Compra (mensalidade/PIX) vs reserva — só para filho de santo no fluxo do carrinho. */
  const [intencaoLojaFilho, setIntencaoLojaFilho] = useState<'compra' | 'reserva'>('compra');
  const [lojaPedidos, setLojaPedidos] = useState<LojaPedidoRow[]>([]);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
    if (userRole === 'filho') {
      fetchFilhoId();
    }

    if (isAdmin) {
      let channel: ReturnType<typeof supabase.channel> | null = null;
      const subscribeTimer = window.setTimeout(() => {
        channel = supabase.channel('custom-all-channel')
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'produtos', filter: `tenant_id=eq.${tenantData.tenant_id}` },
            (payload) => {
              const newStock = payload.new.estoque_atual;
              const minStock = payload.new.estoque_minimo;
              const oldStock = payload.old.estoque_atual;

              if (newStock <= minStock && oldStock > minStock) {
                showToast(
                  'Estoque Baixo!',
                  `O produto "${payload.new.nome}" atingiu o estoque mínimo (${newStock} unidades).`,
                  'warning'
                );
              }
            }
          )
          .subscribe();
      }, 0);

      return () => {
        window.clearTimeout(subscribeTimer);
        if (channel) supabase.removeChannel(channel);
      };
    }
  }, [userRole, userId, tenantData.tenant_id]);

  const fetchLojaPedidos = async (tenantPk?: string | null) => {
    if (!isAdmin) return;
    setLoadingPedidos(true);
    try {
      const pk =
        tenantPk != null && String(tenantPk).trim() !== '' ? String(tenantPk).trim() : await resolveStoreTenantPk(storeTenantParams());
      if (!pk) {
        setLojaPedidos([]);
        return;
      }
      const { data, error } = await supabase
        .from('loja_pedidos')
        .select('id, created_at, filho_nome, tipo, metodo_pagamento, resumo_itens, valor_total')
        .eq('tenant_id', pk)
        .order('created_at', { ascending: false })
        .limit(40);
      if (error) throw error;
      setLojaPedidos((data || []) as LojaPedidoRow[]);
    } catch {
      setLojaPedidos([]);
    } finally {
      setLoadingPedidos(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    let pedidosChannel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const pk = await resolveStoreTenantPk(storeTenantParams());
      if (cancelled || !pk) return;
      await fetchLojaPedidos(pk);
      if (cancelled) return;
      pedidosChannel = supabase
        .channel(`loja-pedidos-${pk}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'loja_pedidos', filter: `tenant_id=eq.${pk}` },
          () => {
            fetchLojaPedidos(pk);
          }
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (pedidosChannel) supabase.removeChannel(pedidosChannel);
    };
  }, [isAdmin, tenantData?.tenant_id, userId]);

  const fetchFilhoId = async () => {
    const { data } = await supabase
      .from('filhos_de_santo')
      .select('id, nome')
      .eq('user_id', userId)
      .maybeSingle();
    if (data) {
      setFilhoId(data.id);
      setFilhoNome(typeof data.nome === 'string' ? data.nome : '');
    }
  };

  const storeTenantParams = () => ({
    tenantIdFromContext: tenantData?.tenant_id,
    fallbackUserId: userId,
  });

  const rowToProduct = (row: Record<string, unknown>): Product => ({
    id: String(row.id),
    nome: String(row.nome ?? ''),
    descricao: String(row.descricao ?? ''),
    preco: Number(row.preco) || 0,
    estoque_atual: Number(row.estoque_atual) || 0,
    estoque_minimo: Number(row.estoque_minimo) || 0,
    categoria: String(row.categoria ?? ''),
    imagem_url: row.imagem_url != null ? String(row.imagem_url) : '',
  });

  const fetchProducts = async (opts?: { silent?: boolean; tenantPk?: string | null }) => {
    if (!opts?.silent) setLoading(true);
    const tenantPk = opts?.tenantPk != null && String(opts.tenantPk).trim() !== '' ? String(opts.tenantPk).trim() : await resolveStoreTenantPk(storeTenantParams());
    if (!tenantPk) {
      setProducts([]);
      if (!opts?.silent) setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .eq('tenant_id', tenantPk)
      .is('deleted_at', null)
      .order('nome');
    if (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    } else {
      setProducts((data || []).map((r) => rowToProduct(r as Record<string, unknown>)));
    }
    if (!opts?.silent) setLoading(false);
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantidade >= product.estoque_atual) {
          showToast('Estoque insuficiente', 'Não há mais unidades disponíveis.', 'error');
          return prev;
        }
        return prev.map(item => 
          item.id === product.id ? { ...item, quantidade: item.quantidade + 1 } : item
        );
      }
      return [...prev, { ...product, quantidade: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQuantity = item.quantidade + delta;
        if (newQuantity > item.estoque_atual) {
          showToast('Estoque insuficiente', 'Não há mais unidades disponíveis.', 'error');
          return item;
        }
        return newQuantity > 0 ? { ...item, quantidade: newQuantity } : item;
      }
      return item;
    }).filter(item => item.quantidade > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.preco * item.quantidade), 0);
  }, [cart]);

  const cartQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantidade, 0);
  }, [cart]);

  const showToast = (title: string, description: string, type: 'success' | 'error' | 'warning') => {
    setToastMessage({ title, description, type });
    setToastOpen(true);
  };

  const handleCheckout = async (method: 'mensalidade' | 'pix' | 'reserva') => {
    if (cart.length === 0) return;
    if (userRole === 'filho' && !filhoId) {
      showToast('Erro', 'Perfil de filho não encontrado.', 'error');
      return;
    }

    const tenantPk = await resolveStoreTenantPk(storeTenantParams());
    if (!tenantPk) {
      showToast('Erro', 'Informações do terreiro não carregadas. Tente recarregar a página.', 'error');
      return;
    }

    setIsCheckoutLoading(true);
    try {
      const { data, error } = await supabase.rpc('processar_checkout', {
        p_tenant_id: tenantPk,
        p_filho_id: userRole === 'filho' ? filhoId : null,
        p_metodo_pagamento: method === 'reserva' ? 'mensalidade' : method,
        p_itens: cart.map((item) => ({ produto_id: item.id, quantidade: item.quantidade })),
      });

      if (error) throw error;

      if (userRole === 'filho' && filhoId) {
        const tipoPedido = method === 'reserva' ? 'reserva' : 'compra';
        const metodoGravar = method === 'reserva' ? 'reserva' : method;
        const resumo = cart.map((i) => `${i.quantidade}× ${i.nome}`).join(', ');
        const { error: pedidoErr } = await supabase.from('loja_pedidos').insert({
          tenant_id: tenantPk,
          filho_id: filhoId,
          filho_nome: filhoNome.trim() || 'Filho de santo',
          tipo: tipoPedido,
          metodo_pagamento: metodoGravar,
          resumo_itens: resumo,
          valor_total: cartTotal,
        });
        if (pedidoErr) console.error('[loja_pedidos] insert', pedidoErr);
      }

      showToast('Sucesso!', 'Pedido realizado com sucesso.', 'success');
      setCart([]);
      setIntencaoLojaFilho('compra');
      setIsCartOpen(false);
      await fetchProducts({ silent: true, tenantPk });
      if (isAdmin) await fetchLojaPedidos(tenantPk);
    } catch (error: any) {
      console.error('Checkout error:', error);
      showToast('Erro no Checkout', error.message || 'Ocorreu um erro ao processar o pedido.', 'error');
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProduct(true);

    const nomeDoEstado = (newProduct.nome || '').trim();
    const descricaoDoEstado = String(newProduct.descricao ?? '').trim();
    const precoDoEstado = Number(newProduct.preco) || 0;
    const categoriaDoEstado = newProduct.categoria || 'Velas';
    const estoqueAtual = Number(newProduct.estoque_atual) || 0;
    const estoqueMinimo = Number(newProduct.estoque_minimo) || 0;

    if (!nomeDoEstado) {
      showToast('Erro', 'Nome do produto é obrigatório.', 'error');
      setIsSavingProduct(false);
      return;
    }

    const idDoTerreiroLogado = await resolveStoreTenantPk(storeTenantParams());

    if (idDoTerreiroLogado == null || idDoTerreiroLogado === undefined || String(idDoTerreiroLogado).trim() === '') {
      console.error('[Store / Novo Produto] tenant_id ausente ou undefined', { tenantData, userId });
      showToast('Erro', 'Não foi possível identificar o terreiro.', 'error');
      setIsSavingProduct(false);
      return;
    }

    let imagemUrl: string | null = null;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const imgRes = await fetch(
          `/api/store/product-image-suggestion?q=${encodeURIComponent(nomeDoEstado)}`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );
        if (imgRes.ok) {
          const j = (await imgRes.json()) as { url?: string | null };
          const u = typeof j.url === 'string' ? j.url.trim() : '';
          if (u) imagemUrl = u;
        }
      }
    } catch (e) {
      console.warn('[Store] sugestão de imagem (Pexels):', e);
    }

    const { data: insertedRows, error } = await supabase
      .from('produtos')
      .insert([
        {
          nome: nomeDoEstado,
          descricao: descricaoDoEstado,
          preco: precoDoEstado,
          categoria: categoriaDoEstado,
          estoque_atual: estoqueAtual,
          estoque_minimo: estoqueMinimo,
          tenant_id: idDoTerreiroLogado,
          imagem_url: imagemUrl,
        },
      ])
      .select('*');

    if (error) {
      console.error('Erro do Supabase:', error);
      showToast('Erro', 'Erro ao salvar: ' + error.message, 'error');
      setIsSavingProduct(false);
      return;
    }

    const inserted = insertedRows?.[0];
    const novoProduto = inserted ? rowToProduct(inserted as Record<string, unknown>) : null;

    showToast('Sucesso', 'Produto salvo com sucesso!', 'success');
    setIsAddProductOpen(false);
    setNewProduct({ nome: '', descricao: '', preco: 0, estoque_atual: 0, estoque_minimo: 0, categoria: 'Velas' });

    if (novoProduto) {
      setProducts((prev) => {
        const rest = prev.filter((p) => p.id !== novoProduto.id);
        const merged = [...rest, novoProduto];
        merged.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        return merged;
      });
    }

    await fetchProducts({ silent: true, tenantPk: idDoTerreiroLogado });
    setIsSavingProduct(false);
  };

  const handleDeleteProduct = async (product: Product) => {
    if (!isAdmin) return;
    if (!confirm(`Excluir o produto "${product.nome}"? Ele deixa de aparecer na loja.`)) return;

    setDeletingProductId(product.id);
    try {
      const tenantPk = await resolveStoreTenantPk(storeTenantParams());
      if (!tenantPk) {
        showToast('Erro', 'Terreiro não identificado.', 'error');
        return;
      }

      const { error: softErr } = await supabase
        .from('produtos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', product.id)
        .eq('tenant_id', tenantPk);

      if (softErr) {
        const { error: hardErr } = await supabase
          .from('produtos')
          .delete()
          .eq('id', product.id)
          .eq('tenant_id', tenantPk);
        if (hardErr) {
          showToast('Erro', hardErr.message || softErr.message, 'error');
          return;
        }
      }

      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      setCart((prev) => prev.filter((item) => item.id !== product.id));
      showToast('Sucesso', 'Produto excluído da loja.', 'success');
      await fetchProducts({ silent: true, tenantPk });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao excluir produto.';
      showToast('Erro', msg, 'error');
    } finally {
      setDeletingProductId(null);
    }
  };

  return (
    <Toast.Provider swipeDirection="right">
      <div className="space-y-8">
        <PageHeader 
          title={<>Loja do <span className="text-primary">Axé</span></>}
          subtitle={
            userRole === 'filho'
              ? 'Compre com pagamento na mensalidade ou via PIX, ou reserve itens com o zelador. O pedido aparece para a gestão do terreiro.'
              : 'Artigos religiosos com baixa automática no estoque. Abaixo você acompanha pedidos feitos pelos filhos de santo.'
          }
          tenantData={tenantData}
          setActiveTab={setActiveTab}
          actions={
            <div className="flex items-center gap-4">
              {isAdmin && (
                <button 
                  onClick={() => setIsAddProductOpen(true)}
                  className="px-4 py-3 bg-primary text-background rounded-lg font-black text-sm hover:scale-105 transition-transform flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Novo Produto
                </button>
              )}
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
              >
                <ShoppingBag className="w-6 h-6 text-primary" />
                {cart.length > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-primary text-background rounded-full flex items-center justify-center text-xs font-black">
                    {cartQuantity}
                  </span>
                )}
              </button>
            </div>
          }
        />

        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-[#121212] rounded-2xl border border-[#FBBC00]/20 overflow-hidden animate-pulse md:rounded-3xl">
                <div className="aspect-square bg-white/5" />
                <div className="space-y-3 p-3 md:space-y-4 md:p-6">
                  <div className="h-4 bg-white/10 rounded w-3/4 md:h-6" />
                  <div className="h-3 bg-white/10 rounded w-1/2 md:h-4" />
                  <div className="h-9 bg-white/10 rounded-xl w-full md:h-10" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/5">
            <ShoppingBag className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white">Nenhum produto cadastrado</h3>
            <p className="text-gray-400 mt-2">A loja do terreiro ainda está vazia.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {products.map(product => {
              const isLowStock = product.estoque_atual > 0 && product.estoque_atual <= product.estoque_minimo;
              const isOutOfStock = product.estoque_atual === 0;

              return (
                <div key={product.id} className="group relative bg-[#121212] rounded-2xl border border-[#FBBC00]/20 overflow-hidden flex flex-col md:rounded-3xl">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProduct(product)}
                      disabled={deletingProductId === product.id}
                      className="absolute top-2 right-2 z-20 flex items-center justify-center rounded-lg border border-red-500/40 bg-black/75 p-2 text-red-400 transition-colors hover:bg-red-950/90 hover:text-red-200 disabled:opacity-50 md:top-3 md:right-3 md:rounded-xl md:p-2.5"
                      title="Excluir produto"
                      aria-label={`Excluir ${product.nome}`}
                    >
                      {deletingProductId === product.id ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-400/30 border-t-red-400 md:h-4 md:w-4" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      )}
                    </button>
                  )}
                  {/* Image Container */}
                  <div className="relative aspect-square bg-black/50 overflow-hidden">
                    {product.imagem_url ? (
                      <img 
                        src={product.imagem_url} 
                        alt={product.nome}
                        className={cn(
                          "w-full h-full object-cover transition-all duration-500 group-hover:scale-105",
                          isOutOfStock && "opacity-50 grayscale"
                        )}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <ImageIcon className="h-8 w-8 opacity-20 md:h-12 md:w-12" />
                      </div>
                    )}
                    
                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1.5 md:top-4 md:left-4 md:gap-2">
                      {isOutOfStock ? (
                        <span className="rounded-md border border-white/10 bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-md md:rounded-lg md:px-3 md:py-1 md:text-xs">
                          Indisponível
                        </span>
                      ) : isLowStock ? (
                        <span className="rounded-md border border-red-500/30 bg-red-900/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-200 backdrop-blur-md md:rounded-lg md:px-3 md:py-1 md:text-xs">
                          Últimas
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex flex-1 flex-col p-3 md:p-6">
                    <div className="mb-2 flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-3">
                      <h3 className="line-clamp-2 text-sm font-black leading-tight text-white md:text-lg">{product.nome}</h3>
                      <span className="whitespace-nowrap text-sm font-black text-primary md:ml-4 md:text-lg">
                        R$ {product.preco.toFixed(2)}
                      </span>
                    </div>
                    <p className="mb-3 line-clamp-2 flex-1 text-xs text-gray-400 md:mb-6 md:text-sm">{product.descricao}</p>
                    
                    <button 
                      onClick={() => {
                        if (userRole === 'filho') setIntencaoLojaFilho('compra');
                        addToCart(product);
                      }}
                      disabled={isOutOfStock}
                      className={cn(
                        "flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-[11px] font-black transition-all md:gap-2 md:py-3 md:text-sm",
                        isOutOfStock 
                          ? "bg-white/5 text-gray-500 cursor-not-allowed" 
                          : "bg-primary text-background hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/20"
                      )}
                    >
                      <ShoppingBag className="h-3.5 w-3.5 md:h-4 md:w-4" />
                      {isOutOfStock ? 'Sem estoque' : userRole === 'filho' ? 'Comprar' : 'Adicionar'}
                    </button>

                    {userRole === 'filho' && !isOutOfStock && (
                      <button 
                        type="button"
                        onClick={() => {
                          setIntencaoLojaFilho('reserva');
                          addToCart(product);
                          setIsCartOpen(true);
                        }}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-white/10 md:py-3 md:text-xs"
                      >
                        Reservar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isAdmin && (
          <section className="rounded-3xl border border-[#FBBC00]/20 bg-[#121212]/90 p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-6 h-6 text-primary shrink-0" />
              <div>
                <h3 className="text-lg font-black text-white">Pedidos dos filhos na loja</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Compras e reservas feitas pelos filhos de santo aparecem aqui e no histórico do dashboard.
                </p>
              </div>
            </div>
            {loadingPedidos ? (
              <p className="text-sm text-gray-500">Carregando pedidos…</p>
            ) : lojaPedidos.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Nenhum pedido registrado ainda.</p>
            ) : (
              <ul className="space-y-3 max-h-[min(420px,50vh)] overflow-y-auto no-scrollbar">
                {lojaPedidos.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 flex flex-col gap-1"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-black text-primary">{p.filho_nome || 'Filho de santo'}</span>
                      <span className="text-xs font-bold text-gray-500">
                        {new Date(p.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300">
                      <span className="font-black text-white">{p.tipo === 'reserva' ? 'Reserva' : 'Compra'}</span>
                      {' · '}
                      <span className="uppercase tracking-wide text-gray-400">
                        {p.metodo_pagamento === 'mensalidade'
                          ? 'Mensalidade'
                          : p.metodo_pagamento === 'pix'
                            ? 'PIX'
                            : p.metodo_pagamento === 'reserva'
                              ? 'Somente reserva'
                              : p.metodo_pagamento}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 line-clamp-2">{p.resumo_itens}</p>
                    <p className="text-sm font-black text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(p.valor_total) || 0)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* Cart Sheet */}
      <Dialog.Root open={isCartOpen} onOpenChange={setIsCartOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#121212]/90 backdrop-blur-xl border-l border-white/10 z-[101] p-6 flex flex-col shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full duration-300">
            <div className="flex items-center justify-between mb-8">
              <Dialog.Title className="text-2xl font-black text-white flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-primary" />
                Seu Pedido
              </Dialog.Title>
              <Dialog.Close className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar space-y-4">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                  <ShoppingBag className="w-12 h-12 opacity-20" />
                  <p>Seu carrinho está vazio.</p>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.id} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="w-16 h-16 bg-black/50 rounded-xl overflow-hidden shrink-0">
                      {item.imagem_url ? (
                        <img src={item.imagem_url} alt={item.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><ImageIcon className="w-6 h-6 text-gray-600" /></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{item.nome}</h4>
                      <p className="text-primary font-black text-sm">R$ {item.preco.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-3 bg-black/30 rounded-lg p-1 border border-white/5">
                      <button onClick={() => updateQuantity(item.id, -1)} className="p-1 text-gray-400 hover:text-white"><Minus className="w-4 h-4" /></button>
                      <span className="text-sm font-bold w-4 text-center">{item.quantidade}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="p-1 text-gray-400 hover:text-white"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-6 mt-6 border-t border-white/10 space-y-6">
                <div className="flex items-center justify-between text-lg">
                  <span className="text-gray-400 font-bold">Total</span>
                  <span className="text-2xl font-black text-primary">R$ {cartTotal.toFixed(2)}</span>
                </div>

                {userRole === 'filho' && (
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">
                    {intencaoLojaFilho === 'reserva' ? 'Reserva (sem pagamento agora)' : 'Compra — escolha como pagar'}
                  </p>
                )}

                <div className="space-y-3">
                  {userRole === 'filho' && intencaoLojaFilho === 'compra' && (
                    <>
                      <button 
                        type="button"
                        onClick={() => handleCheckout('mensalidade')}
                        disabled={isCheckoutLoading}
                        className="w-full py-4 bg-primary text-background rounded-xl font-black text-sm hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                      >
                        {isCheckoutLoading ? <div className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" /> : 'Pagamento na mensalidade'}
                      </button>

                      <button 
                        type="button"
                        onClick={() => handleCheckout('pix')}
                        disabled={isCheckoutLoading}
                        className="w-full py-4 bg-white/5 text-white rounded-xl font-black text-sm hover:bg-white/10 transition-colors disabled:opacity-50 border border-white/10 flex items-center justify-center gap-2"
                      >
                        {isCheckoutLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Pagamento via PIX'}
                      </button>
                    </>
                  )}

                  {userRole === 'filho' && intencaoLojaFilho === 'reserva' && (
                    <button 
                      type="button"
                      onClick={() => handleCheckout('reserva')}
                      disabled={isCheckoutLoading}
                      className="w-full py-4 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-xl font-black text-sm hover:bg-amber-500 hover:text-background transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isCheckoutLoading ? <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" /> : 'Confirmar reserva'}
                    </button>
                  )}

                  {userRole !== 'filho' && (
                    <button 
                      type="button"
                      onClick={() => handleCheckout('pix')}
                      disabled={isCheckoutLoading}
                      className="w-full py-4 bg-white/5 text-white rounded-xl font-black text-sm hover:bg-white/10 transition-colors disabled:opacity-50 border border-white/10"
                    >
                      {isCheckoutLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Pagar com PIX / Cartão'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Product Dialog */}
      <Dialog.Root open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-[#121212] rounded-3xl border border-white/10 z-[101] p-8 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-2xl font-black text-white">Novo Produto</Dialog.Title>
              <Dialog.Close className="p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/5 transition-colors">
                <X className="w-5 h-5" />
              </Dialog.Close>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">Nome do Produto</label>
                <input 
                  type="text" 
                  required
                  value={newProduct.nome}
                  onChange={e => setNewProduct({...newProduct, nome: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  placeholder="Ex: Vela de 7 Dias"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">Descrição</label>
                <textarea 
                  value={newProduct.descricao}
                  onChange={e => setNewProduct({...newProduct, descricao: e.target.value})}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors resize-none h-24"
                  placeholder="Detalhes do produto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Preço (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    required
                    value={newProduct.preco}
                    onChange={e => setNewProduct({...newProduct, preco: parseFloat(e.target.value) || 0})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Categoria</label>
                  <select 
                    value={newProduct.categoria}
                    onChange={e => setNewProduct({...newProduct, categoria: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors appearance-none [&>option]:bg-[#1B1C1C]"
                  >
                    <option value="Velas">Velas</option>
                    <option value="Guias">Guias</option>
                    <option value="Roupas">Roupas</option>
                    <option value="Ervas">Ervas</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Estoque Atual</label>
                  <input 
                    type="number" 
                    min="0"
                    required
                    value={newProduct.estoque_atual}
                    onChange={e => setNewProduct({...newProduct, estoque_atual: parseInt(e.target.value) || 0})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Estoque Mínimo</label>
                  <input 
                    type="number" 
                    min="0"
                    required
                    value={newProduct.estoque_minimo}
                    onChange={e => setNewProduct({...newProduct, estoque_minimo: parseInt(e.target.value) || 0})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 mt-6 border-t border-white/10 flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button type="button" className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                    Cancelar
                  </button>
                </Dialog.Close>
                <button 
                  type="submit" 
                  disabled={isSavingProduct}
                  className="px-6 py-3 bg-primary text-background rounded-xl font-black hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
                >
                  {isSavingProduct ? <div className="w-5 h-5 border-2 border-background/30 border-t-background rounded-full animate-spin" /> : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast Notifications */}
      <Toast.Root 
        open={toastOpen} 
        onOpenChange={setToastOpen}
        className={cn(
          "bg-[#1A1A1A] border p-4 rounded-2xl shadow-2xl flex items-start gap-4 w-[350px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-[transform_200ms_ease-out] data-[swipe=end]:animate-out",
          toastMessage.type === 'success' ? "border-green-500/30" : 
          toastMessage.type === 'error' ? "border-red-500/30" : "border-primary/30"
        )}
      >
        <div className="shrink-0 mt-0.5">
          {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
          {toastMessage.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
          {toastMessage.type === 'warning' && <AlertCircle className="w-5 h-5 text-primary" />}
        </div>
        <div className="flex-1">
          <Toast.Title className="text-sm font-bold text-white mb-1">{toastMessage.title}</Toast.Title>
          <Toast.Description className="text-xs text-gray-400 leading-relaxed">{toastMessage.description}</Toast.Description>
        </div>
        <Toast.Close className="text-gray-500 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </Toast.Close>
      </Toast.Root>
      <Toast.Viewport className="fixed bottom-0 right-0 p-6 flex flex-col gap-2 w-[390px] max-w-[100vw] m-0 list-none z-[200] outline-none" />
    </Toast.Provider>
  );
}
