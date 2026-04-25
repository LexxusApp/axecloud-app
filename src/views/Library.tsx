import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BookOpen, 
  Plus, 
  FileText, 
  Search, 
  Upload, 
  X, 
  Loader2, 
  Download, 
  ExternalLink,
  Trash2,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { hasPlanAccess } from '../constants/plans';
import CommentSection from '../components/CommentSection';
import PageHeader from '../components/PageHeader';

interface LibraryProps {
  user: any;
  userRole: string;
  tenantData: any;
  isAdminGlobal?: boolean;
  /** Painel compacto ao lado do mural (portal do filho) — abre PDF em nova aba */
  embedded?: boolean;
}

interface Material {
  id: string;
  titulo: string;
  categoria: string;
  arquivo_url: string;
  created_at: string;
  tenant_id: string;
  storage_path?: string;
}

const CATEGORIES = ['Cantigas', 'História', 'Ervas', 'Orixás', 'Fundamentos'];

/** Miniatura da capa do PDF — renderiza a 1ª página via PDF.js em canvas */
function PdfCover({ url, compact }: { url: string; compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        // Usa proxy local para evitar CORS no Supabase Storage
        const proxyUrl = `/api/v1/library/pdf-proxy?url=${encodeURIComponent(url)}`;
        const pdf = await pdfjsLib.getDocument(proxyUrl).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Renderiza em resolução maior para melhor qualidade, CSS escala depois
        const TARGET_WIDTH = 400;
        const viewport = page.getViewport({ scale: 1 });
        const scale = TARGET_WIDTH / viewport.width;
        const scaled = page.getViewport({ scale });

        // Atributos do canvas controlam a resolução real de renderização
        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) { setStatus('error'); return; }

        // Fundo branco explícito (para PDFs transparentes)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setStatus('loaded');
      } catch (err) {
        console.warn('[PdfCover] Erro ao renderizar capa:', err);
        if (!cancelled) setStatus('error');
      }
    }

    render();
    return () => { cancelled = true; };
  }, [url]);

  const coverH = compact ? 120 : 200;
  return (
    <div className="relative w-full overflow-hidden bg-[#0d0d0d]" style={{ height: `${coverH}px` }}>
      {/* Spinner enquanto processa */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-primary/40 animate-spin" />
        </div>
      )}

      {/* Fallback de erro */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/5 to-transparent">
          <FileText className="w-14 h-14 text-primary/25" />
          <span className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">PDF</span>
        </div>
      )}

      {/* Canvas: 100% de largura via CSS, altura natural — container clipa em 200px */}
      <canvas
        ref={canvasRef}
        style={{
          display: status === 'loaded' ? 'block' : 'none',
          width: '100%',
          height: 'auto',
        }}
      />

      {/* Gradiente inferior */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#111]/90" />
    </div>
  );
}

export default function Library({ user, userRole, tenantData, isAdminGlobal, setActiveTab, embedded }: LibraryProps & { setActiveTab: (tab: string) => void }) {
  // Não-filhos são sempre gestores do terreiro (plano determina quais funções de gestão estão disponíveis).
  const isAdmin = userRole !== 'filho';
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);

  const [newMaterial, setNewMaterial] = useState({
    titulo: '',
    categoria: 'Cantigas',
    file: null as File | null
  });

  const fetchMaterials = async () => {
    const effectiveTenantId = tenantData?.tenant_id || user.id;
    if (!effectiveTenantId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Usa endpoint do servidor (supabaseAdmin) para bypassar RLS
      // Isso permite que filhos de santo vejam os materiais do zelador
      const res = await fetch(`/api/v1/library/materials?tenantId=${encodeURIComponent(effectiveTenantId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data } = await res.json();
      setMaterials(data || []);
    } catch (error) {
      console.error('Error fetching materials:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const effectiveTenantId = tenantData?.tenant_id || user.id;
    if (effectiveTenantId) {
      fetchMaterials();
      
      // Mark library notifications as read for admins
      if (isAdmin) {
        supabase
          .from('notificacoes')
          .update({ lida: true })
          .eq('tenant_id', effectiveTenantId)
          .eq('tipo', 'biblioteca_duvida')
          .then(({ error }) => {
            if (error) console.error('Error marking notifications as read:', error);
          });
      }
    }
  }, [tenantData?.tenant_id, user.id, userRole]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMaterial.file) {
      alert('Por favor, selecione um arquivo PDF.');
      return;
    }
    if (!newMaterial.titulo) {
      alert('Por favor, insira um título para o material.');
      return;
    }
    const effectiveTenantId = tenantData?.tenant_id || user.id;

    if (!effectiveTenantId) {
      alert('Erro: ID do terreiro não encontrado. Tente recarregar a página.');
      return;
    }

    try {
      setUploading(true);
      
      const file = newMaterial.file;
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const uploadUrlResponse = await fetch('/api/v1/library/upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          fileName,
          contentType: file.type,
          categoria: newMaterial.categoria,
          tenantId: effectiveTenantId
        })
      });

      const uploadUrlResult = await uploadUrlResponse.json();
      if (!uploadUrlResponse.ok) {
        throw new Error(uploadUrlResult.error || 'Erro ao preparar upload');
      }

      const { error: uploadError } = await supabase.storage
        .from('biblioteca_estudos')
        .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, file, {
          contentType: file.type || uploadUrlResult.contentType || 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const completeResponse = await fetch('/api/v1/library/complete-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          storagePath: uploadUrlResult.path,
          titulo: newMaterial.titulo,
          categoria: newMaterial.categoria,
          tenantId: effectiveTenantId
        })
      });

      const completeResult = await completeResponse.json();
      if (!completeResponse.ok) {
        throw new Error(completeResult.error || 'Erro ao salvar material');
      }

      setIsUploadModalOpen(false);
      setNewMaterial({ titulo: '', categoria: 'Cantigas', file: null });
      fetchMaterials();
    } catch (error: any) {
      console.error('Error uploading material:', error);
      alert('Erro ao subir material: ' + (error.message || 'Desconhecido'));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, storagePath: string) => {
    if (!confirm('Deseja realmente excluir este material?')) return;

    try {
      // 1. Delete from Storage
      if (storagePath) {
        await supabase.storage
          .from('biblioteca_estudos')
          .remove([storagePath]);
      }

      // 2. Delete from Database
      const { error } = await supabase
        .from('biblioteca')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchMaterials();
    } catch (error) {
      console.error('Error deleting material:', error);
      alert('Erro ao excluir material.');
    }
  };

  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      const matchesSearch = m.titulo.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory ? m.categoria === selectedCategory : true;
      return matchesSearch && matchesCategory;
    });
  }, [materials, searchQuery, selectedCategory]);

  const openMaterial = (m: Material) => {
    if (embedded) {
      window.open(m.arquivo_url, '_blank', 'noopener,noreferrer');
    } else {
      setSelectedMaterial(m);
    }
  };

  return (
    <div className={cn('flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden', embedded && 'min-h-0')}>
      <AnimatePresence mode="wait">
        {selectedMaterial && !embedded ? (
          <motion.div 
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto box-border w-full min-w-0 max-w-[1440px] flex-1 space-y-8 px-3 pb-10 sm:space-y-10 sm:px-4 sm:pb-12 md:px-6 lg:px-10 lg:pb-16"
          >
            {/* Detail Header */}
            <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <button 
                  onClick={() => setSelectedMaterial(null)}
                  className="shrink-0 rounded-2xl bg-white/5 p-3 transition-all hover:bg-primary hover:text-background group sm:p-4"
                >
                  <X className="h-5 w-5 sm:h-6 sm:w-6" />
                </button>
                <div className="min-w-0 flex-1">
                  <h1 className="break-words text-xl font-black tracking-tight text-white sm:text-2xl md:text-3xl">{selectedMaterial.titulo}</h1>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary">{selectedMaterial.categoria}</p>
                </div>
              </div>
              
              <button 
                onClick={() => window.open(selectedMaterial.arquivo_url, '_blank')}
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-white/5 px-4 py-3 text-sm font-black text-white transition-all hover:bg-primary hover:text-background sm:w-auto md:gap-3 md:px-8 md:py-4"
              >
                <Download className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                Baixar PDF
              </button>
            </div>

            {/* PDF Viewer (Iframe) */}
            <div className="card-luxury relative aspect-[16/9] w-full min-w-0 max-w-full overflow-hidden rounded-3xl shadow-2xl">
              <iframe 
                src={`${selectedMaterial.arquivo_url}#toolbar=0`}
                className="w-full h-full border-none"
                title={selectedMaterial.titulo}
              />
              <div className="absolute right-2 top-2 max-w-[calc(100%-1rem)] sm:right-6 sm:top-6">
                <div className="rounded-xl border border-white/10 bg-background/80 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md sm:px-4 sm:py-2 sm:text-[10px]">
                  Modo de Estudo Ativo
                </div>
              </div>
            </div>

            {/* Comments Section */}
            <div className="mx-auto w-full min-w-0 max-w-4xl">
              <CommentSection 
                materialId={selectedMaterial.id}
                user={user}
                userRole={userRole}
                tenantId={tenantData.tenant_id}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={cn('flex min-h-full w-full min-w-0 max-w-full flex-col', embedded && 'min-h-0 flex-1')}
          >
            {embedded ? (
              <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/[0.06] pb-3 mb-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-primary">Biblioteca de estudos</p>
                  <h2 className="text-base font-black text-white tracking-tight mt-0.5">PDFs do terreiro</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('library')}
                  className="shrink-0 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-primary flex items-center gap-1"
                >
                  Ver tudo
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <PageHeader 
                title={<>Biblioteca de <span className="text-primary">Estudos</span></>}
                subtitle="O conhecimento é a base do fundamento."
                tenantData={tenantData}
                setActiveTab={setActiveTab}
                actions={
                  isAdmin && (
                    <button 
                      onClick={() => setIsUploadModalOpen(true)}
                      className={cn(
                        'flex min-w-0 w-full max-w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-black text-background shadow-xl shadow-primary/20 transition-all sm:w-auto sm:gap-3 sm:px-6 sm:py-3 sm:text-sm md:px-8',
                        !hasPlanAccess(tenantData?.plan, 'library') ? 'opacity-50' : 'hover:scale-[1.02]'
                      )}
                    >
                      {!hasPlanAccess(tenantData?.plan, 'library') ? <Lock className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" /> : <Plus className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />}
                      <span className="truncate sm:whitespace-normal">Subir Material</span>
                    </button>
                  )
                }
              />
            )}

            <div className={cn(
              'mx-auto box-border w-full min-w-0 max-w-[1440px] flex-1 space-y-10 px-3 pb-10 sm:px-4 sm:pb-12 md:px-6 lg:px-10 lg:pb-16',
              embedded && 'max-w-none flex min-h-0 flex-col space-y-3 px-0 pb-0 sm:space-y-3 sm:px-0 sm:pb-0 md:px-0 lg:px-0 lg:pb-0'
            )}>
              {/* Search & Filters */}
            <div className={cn('flex min-w-0 max-w-full flex-col gap-4 sm:gap-6', embedded && 'shrink-0 gap-2 sm:gap-2')}>
              <div className="relative min-w-0 flex-1 group">
                <Search className={cn('absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-primary sm:left-5', embedded && 'left-3 h-4 w-4 sm:left-3')} />
                <input 
                  type="text"
                  placeholder="Buscar material..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    'w-full min-w-0 rounded-xl border border-white/10 bg-[#121212] py-3.5 pl-12 pr-4 text-sm font-bold text-white shadow-xl placeholder:text-gray-500 transition-all focus:border-primary/50 focus:outline-none sm:py-4 sm:pl-14 sm:pr-6 md:text-base',
                    embedded && 'py-2.5 pl-10 text-xs sm:py-2.5 sm:pl-10 sm:pr-3'
                  )}
                />
              </div>
              <div className={cn(
                'flex min-h-[44px] min-w-0 w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pb-2 touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-3',
                embedded && 'min-h-[36px] gap-1.5 pb-1 sm:gap-1.5'
              )}>
                <button 
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    'shrink-0 rounded-xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all sm:px-5 sm:py-3 sm:text-xs md:px-6 whitespace-nowrap',
                    !selectedCategory ? "bg-primary text-background border-primary shadow-lg shadow-primary/20" : "bg-[#121212] text-gray-400 border-white/10 hover:border-white/30 hover:text-white shadow-xl",
                    embedded && 'px-2.5 py-1.5 text-[8px] sm:px-3 sm:py-2 sm:text-[9px]'
                  )}
                >
                  Todos
                </button>
                {CATEGORIES.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      'shrink-0 rounded-xl border px-4 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all sm:px-5 sm:py-3 sm:text-xs md:px-6 whitespace-nowrap',
                      selectedCategory === cat ? "bg-primary text-background border-primary shadow-lg shadow-primary/20" : "bg-[#121212] text-gray-400 border-white/10 hover:border-white/30 hover:text-white shadow-xl",
                      embedded && 'px-2.5 py-1.5 text-[8px] sm:px-3 sm:py-2 sm:text-[9px]'
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Materials Grid */}
            {loading ? (
              <div className={cn('grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4', embedded && 'grid-cols-2 gap-2 md:grid-cols-2 lg:grid-cols-2')}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className={cn('h-40 bg-card rounded-xl animate-pulse border border-white/5', embedded && 'h-32')} />
                ))}
              </div>
            ) : filteredMaterials.length > 0 ? (
              <div className={cn(
                'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4',
                embedded && 'min-h-0 max-h-[min(520px,55vh)] flex-1 grid-cols-1 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 [scrollbar-width:thin]'
              )}>
                {filteredMaterials.map((material) => (
                  <motion.div
                    key={material.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group relative min-w-0 overflow-hidden rounded-xl border border-white/5 bg-[#111] transition-all duration-500 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5 flex flex-col"
                  >
                    {/* Capa do PDF */}
                    <div
                      className="cursor-pointer"
                      onClick={() => openMaterial(material)}
                    >
                      <PdfCover url={material.arquivo_url} compact={embedded} />
                    </div>

                    {/* Badge de categoria — sobrepõe a miniatura */}
                    <span className="absolute top-2 right-2 rounded-md border border-primary/30 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-primary">
                      {material.categoria}
                    </span>

                    {/* Conteúdo inferior */}
                    <div className={cn('flex flex-1 flex-col gap-2 p-3', embedded && 'gap-1 p-2')}>
                      <div className="min-w-0">
                        <h3
                          className={cn(
                            'line-clamp-2 text-xs font-black leading-snug text-white transition-colors group-hover:text-primary cursor-pointer',
                            embedded && 'text-[10px] leading-tight'
                          )}
                          onClick={() => openMaterial(material)}
                        >
                          {material.titulo}
                        </h3>
                        <p className="mt-0.5 text-[9px] font-bold text-gray-600 uppercase tracking-widest">
                          {new Date(material.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      <div className="flex min-w-0 items-center gap-1.5 mt-auto">
                        <button
                          type="button"
                          onClick={() => openMaterial(material)}
                          className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 py-2 text-[8px] font-black uppercase tracking-widest text-white transition-all hover:bg-primary hover:text-background"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate">{embedded ? 'Abrir PDF' : 'Estudar'}</span>
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(material.id, (material as any).storage_path)}
                            className="shrink-0 rounded-lg bg-red-500/10 p-2 text-red-500 transition-all hover:bg-red-500 hover:text-white"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="box-border w-full min-w-0 max-w-full rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center sm:py-20">
                <BookOpen className="w-16 h-16 text-gray-800 mx-auto mb-6" />
                <h3 className="text-2xl font-black text-white">Nenhum material encontrado</h3>
                <p className="text-gray-600 mt-2">Tente ajustar sua busca ou filtros.</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#1F1F1F] shadow-2xl sm:max-w-lg sm:rounded-3xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white sm:text-xl">Subir Material</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-0.5">Gestão de Conhecimento</p>
                </div>
                <button onClick={() => setIsUploadModalOpen(false)} className="shrink-0 rounded-2xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleUpload} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Título do Material</label>
                  <input type="text" value={newMaterial.titulo}
                    onChange={e => setNewMaterial({ ...newMaterial, titulo: e.target.value })}
                    className="w-full rounded-xl border border-white/5 bg-background px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-primary/50"
                    placeholder="Ex: Cantigas de Oxóssi" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Categoria</label>
                  <select value={newMaterial.categoria}
                    onChange={e => setNewMaterial({ ...newMaterial, categoria: e.target.value })}
                    className="w-full rounded-xl border border-white/5 bg-background px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-primary/50 [&>option]:bg-[#1B1C1C]">
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Arquivo PDF</label>
                  <div className="relative">
                    <input type="file" accept=".pdf"
                      onChange={e => setNewMaterial({ ...newMaterial, file: e.target.files?.[0] || null })}
                      className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0" />
                    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-background px-4 py-6 transition-all">
                      <Upload className="h-7 w-7 text-gray-600" />
                      <p className="max-w-full truncate px-2 text-center text-xs font-bold text-gray-500" title={newMaterial.file?.name}>
                        {newMaterial.file ? newMaterial.file.name : 'Selecione ou arraste o PDF'}
                      </p>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={uploading}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-xs font-black uppercase tracking-widest text-background shadow-xl shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95">
                  {uploading ? <><Loader2 className="h-5 w-5 animate-spin" />Subindo...</> : <><Upload className="h-5 w-5" />Confirmar Upload</>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
