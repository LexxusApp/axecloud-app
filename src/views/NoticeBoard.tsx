import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, 
  Plus, 
  Search, 
  AlertCircle, 
  PartyPopper, 
  BookOpen, 
  Info, 
  Calendar as CalendarIcon,
  X,
  Send,
  Loader2,
  Trash2,
  MessageCircle,
  Copy,
  CheckCircle2,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { MODAL_PANEL_DONE, MODAL_PANEL_IN, MODAL_PANEL_OUT, MODAL_TW } from '../lib/modalMotion';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import PageHeader from '../components/PageHeader';

interface Notice {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: 'Urgente' | 'Festas' | 'Doutrina' | 'Geral';
  data_publicacao: string;
  expiracao?: string;
  tenant_id: string;
}

const categories = ['Todos', 'Urgente', 'Festas', 'Doutrina'] as const;

const categoryConfig = {
  Urgente: {
    icon: AlertCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    badge: 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]'
  },
  Festas: {
    icon: PartyPopper,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    badge: 'bg-amber-500 text-black font-black'
  },
  Doutrina: {
    icon: BookOpen,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    badge: 'bg-blue-500 text-white'
  },
  Geral: {
    icon: Info,
    color: 'text-gray-400',
    bg: 'bg-gray-400/10',
    border: 'border-gray-400/20',
    badge: 'bg-gray-400 text-white'
  }
};

export default function NoticeBoard({ isAdmin, tenantData, setActiveTab }: { isAdmin?: boolean, tenantData?: any, setActiveTab: (tab: string) => void }) {
  const tenantId = tenantData?.tenant_id;
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastPostedNotice, setLastPostedNotice] = useState<{titulo: string, conteudo: string} | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isNotifyingWA, setIsNotifyingWA] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    titulo: '',
    conteudo: '',
    categoria: 'Geral' as Notice['categoria'],
    expiracao: ''
  });

  const getFormattedMessage = (title: string, content: string) => {
    const systemUrl = window.location.origin;
    const summary = content.length > 100 ? content.substring(0, 100) + '...' : content;
    return `📢 *AVISO DO TERREIRO - AXÉCLOUD* 📢\n\n📌 *Assunto:* ${title}\n\n📝 ${summary}\n\n🔗 Veja o aviso completo aqui: ${systemUrl}`;
  };

  const generateWhatsAppLink = (title: string, content: string) => {
    const message = getFormattedMessage(title, content);
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  const copyToClipboard = async (title: string, content: string, id?: string) => {
    const message = getFormattedMessage(title, content);
    try {
      await navigator.clipboard.writeText(message);
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        alert('Texto copiado para o WhatsApp!');
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  useEffect(() => {
    fetchNotices();
  }, [tenantId]);

  async function fetchNotices() {
    setLoading(true);
    try {
      const response = await fetch(`/api/notices?tenantId=${tenantId || ''}`);
      if (!response.ok) throw new Error('Failed to fetch notices');
      const { data } = await response.json();
      setNotices(data || []);
    } catch (error) {
      console.error('Error fetching notices:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Prepara os dados para inserção, tratando a data de expiração vazia como null
      const insertData = {
        titulo: formData.titulo,
        conteudo: formData.conteudo,
        categoria: formData.categoria,
        tenant_id: tenantId || user.id,
        data_publicacao: new Date().toISOString(),
        expiracao: formData.expiracao || null
      };

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/notices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          ...insertData,
          tenantId: tenantId || user.id,
          autorId: user.id,
          autorNome: tenantData?.nome_zelador || 'Zelador'
        })
      });

      if (!response.ok) {
        let errorMsg = 'Falha ao publicar aviso';
        try {
          const errData = await response.json();
          if (errData.details) {
            console.error('[MURAL /api/notices] debug do servidor:', errData.details);
          }
          errorMsg = errData.error || errorMsg;
        } catch (e) {
          console.error('Error parsing error response:', e);
        }
        throw new Error(errorMsg);
      }
      
      setLastPostedNotice({ titulo: formData.titulo, conteudo: formData.conteudo });

      setIsModalOpen(false);
      setShowSuccessModal(true);
      setFormData({ titulo: '', conteudo: '', categoria: 'Geral', expiracao: '' });
      fetchNotices();
    } catch (error: any) {
      console.error('Error posting notice:', error);
      if (error.code === 'PGRST205') {
        alert('Erro: Tabela mural_avisos não encontrada. Por favor, execute o script de migração no Supabase.');
      } else {
        alert('Erro ao publicar aviso: ' + (error.message || 'Erro desconhecido'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMassWhatsAppNotification(titulo: string) {
    if (isNotifyingWA) return;
    setIsNotifyingWA(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const childrenRes = await fetch(`/api/children?userId=${user.id}&tenantId=${tenantId || ''}`);
      if (!childrenRes.ok) throw new Error('Não foi possível buscar a lista de filhos');
      
      const { data: childrenData } = await childrenRes.json();
      
      if (childrenData && childrenData.length > 0) {
        const { data: { session } } = await supabase.auth.getSession();
        
        let count = 0;
        for (const child of childrenData) {
          if (child.whatsapp_phone) {
            count++;
            fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`
              },
              body: JSON.stringify({
                tipo: 'mural_aviso',
                filhoId: child.id,
                variables: {
                  nome_filho: child.nome,
                  nome_terreiro: tenantData?.nome || 'Nosso Terreiro',
                  titulo_aviso: titulo
                }
              })
            }).catch(e => console.error('Error sending individual WhatsApp:', e));
          }
        }
        
        if (count > 0) {
          alert(`✅ Sucesso! ${count} notificações estão sendo processadas.`);
          setShowSuccessModal(false);
        } else {
          alert('Nenhum filho de santo encontrado com WhatsApp cadastrado.');
        }
      }
    } catch (error: any) {
      console.error('Error in handleMassWhatsAppNotification:', error);
      alert('Erro ao enviar notificações: ' + error.message);
    } finally {
      setIsNotifyingWA(false);
    }
  }

  async function deleteNotice(id: string) {
    if (!confirm('Deseja realmente excluir este aviso?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        alert('Sessão expirada. Faça login novamente.');
        return;
      }
      const response = await fetch(`/api/notices/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Não foi possível excluir o aviso.');
      }
      fetchNotices();
    } catch (error: unknown) {
      console.error('Error deleting notice:', error);
      const msg = error instanceof Error ? error.message : 'Erro ao excluir aviso.';
      alert(msg);
    }
  }

  const filteredNotices = useMemo(() => {
    return notices
      .filter(n => {
        const matchesCategory = activeCategory === 'Todos' || n.categoria === activeCategory;
        const matchesSearch = n.titulo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             n.conteudo.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        // Pinned logic: Urgente always on top
        if (a.categoria === 'Urgente' && b.categoria !== 'Urgente') return -1;
        if (a.categoria !== 'Urgente' && b.categoria === 'Urgente') return 1;
        // Then by date
        return new Date(b.data_publicacao).getTime() - new Date(a.data_publicacao).getTime();
      });
  }, [notices, activeCategory, searchTerm]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title={<>Mural de <span className="text-primary">Avisos</span></>}
        subtitle="Fique por dentro das atividades do Axé."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
        actions={
          !!isAdmin && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-primary text-background px-8 py-3 rounded-lg font-black flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
            >
              <Plus className="w-6 h-6" />
              Postar Novo Aviso
            </button>
          )
        }
      />

      <div className="flex-1 px-4 md:px-6 lg:px-10 pb-12 max-w-[1440px] mx-auto w-full space-y-8">
        {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">
        <div className="flex bg-card p-1.5 rounded-2xl border border-white/5 w-full lg:w-auto overflow-x-auto no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                activeCategory === cat 
                  ? "bg-primary text-background shadow-lg shadow-primary/20" 
                  : "text-gray-400 hover:text-white"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
        
        <div className="relative w-full lg:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Buscar avisos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-card border border-white/5 rounded-2xl pl-12 pr-4 py-3.5 text-white focus:outline-none focus:border-primary/50 transition-all font-medium"
          />
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="card-luxury h-64 animate-pulse bg-white/5 w-full max-w-[min(100%,calc(50vw-1rem))] justify-self-start md:max-w-none"
            />
          ))}
        </div>
      ) : filteredNotices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {filteredNotices.map((notice, idx) => {
            const config = categoryConfig[notice.categoria] || categoryConfig.Geral;
            const Icon = config.icon;
            
            return (
              <motion.div
                key={notice.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "card-luxury p-4 sm:p-5 md:p-8 flex flex-col gap-4 sm:gap-5 md:gap-6 w-full max-w-[min(100%,calc(50vw-1rem))] justify-self-start md:max-w-none",
                  "group transition-all duration-500 hover:scale-[1.03] lg:hover:scale-105",
                  notice.categoria === 'Urgente' && "border-red-500/30 bg-red-500/5"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className={cn("p-3 rounded-2xl", config.bg, config.border)}>
                    <Icon className={cn("w-6 h-6", config.color)} />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={cn("px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest", config.badge)}>
                      {notice.categoria}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {format(new Date(notice.data_publicacao), "dd 'de' MMM", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 md:space-y-3 flex-grow min-w-0">
                  <h3 className="text-base sm:text-lg md:text-xl font-black text-white group-hover:text-primary transition-colors leading-tight break-words">
                    {notice.titulo}
                  </h3>
                  <div className="text-gray-400 text-xs sm:text-sm leading-relaxed line-clamp-4 prose prose-invert prose-sm max-w-none [&_p]:my-1">
                    <ReactMarkdown>{notice.conteudo}</ReactMarkdown>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                    <div className="flex gap-2">
                      <button 
                        disabled={isNotifyingWA}
                        onClick={() => handleMassWhatsAppNotification(notice.titulo)}
                        className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-50"
                        title="Notificar Todos via WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <a 
                        href={generateWhatsAppLink(notice.titulo, notice.conteudo)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-white/5 text-gray-500 hover:bg-primary/10 hover:text-primary transition-all"
                        title="Compartilhar Manualmente"
                      >
                        <Share2 className="w-4 h-4" />
                      </a>
                      <button 
                        onClick={() => copyToClipboard(notice.titulo, notice.conteudo, notice.id)}
                        className={cn(
                          "p-2 rounded-xl bg-white/5 transition-all",
                          copiedId === notice.id ? "text-emerald-500 bg-emerald-500/10" : "text-gray-500 hover:bg-white/10 hover:text-white"
                        )}
                        title="Copiar texto formatado"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <button 
                      onClick={() => deleteNotice(notice.id)}
                      className="p-2 rounded-xl bg-white/5 text-gray-500 hover:bg-red-500/10 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="py-20 text-center space-y-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
            <Bell className="w-10 h-10 text-gray-600" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Nenhum aviso encontrado</h3>
            <p className="text-gray-500 max-w-xs mx-auto">Tudo tranquilo por aqui. Novos avisos aparecerão neste feed.</p>
          </div>
          {!!isAdmin && (
            <motion.button 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsModalOpen(true)}
              className="bg-primary text-background px-10 py-4 rounded-2xl font-black flex items-center gap-3 mx-auto shadow-2xl shadow-primary/40 hover:bg-white transition-all group"
            >
              <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
              <span className="text-lg">Postar Primeiro Aviso</span>
            </motion.button>
          )}
        </div>
      )}

      {/* FAB for Mobile Admins */}
      {isAdmin && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="lg:hidden fixed bottom-24 right-6 w-16 h-16 bg-primary text-background rounded-full shadow-2xl shadow-primary/40 flex items-center justify-center z-50 active:scale-90 transition-transform"
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      {/* Post Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/[0.9] backdrop-blur-none"
            />
            <motion.div
              initial={MODAL_PANEL_IN}
              animate={MODAL_PANEL_DONE}
              exit={MODAL_PANEL_OUT}
              transition={MODAL_TW}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl sm:max-w-2xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-8">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white sm:text-2xl">Novo <span className="text-primary">Aviso</span></h3>
                  <p className="text-xs text-gray-400 font-medium mt-0.5">Comunique-se com os Filhos de Santo.</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="shrink-0 rounded-2xl bg-white/5 p-2 text-gray-400 transition-colors hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Título</label>
                    <input required type="text" value={formData.titulo}
                      onChange={e => setFormData({...formData, titulo: e.target.value})}
                      placeholder="Ex: Festa de Iemanjá"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-primary/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Categoria</label>
                    <select value={formData.categoria}
                      onChange={e => setFormData({...formData, categoria: e.target.value as Notice['categoria']})}
                      className="w-full appearance-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-primary/50 [&>option]:bg-[#1B1C1C]">
                      <option value="Geral">Geral</option>
                      <option value="Urgente">Urgente</option>
                      <option value="Festas">Festas</option>
                      <option value="Doutrina">Doutrina</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-0.5">Conteúdo (Suporta Markdown)</label>
                  <textarea required rows={5} value={formData.conteudo}
                    onChange={e => setFormData({...formData, conteudo: e.target.value})}
                    placeholder="Use **negrito** para destacar..."
                    className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white outline-none transition-all focus:border-primary/50" />
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2">
                  <Bell className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                  <span className="text-xs text-yellow-400">Notificação push enviada automaticamente aos filhos de santo.</span>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 rounded-2xl py-3 font-black text-sm text-gray-400 transition-all hover:bg-white/5 hover:text-white">
                    Cancelar
                  </button>
                  <button disabled={isSubmitting} type="submit"
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-black text-sm text-background shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-5 w-5" />Publicar</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && lastPostedNotice && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowSuccessModal(false)}
              className="absolute inset-0 bg-black/[0.94] backdrop-blur-none"
            />
            <motion.div
              initial={MODAL_PANEL_IN}
              animate={MODAL_PANEL_DONE}
              exit={MODAL_PANEL_OUT}
              transition={MODAL_TW}
              className="relative z-10 w-[min(100%,20rem)] mx-3 sm:mx-4 sm:w-full overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-[0_0_32px_rgba(251,188,0,0.08)] sm:max-w-sm"
            >
              <div className="overflow-y-auto px-4 py-5 sm:px-5 sm:py-6 text-center space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-h-[88dvh] sm:max-h-[90dvh]">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                  <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500" />
                </div>
                
                <div className="space-y-1">
                  <h3 className="text-lg sm:text-xl font-black text-white leading-tight">Aviso <span className="text-primary">Publicado!</span></h3>
                  <p className="text-xs sm:text-sm text-gray-400 font-medium">O que deseja fazer agora?</p>
                </div>

                <div className="flex flex-col gap-2 sm:gap-2.5">
                  <button disabled={isNotifyingWA}
                    onClick={() => handleMassWhatsAppNotification(lastPostedNotice.titulo)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-500 bg-emerald-600 px-3 py-2.5 font-black text-xs sm:text-sm text-white shadow-[0_0_16px_rgba(16,185,129,0.1)] transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50">
                    <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                    {isNotifyingWA ? 'Enviando...' : 'Notificar Todos via WhatsApp'}
                  </button>
                  <a href={generateWhatsAppLink(lastPostedNotice.titulo, lastPostedNotice.conteudo)}
                    target="_blank" rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-primary bg-black px-3 py-2.5 font-black text-xs sm:text-sm text-primary shadow-[0_0_16px_rgba(251,188,0,0.08)] transition-all hover:bg-primary/5 active:scale-95">
                    <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
                    Compartilhar Manualmente
                  </a>
                  <button onClick={() => copyToClipboard(lastPostedNotice.titulo, lastPostedNotice.conteudo)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-3 py-2.5 font-black text-xs sm:text-sm text-white transition-all hover:bg-white/10 active:scale-95">
                    <Copy className="h-4 w-4 sm:h-5 sm:w-5" />
                    Copiar Texto para WhatsApp
                  </button>
                </div>

                <button 
                  onClick={() => setShowSuccessModal(false)}
                  className="text-gray-500 text-sm font-bold hover:text-white transition-colors pt-1"
                >
                  Fechar e voltar ao mural
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
