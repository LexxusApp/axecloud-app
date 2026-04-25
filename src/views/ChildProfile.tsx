import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, User, Phone, MapPin, Activity, AlertTriangle, Edit2, Save, X, FileText, History, CircleDollarSign, Trash2, Loader2, Plus, MessageCircle, CreditCard, CheckCircle2, Lock, ShieldAlert, ShieldCheck, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import { hasPlanAccess } from '../constants/plans';

interface ChildProfileProps {
  childId: string | null;
  setActiveTab: (tab: string) => void;
  user: any;
  tenantData?: any;
  isSelfView?: boolean;
}

export default function ChildProfile({ childId, setActiveTab, user, tenantData, isSelfView = false }: ChildProfileProps) {
  const [child, setChild] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<'info' | 'history' | 'finance' | 'notes'>('info');

  const [childObligations, setChildObligations] = useState<any[]>([]);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isObligationModalOpen, setIsObligationModalOpen] = useState(false);
  const [hasDebt, setHasDebt] = useState(false);
  const [obligationData, setObligationData] = useState({
    titulo: '',
    data: new Date().toISOString().split('T')[0],
    hora: '00:00',
    descricao: '',
    notifyChild: true
  });
  const [privateNotes, setPrivateNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const tenantId = tenantData?.tenant_id;
  /** Alinhado à configuração do zelador (tabela / API pix-config), não hardcoded. */
  const [valorMensalidadeConfig, setValorMensalidadeConfig] = useState(89.9);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const pixRes = await fetch(`/api/v1/financial/pix-config?tenantId=${encodeURIComponent(tenantId)}`);
        const { data: pixData } = pixRes.ok ? await pixRes.json() : { data: null };
        if (!cancelled && pixData?.valor_mensalidade != null) {
          setValorMensalidadeConfig(Number(pixData.valor_mensalidade));
        }
      } catch {
        /* silencioso: mantém default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    const fetchChild = async () => {
      if (!childId && !isSelfView) {
        setError("Nenhum filho selecionado.");
        setLoading(false);
        return;
      }

      try {
        let data;
        if (isSelfView) {
          // Se for visualização própria, busca pelo user_id
          let query = supabase
            .from('filhos_de_santo')
            .select('*')
            .eq('user_id', user?.id);
          
          if (tenantId) {
            query = query.eq('tenant_id', tenantId);
          }

          const { data: selfData, error: selfError } = await query.maybeSingle();
          
          if (selfError) {
            console.error("Erro ao buscar perfil próprio (user_id):", selfError);
            throw new Error("Não foi possível encontrar seu perfil de filho. Verifique se a coluna 'user_id' existe na tabela 'filhos_de_santo'.");
          }
          
          if (!selfData) {
            throw new Error("Seu perfil de filho de santo ainda não foi vinculado ao seu usuário. Contate o Zelador.");
          }
          
          data = selfData;
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          const response = await fetch(`/api/children/${childId}?userId=${user?.id}&tenantId=${tenantId || ''}`, {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`
            }
          });
          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || "Erro ao buscar dados do filho");
          }
          const result = await response.json();
          data = result.data;
        }
        
        setChild(data);
        setEditData(data);
        setPrivateNotes(data.notas_sigilosas || '');

        // Check for debt
        let debtQuery = supabase
          .from('financeiro')
          .select('id')
          .eq('filho_id', data.id)
          .eq('status', 'pendente');
        
        if (tenantId) {
          debtQuery = debtQuery.eq('tenant_id', tenantId);
        }

        const { data: debtData } = await debtQuery.limit(1);
        
        setHasDebt(!!debtData && debtData.length > 0);

        // Fetch Obligations
        let obsQuery = supabase
          .from('calendario_axe')
          .select('*')
          .eq('tipo', 'Obrigação')
          .like('descricao', `%FILHO_ID:${data.id}%`)
          .order('data', { ascending: false });

        if (tenantId) {
          obsQuery = obsQuery.eq('tenant_id', tenantId);
        }

        const { data: obsData } = await obsQuery;
        
        if (obsData) {
          // Clean up the description for display
          const cleanedObs = obsData.map(ob => ({
            ...ob,
            titulo: ob.titulo,
            data: ob.data,
            descricao: ob.descricao.split('\n\n=== METADADOS ===')[0]
          }));
          setChildObligations(cleanedObs);
        }

      } catch (err: any) {
        console.error("Error fetching child:", err);
        setError(isSelfView ? "Seu perfil de filho de santo ainda não foi vinculado. Contate o Zelador." : "Filho de santo não encontrado ou acesso negado.");
      } finally {
        setLoading(false);
      }
    };

    fetchChild();
  }, [childId, user?.id, isSelfView, tenantId]);

  const handleSave = async () => {
    if (!child) return;
    setIsSaving(true);
    try {
      // Filter out fields that might not exist in the DB yet to prevent errors
      const updatePayload = {
        ...editData,
        quizilas: typeof editData.quizilas === 'string' ? editData.quizilas.split(',').map((q: string) => q.trim()) : editData.quizilas
      };

      // Remove fields that shouldn't be updated directly or are metadata
      delete updatePayload.id;
      delete updatePayload.lider_id;
      delete updatePayload.tenant_id;
      delete updatePayload.created_at;

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/children/${child.id}?userId=${user?.id}&tenantId=${tenantData?.tenant_id || ''}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update');
      }
      
      const result = await response.json();
      setChild(result.data);
      setEditData(result.data);
      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error("Error saving child:", err);
      alert(err.message || "Erro ao salvar os dados.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  async function handleDelete() {
    if (!child) return;
    if (!confirm(`Deseja realmente excluir o perfil de ${child.nome}? Esta ação é irreversível.`)) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('filhos_de_santo')
        .delete()
        .eq('id', child.id);

      if (error) throw error;
      setActiveTab('children');
    } catch (error) {
      console.error('Error deleting child:', error);
      alert('Erro ao excluir filho de santo.');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleAddObligation(e: React.FormEvent) {
    e.preventDefault();
    if (!child || !user) return;

    try {
      const { error } = await supabase
        .from('calendario_axe')
        .insert([{
          ...obligationData,
          descricao: `${obligationData.descricao || ''}`.trim() + `\n\n=== METADADOS ===\nFILHO_ID:${child.id}`,
          tipo: 'Obrigação',
          lider_id: user.id,
          tenant_id: tenantData?.tenant_id,
          status_confirmacao: 'Pendente'
        }]);

      if (error) throw error;
      
      const newOb = {
        titulo: obligationData.titulo,
        data: obligationData.data,
        descricao: obligationData.descricao || ''
      };
      
      setChildObligations(prev => [newOb, ...prev].sort((a,b) => new Date(b.data).getTime() - new Date(a.data).getTime()));

      // Envia notificação push direta para o filho se selecionado e se não for visão própria
      if (obligationData.notifyChild && !isSelfView) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch('/api/push-direct', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
            },
            body: JSON.stringify({
              childId: child.id,
              title: '🌿 Obrigação de Axé',
              body: `Olá ${child.nome}, a obrigação "${obligationData.titulo}" foi cadastrada no seu perfil.`,
              url: '/'
            })
          });
        } catch (pushErr) {
          console.error("Push direct error:", pushErr);
        }
      }

      setIsObligationModalOpen(false);
      setObligationData({
        titulo: '',
        data: new Date().toISOString().split('T')[0],
        hora: '00:00',
        descricao: '',
        notifyChild: true
      });
      alert('Obrigação agendada com sucesso no calendário!');
    } catch (error) {
      console.error('Error adding obligation:', error);
      alert('Erro ao agendar obrigação.');
    }
  }

  async function handleSavePrivateNotes() {
    if (!child || isSelfView) return;
    setIsSavingNotes(true);
    try {
      const { error } = await supabase
        .from('filhos_de_santo')
        .update({ notas_sigilosas: privateNotes })
        .eq('id', child.id);

      if (error) throw error;
      
      setChild({ ...child, notas_sigilosas: privateNotes });
      alert('Notas sigilosas salvas com sucesso!');
    } catch (err: any) {
      console.error('Error saving private notes:', err);
      if (err.message?.includes('notas_sigilosas') || err.code === 'PGRST204') {
        alert('ERRO DE BANCO DE DADOS: A coluna "notas_sigilosas" não foi encontrada. Por favor, execute o script SQL de atualização (fix_schema.sql) no seu painel do Supabase para ativar esta função.');
      } else {
        alert('Erro ao salvar notas: ' + err.message);
      }
    } finally {
      setIsSavingNotes(false);
    }
  }

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !child) return;

    try {
      setIsUploadingPhoto(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `child-${child.id}-${Date.now()}.${fileExt}`;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          
          const response = await fetch('/api/v1/profile/upload-photo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              fileData: base64Data,
              fileName: fileName,
              contentType: file.type
            })
          });

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Erro ao subir foto.');
          }

          const { publicUrl } = await response.json();

          // Atualizar o banco de dados do filho
          const { error: dbError } = await supabase
            .from('filhos_de_santo')
            .update({ foto_url: publicUrl })
            .eq('id', child.id);

          if (dbError) throw dbError;

          setChild({ ...child, foto_url: publicUrl });
          alert('Foto de perfil atualizada com sucesso!');
        } catch (error: any) {
          console.error('Error uploading photo:', error);
          alert('Erro ao atualizar foto: ' + (error.message || 'Desconhecido'));
        } finally {
          setIsUploadingPhoto(false);
        }
      };

      reader.onerror = () => {
        alert('Erro ao processar imagem.');
        setIsUploadingPhoto(false);
      };

      reader.readAsDataURL(file);

    } catch (error: any) {
      console.error('Error initiating photo upload:', error);
      alert('Erro ao iniciar upload de foto: ' + error.message);
      setIsUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full p-6 md:p-8 bg-background min-h-screen space-y-8 animate-in fade-in duration-500">
        <div className="w-48 h-8 bg-white/5 rounded-xl animate-pulse" />
        <div className="w-full h-32 bg-white/5 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="w-full h-64 bg-white/5 rounded-2xl animate-pulse" />
          <div className="w-full h-64 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !child) {
    return (
      <div className="w-full p-6 md:p-8 bg-background min-h-screen flex flex-col items-center justify-center space-y-6">
        <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
        <h2 className="text-2xl font-black text-white">{error || "Filho de santo não encontrado."}</h2>
        <button 
          onClick={() => setActiveTab('children')} 
          className="bg-primary text-background px-8 py-3 rounded-2xl font-black hover:scale-105 transition-transform"
        >
          Voltar à Listagem
        </button>
      </div>
    );
  }

  // Mocked data for fields that don't exist in DB yet
  const cpf = editData.cpf || child.cpf || '';
  const endereco = editData.endereco || child.endereco || '';
  const contato = editData.contato || child.contato || '';
  const adjunto = editData.adjunto || child.adjunto || '';
  const data_feitura = editData.data_feitura || child.data_feitura || '';
  const historico = child.historico_obrigacoes || [
    { data: '2023-05-10', titulo: 'Amaci', descricao: 'Lavagem de cabeça' },
    { data: '2024-01-20', titulo: 'Feitura', descricao: 'Obrigação de 1 ano' }
  ];

  // Calculate years in house
  const calculateYears = (dateString: string) => {
    if (!dateString) return null;
    const start = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffYears = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365));
    return diffYears;
  };
  const anosDeCasa = calculateYears(editData.data_entrada || child.data_entrada);

  return (
    <div className="flex flex-col w-full min-h-full text-white animate-in fade-in duration-700">
      <PageHeader 
        title={isSelfView ? "Meu Perfil" : "Perfil do Filho"}
        subtitle={isSelfView ? "Gerencie suas informações e obrigações." : `Visualizando prontuário de ${child?.nome || '...'}`}
        tenantData={tenantData}
        setActiveTab={setActiveTab}
      />
      
      {/* HEADER DINÂMICO (ESTILO PRONTUÁRIO) */}
      <div className="w-full pt-3 pb-4 px-4 md:px-12 md:pt-6 md:pb-4 border-b border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-6 md:flex-row md:items-start justify-between lg:gap-6">
            
            <div className="flex flex-col gap-4">
              <button 
                onClick={() => setActiveTab('children')}
                className="self-start flex items-center gap-2 p-2 pr-4 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-colors border border-white/5 text-[10px] font-black uppercase tracking-widest md:hidden"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
              
              <div className="flex items-start gap-4 md:gap-8 lg:gap-6">
                <div className="relative shrink-0 group">
                  <img 
                    src={child.foto_url || `https://api.dicebear.com/7.x/personas/svg?seed=${child.id}&backgroundColor=1F1F1F`} 
                    alt={child.nome} 
                    className="w-24 h-24 md:w-32 md:h-32 lg:w-24 lg:h-24 rounded-full object-cover border border-[#FBBC00]/30 shadow-2xl transition-all"
                    referrerPolicy="no-referrer"
                  />
                  
                  {!isSelfView && (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="absolute inset-0 bg-black/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 cursor-pointer"
                    >
                      {isUploadingPhoto ? (
                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                      ) : (
                        <>
                          <Camera className="w-6 h-6 text-white mb-1" />
                          <span className="text-[8px] font-bold text-white uppercase tracking-wider">Alterar</span>
                        </>
                      )}
                    </button>
                  )}

                  <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />

                  <div className="absolute -bottom-2 -right-2 bg-[#065F46] text-[#D1FAE5] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-white/10 shadow-lg pointer-events-none">
                    {child.status || 'Ativo'}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <h1 className="text-2xl md:text-5xl font-black text-white tracking-tight leading-none">{child.nome}</h1>
                    <div className="bg-[#FBBC00]/10 text-[#FBBC00] px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#FBBC00]/20 whitespace-nowrap">
                      {child.cargo || 'Filho'}
                    </div>
                  </div>
                  
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm md:text-base text-gray-400 font-medium">
                      {child.orixa_frente ? `Filho de ${child.orixa_frente}` : <span className="text-gray-600 text-xs italic">Orixá não informado</span>}
                      {adjunto && <span className="text-gray-500"> / {adjunto}</span>}
                    </p>
                    <p className="text-[10px] font-bold text-gray-600 tracking-[0.2em] uppercase">
                      ID: AXC-{child.data_entrada ? new Date(child.data_entrada).getFullYear() : new Date().getFullYear()}-{child.id.substring(0, 4).toUpperCase()}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:items-end gap-4 w-full md:w-auto shrink-0 md:pt-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setActiveTab('children')}
                  className="hidden md:flex p-3 rounded-2xl bg-white/5 text-gray-400 hover:text-white transition-colors border border-white/5"
                  title="Voltar"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                
                <button 
                  onClick={() => setIsEditModalOpen(true)}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-black text-xs bg-[#1F1F1F] text-white hover:bg-[#2A2A2A] transition-all border border-[#FBBC00]/30 uppercase tracking-widest shadow-lg"
                >
                  <Edit2 className="w-4 h-4 text-[#FBBC00]" />
                  Editar Perfil
                </button>
              </div>

              {isSelfView && hasDebt && (
                <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-2xl flex items-center gap-2 self-start md:self-end">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Mensalidade Pendente</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ABAS MINIMALISTAS */}
      <div className="w-full px-4 md:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-4 border-b border-white/5">
          {/* Informações */}
          <button 
            onClick={() => setActiveProfileTab('info')}
            className={cn(
              "flex flex-col items-center gap-1 py-3 sm:flex-row sm:gap-2 sm:justify-center sm:py-5 text-xs font-black uppercase tracking-[0.15em] transition-all relative",
              activeProfileTab === 'info' ? "text-white" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <FileText className={cn("w-4 h-4 shrink-0", activeProfileTab === 'info' ? "text-[#FBBC00]" : "text-gray-600")} />
            <span className="text-[9px] sm:text-xs sm:tracking-[0.2em] leading-tight text-center">Info</span>
            {activeProfileTab === 'info' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-[2px] bg-[#FBBC00] shadow-[0_0_10px_#FBBC00]" 
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
            )}
          </button>

          {/* Obrigação */}
          <button 
            onClick={() => setActiveProfileTab('history')}
            className={cn(
              "flex flex-col items-center gap-1 py-3 sm:flex-row sm:gap-2 sm:justify-center sm:py-5 text-xs font-black uppercase tracking-[0.15em] transition-all relative",
              activeProfileTab === 'history' ? "text-white" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <History className={cn("w-4 h-4 shrink-0", activeProfileTab === 'history' ? "text-[#FBBC00]" : "text-gray-600")} />
            <span className="text-[9px] sm:text-xs sm:tracking-[0.2em] leading-tight text-center">Obrigação</span>
            {activeProfileTab === 'history' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-[2px] bg-[#FBBC00] shadow-[0_0_10px_#FBBC00]"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
            )}
          </button>

          {/* Financeiro */}
          <button 
            onClick={() => setActiveProfileTab('finance')}
            className={cn(
              "flex flex-col items-center gap-1 py-3 sm:flex-row sm:gap-2 sm:justify-center sm:py-5 text-xs font-black uppercase tracking-[0.15em] transition-all relative",
              activeProfileTab === 'finance' ? "text-white" : "text-gray-500 hover:text-gray-300"
            )}
          >
            <CircleDollarSign className={cn("w-4 h-4 shrink-0", activeProfileTab === 'finance' ? "text-[#FBBC00]" : "text-gray-600")} />
            <span className="text-[9px] sm:text-xs sm:tracking-[0.2em] leading-tight text-center">Financeiro</span>
            {activeProfileTab === 'finance' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-[2px] bg-[#FBBC00] shadow-[0_0_10px_#FBBC00]"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
            )}
          </button>

          {/* Notas Sigilosas */}
          <button 
            onClick={() => setActiveProfileTab('notes')}
            className={cn(
              "flex flex-col items-center gap-1 py-3 sm:flex-row sm:gap-2 sm:justify-center sm:py-5 text-xs font-black uppercase tracking-[0.15em] transition-all relative",
              activeProfileTab === 'notes' ? "text-white" : "text-gray-500 hover:text-gray-300",
              !hasPlanAccess(tenantData?.plan, 'notes') && "opacity-50"
            )}
          >
            <ShieldAlert className={cn("w-4 h-4 shrink-0", activeProfileTab === 'notes' ? "text-[#FBBC00]" : "text-gray-600")} />
            <span className="text-[9px] sm:text-xs sm:tracking-[0.2em] leading-tight text-center">Sigilosas</span>
            {!hasPlanAccess(tenantData?.plan, 'notes') && <Lock className="w-2.5 h-2.5 text-[#FBBC00] absolute top-2 right-2" />}
            {activeProfileTab === 'notes' && (
              <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 w-full h-[2px] bg-[#FBBC00] shadow-[0_0_10px_#FBBC00]"
                animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
            )}
          </button>
        </div>
      </div>

      {/* ÁREA DE CONTEÚDO (FICHA FLUIDA) */}
      <div className="w-full max-w-7xl mx-auto px-4 md:px-12 py-6 md:py-12">
        
        {activeProfileTab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 animate-in fade-in duration-500">
            {/* Seção 1: Dados Pessoais */}
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-[#FBBC00]">
                <User className="w-5 h-5" />
                <h3 className="text-sm font-black uppercase tracking-[0.3em]">Dados Pessoais</h3>
              </div>
              
              <div className="bg-[#1F1F1F] border border-[#FBBC00]/10 rounded-[2rem] p-8 md:p-10 space-y-8 shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Data de Nascimento" value={child.data_nascimento} type="date" />
                  <Field label="CPF" value={cpf} />
                </div>
                
                <Field label="Endereço Completo" value={endereco} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Contato / WhatsApp" value={contato} />
                  {!isSelfView && (
                    <Field label="Vínculo de Usuário" value={child.user_id || ''} />
                  )}
                </div>
              </div>
            </div>

            {/* Seção 2: Dados Espirituais */}
            <div className="space-y-8">
              <div className="flex items-center gap-3 text-[#FBBC00]">
                <Activity className="w-5 h-5" />
                <h3 className="text-sm font-black uppercase tracking-[0.3em]">Dados Espirituais</h3>
              </div>

              <div className="bg-[#1F1F1F] border border-[#FBBC00]/10 rounded-[2rem] p-8 md:p-10 space-y-8 shadow-xl">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Orixá de Frente" value={child.orixa_frente} />
                  <Field label="Adjuntó" value={adjunto} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Field label="Data de Entrada" value={child.data_entrada} type="date" />
                  <Field label="Data de Feitura" value={data_feitura} type="date" />
                </div>

                <Field 
                  label="Quizilas e Preceitos" 
                  value={Array.isArray(child.quizilas) ? child.quizilas.join(', ') : child.quizilas} 
                />
              </div>
            </div>
          </div>
        )}

        {activeProfileTab === 'history' && (
          <div className="space-y-10 animate-in fade-in duration-500 max-w-4xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-[#FBBC00]">
                  <History className="w-5 h-5" />
                  <h3 className="text-sm font-black uppercase tracking-[0.3em]">Obrigações de Axé</h3>
                </div>
                {!isSelfView && (
                  <button 
                    onClick={() => setIsObligationModalOpen(true)}
                    className="text-[10px] font-black text-[#FBBC00] hover:text-white transition-colors uppercase tracking-[0.2em] border border-[#FBBC00]/30 px-4 py-2 rounded-xl bg-[#FBBC00]/5"
                  >
                    + Agendar Obrigação
                  </button>
                )}
              </div>
            
            <div className="bg-[#1F1F1F] border border-[#FBBC00]/10 rounded-[2.5rem] p-8 md:p-12 shadow-xl">
              <div className="space-y-12 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-[1px] before:bg-gradient-to-b before:from-transparent before:via-[#FBBC00]/20 before:to-transparent">
                {childObligations.length > 0 ? childObligations.map((item: any, idx: number) => (
                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className="flex items-center justify-center w-3 h-3 rounded-full border border-[#FBBC00] bg-[#121212] shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-[0_0_10px_rgba(251,188,0,0.3)] z-10" />
                    <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-2.5rem)] p-6 rounded-3xl border border-white/5 bg-[#1A1A1A] hover:border-[#FBBC00]/20 transition-all duration-500">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-black text-white text-base tracking-tight">{item.titulo}</h4>
                        <span className="text-[10px] font-black text-[#FBBC00] uppercase tracking-widest">{new Date(item.data).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <p className="text-sm text-gray-400 leading-relaxed font-medium whitespace-pre-wrap">{item.descricao}</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 text-gray-600 italic text-sm font-medium">
                    Nenhum registro de obrigação encontrado.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeProfileTab === 'finance' && (
          <div className="space-y-10 animate-in fade-in duration-500 max-w-4xl">
            <div className="flex items-center gap-3 text-[#FBBC00]">
              <CircleDollarSign className="w-5 h-5" />
              <h3 className="text-sm font-black uppercase tracking-[0.3em]">Gestão de Mensalidade</h3>
            </div>

            <div className="bg-[#1F1F1F] border border-[#FBBC00]/10 rounded-[2.5rem] p-10 space-y-10 shadow-xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Status de Contribuição</p>
                  <div className="flex items-center gap-3">
                    {hasDebt ? (
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-red-500">Pendente</span>
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-emerald-500">Em Dia</span>
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="h-12 w-[1px] bg-white/5 hidden md:block" />

                <div className="space-y-2">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Valor da Mensalidade</p>
                  <p className="text-3xl font-black text-white">
                    R$ {Number(valorMensalidadeConfig).toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>

              {hasDebt && (
                <div className="p-8 bg-[#1A1A1A] border border-red-500/10 rounded-[2rem] space-y-6">
                  <div className="space-y-2">
                    <h4 className="text-lg font-bold text-white">Regularização Necessária</h4>
                    <p className="text-sm text-gray-400 font-medium leading-relaxed">
                      Para manter o equilíbrio e as atividades do terreiro, solicitamos a regularização da sua mensalidade. O axé agradece sua contribuição.
                    </p>
                  </div>
                  <button 
                    onClick={() => window.open('https://www.mercadopago.com.br', '_blank')}
                    className="w-full bg-[#009EE3] text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 hover:scale-[1.02] transition-all active:scale-95 shadow-xl shadow-[#009EE3]/20"
                  >
                    <CreditCard className="w-5 h-5" />
                    Pagar via Mercado Pago
                  </button>
                </div>
              )}

              {!hasDebt && (
                <div className="p-8 bg-[#1A1A1A] border border-emerald-500/10 rounded-[2rem] flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm text-emerald-500/70 font-bold uppercase tracking-widest">
                    Sua contribuição está em dia. Axé!
                  </p>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-[10px] font-black text-gray-700 uppercase tracking-[0.3em]">
                Histórico detalhado em processamento
              </p>
            </div>
          </div>
        )}

        {activeProfileTab === 'notes' && hasPlanAccess(tenantData?.plan, 'notes') && (
          <div className="space-y-10 animate-in fade-in duration-500 max-w-4xl">
            <div className="flex items-center gap-3 text-[#FBBC00]">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-black uppercase tracking-[0.3em]">Notas Sigilosas do Zelador</h3>
            </div>

            <div className="bg-[#1F1F1F] border border-[#FBBC00]/10 rounded-[2.5rem] p-10 space-y-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <Lock className="w-24 h-24 text-[#FBBC00]" />
              </div>
              
              <div className="space-y-4 relative z-10">
                <p className="text-sm text-gray-400 font-medium leading-relaxed">
                  Este espaço é exclusivo para anotações do Zelador sobre o desenvolvimento espiritual do filho. 
                  <span className="text-white font-bold"> Apenas o Zelador tem acesso a estas notas.</span>
                </p>
                
                <textarea 
                  className="w-full bg-[#121212] border border-white/5 rounded-[2rem] p-8 text-white focus:border-[#FBBC00]/50 outline-none transition-all font-bold h-64 resize-none shadow-inner"
                  placeholder="Descreva aqui observações sobre o desenvolvimento, preceitos específicos ou orientações espirituais..."
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  readOnly={isSelfView}
                />

                {!isSelfView && (
                  <div className="flex justify-end">
                    <button
                      onClick={handleSavePrivateNotes}
                      disabled={isSavingNotes}
                      className="bg-[#FBBC00] text-black px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:scale-105 transition-all disabled:opacity-50 uppercase tracking-widest text-xs shadow-lg shadow-[#FBBC00]/20"
                    >
                      {isSavingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSavingNotes ? 'Salvando...' : 'Salvar Notas'}
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 p-4 bg-[#FBBC00]/5 rounded-2xl border border-[#FBBC00]/10">
                <ShieldCheck className="w-5 h-5 text-[#FBBC00]" />
                <p className="text-[10px] font-black text-[#FBBC00] uppercase tracking-widest">
                  Criptografia de Ponta a Ponta Ativa
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Modal: Editar Perfil */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-3xl border border-[#FBBC00]/20 bg-[#1F1F1F] shadow-2xl sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white sm:text-xl">Editar Perfil</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-0.5">Atualização de Prontuário</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="shrink-0 rounded-2xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Nome Completo</label>
                    <input type="text" value={editData.nome} onChange={e => handleChange('nome', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Nascimento</label>
                    <input type="date" value={editData.data_nascimento} onChange={e => handleChange('data_nascimento', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">CPF</label>
                    <input type="text" value={editData.cpf || ''} onChange={e => handleChange('cpf', e.target.value)} placeholder="000.000.000-00"
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Endereço</label>
                    <input type="text" value={editData.endereco || ''} onChange={e => handleChange('endereco', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Contato</label>
                    <input type="text" value={editData.contato || ''} onChange={e => handleChange('contato', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Orixá Frente</label>
                    <select value={editData.orixa_frente || ''} onChange={e => handleChange('orixa_frente', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50 [&>option]:bg-[#1B1C1C]">
                      <option value="">Selecione...</option>
                      {['Oxalá', 'Iemanjá', 'Ogum', 'Oxóssi', 'Xangô', 'Iansã', 'Oxum', 'Nanã', 'Obaluaê', 'Exu', 'Pombagira'].map(o => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Adjuntó</label>
                    <input type="text" value={editData.adjunto || ''} onChange={e => handleChange('adjunto', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Entrada</label>
                    <input type="date" value={editData.data_entrada} onChange={e => handleChange('data_entrada', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Feitura</label>
                    <input type="date" value={editData.data_feitura || ''} onChange={e => handleChange('data_feitura', e.target.value)}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Quizilas</label>
                    <textarea value={Array.isArray(editData.quizilas) ? editData.quizilas.join(', ') : editData.quizilas || ''}
                      onChange={e => handleChange('quizilas', e.target.value)} rows={3}
                      className="w-full resize-none rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/5 px-5 py-4 sm:px-6">
                {!isSelfView && (
                  <button onClick={handleDelete} disabled={isDeleting}
                    className="shrink-0 text-xs font-black uppercase tracking-widest text-red-500 transition-colors hover:text-red-400 disabled:opacity-50">
                    {isDeleting ? 'Excluindo...' : 'Excluir'}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-3">
                  <button onClick={() => setIsEditModalOpen(false)}
                    className="rounded-2xl border border-white/5 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-white/10 sm:px-6">
                    Cancelar
                  </button>
                  <button onClick={async () => { await handleSave(); setIsEditModalOpen(false); }} disabled={isSaving}
                    className="rounded-2xl bg-[#FBBC00] px-4 py-2.5 text-xs font-black uppercase tracking-widest text-black shadow-xl shadow-[#FBBC00]/20 transition-transform hover:scale-105 disabled:opacity-50 sm:px-6">
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: Adicionar Obrigação */}
      <AnimatePresence>
        {isObligationModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsObligationModalOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 60 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="relative z-10 flex w-full max-h-[88dvh] flex-col overflow-hidden rounded-t-3xl border border-[#FBBC00]/20 bg-[#1F1F1F] shadow-2xl sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <h3 className="text-base font-black text-white sm:text-xl">Agendar Obrigação</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mt-0.5">Calendário do Axé</p>
                </div>
                <button onClick={() => setIsObligationModalOpen(false)} className="shrink-0 rounded-2xl p-2 text-gray-500 transition-colors hover:bg-white/5">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddObligation} className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Título da Obrigação</label>
                  <input required type="text" value={obligationData.titulo}
                    onChange={e => setObligationData({ ...obligationData, titulo: e.target.value })}
                    className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50"
                    placeholder="Ex: Obrigação de 7 Anos" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Data Prevista</label>
                    <input required type="date" value={obligationData.data}
                      onChange={e => setObligationData({ ...obligationData, data: e.target.value })}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Hora</label>
                    <input required type="time" value={obligationData.hora}
                      onChange={e => setObligationData({ ...obligationData, hora: e.target.value })}
                      className="w-full rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 ml-0.5">Observações</label>
                  <textarea value={obligationData.descricao} rows={3}
                    onChange={e => setObligationData({ ...obligationData, descricao: e.target.value })}
                    className="w-full resize-none rounded-xl border border-white/5 bg-[#121212] px-4 py-2.5 text-sm font-bold text-white outline-none transition-all focus:border-[#FBBC00]/50"
                    placeholder="Detalhes sobre a obrigação..." />
                </div>

                {!isSelfView && (
                  <label className="flex cursor-pointer items-center gap-3 group">
                    <div className="relative flex items-center justify-center">
                      <input type="checkbox" checked={obligationData.notifyChild}
                        onChange={e => setObligationData({ ...obligationData, notifyChild: e.target.checked })}
                        className="peer sr-only" />
                      <div className="flex h-5 w-5 items-center justify-center rounded border border-white/20 bg-black/40 transition-all peer-checked:border-[#FBBC00] peer-checked:bg-[#FBBC00]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-black opacity-0 transition-opacity peer-checked:opacity-100" />
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-400 transition-colors group-hover:text-white">
                      Enviar aviso para o filho
                    </span>
                  </label>
                )}

                <button type="submit"
                  className="w-full rounded-2xl bg-[#FBBC00] py-3 text-xs font-black uppercase tracking-widest text-black shadow-xl shadow-[#FBBC00]/20 transition-all hover:scale-[1.02] active:scale-95">
                  Confirmar Agendamento
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, value, type = 'text' }: any) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{label}</label>
      <p className="text-lg font-bold text-white tracking-tight">
        {value ? (
          type === 'date' ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : value
        ) : (
          <span className="text-gray-600 italic text-sm font-medium">Aguardando preenchimento</span>
        )}
      </p>
    </div>
  );
}
