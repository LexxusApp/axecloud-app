import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Wallet, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Zap, 
  Loader2, 
  Receipt,
  ArrowRight,
  CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import PixPaymentModal, { PixConfig } from '../components/PixPaymentModal';
import PageHeader from '../components/PageHeader';
import { format, setDate, addMonths, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MensalidadeFilhoProps {
  user: any;
  tenantData?: any;
  setActiveTab: (tab: string) => void;
}

const MENSALIDADE_VALOR_PADRAO = 89.9;

export default function MensalidadeFilho({ user, tenantData, setActiveTab }: MensalidadeFilhoProps) {
  const [filho, setFilho] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mensalidades, setMensalidades] = useState<any[]>([]);
  const [pendingMensalidade, setPendingMensalidade] = useState<any>(null);
  const [valorMensalidadeConfig, setValorMensalidadeConfig] = useState(MENSALIDADE_VALOR_PADRAO);
  
  const [pixConfig, setPixConfig] = useState<PixConfig | null>(null);
  const [diaVencimento, setDiaVencimento] = useState<number>(10);
  const [loadingPix, setLoadingPix] = useState(false);
  const [pixFetched, setPixFetched] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);

  const tenantId = tenantData?.tenant_id;
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !tenantId) {
      setLoading(true);
      return;
    }
    void fetchData();
  }, [userId, tenantId]);

  async function fetchData() {
    if (!userId || !tenantId) return;

    try {
      setLoading(true);
      // 1. Buscar Perfil do Filho
      let { data: childData, error: childError } = await supabase
        .from('filhos_de_santo')
        .select('id, nome, tenant_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!childData && user?.email) {
        const byEmail = await supabase
          .from('filhos_de_santo')
          .select('id, nome, tenant_id')
          .eq('email', user.email)
          .maybeSingle();
        childData = byEmail.data;
        childError = byEmail.error;
      }

      if (childError) throw childError;
      
      setFilho(childData);

      // Buscar Configurações de Pix e Valor do Zelador via API (bypass RLS)
      try {
        const pixRes = await fetch(`/api/v1/financial/pix-config?tenantId=${encodeURIComponent(tenantId)}`);
        if (!pixRes.ok) {
          const body = await pixRes.text().catch(() => '');
          throw new Error(`Pix config HTTP ${pixRes.status}: ${body}`);
        }

        const { data: pixData } = await pixRes.json();
        if (pixData) {
          const configuredValue = Number(pixData.valor_mensalidade);
          if (!Number.isNaN(configuredValue) && configuredValue > 0) {
            setValorMensalidadeConfig(configuredValue);
            setPendingMensalidade({
              id: `mensalidade-${childData?.id || userId}`,
              descricao: 'Mensalidade do terreiro',
              valor: configuredValue,
              status: 'pendente',
            });
          }
          if (pixData.dia_vencimento) setDiaVencimento(Number(pixData.dia_vencimento));
          if (pixData.chave_pix) {
            setPixConfig({
              chave_pix: pixData.chave_pix,
              tipo_chave: pixData.tipo_chave,
              nome_beneficiario: pixData.nome_beneficiario,
              cidade: 'BRASIL'
            });
          } else {
            setPixConfig(null);
          }
        } else {
          setPixConfig(null);
        }
      } catch (err) {
        console.error('Erro ao carregar configuração Pix do filho:', err);
        setPixConfig(null);
      } finally {
        setPixFetched(true);
      }

      // Histórico de mensalidades: coluna filho_id não existe em financeiro;
      // deixa lista vazia até integração completa de mensalidades individuais.
      setMensalidades([]);
    } catch (error) {
      console.error('Erro ao carregar mensalidade do filho:', error);
    } finally {
      setLoading(false);
    }
  }

  const ensurePixConfig = async () => {
    if (pixFetched || !tenantId) return;
    setLoadingPix(true);
    try {
      const res = await fetch(`/api/v1/financial/pix-config?tenantId=${encodeURIComponent(tenantId)}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Pix config HTTP ${res.status}: ${body}`);
      }
      const { data } = await res.json();
      if (data?.chave_pix) {
        setPixConfig({
          chave_pix: data.chave_pix,
          tipo_chave: data.tipo_chave,
          nome_beneficiario: data.nome_beneficiario,
          cidade: 'BRASIL'
        });
        if (data.dia_vencimento) setDiaVencimento(Number(data.dia_vencimento));
      } else {
        setPixConfig(null);
      }
    } catch (err) {
      console.error('Error fetching pix config:', err);
    } finally {
      setLoadingPix(false);
      setPixFetched(true);
    }
  };

  const openPixModal = async () => {
    setPixModalOpen(true);
    await ensurePixConfig();
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-20">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  const pixNotConfigured = pixFetched && !loadingPix && !pixConfig?.chave_pix;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title={<>Minhas <span className="text-primary">Mensalidades</span></>}
        subtitle="Controle suas contribuições com o terreiro."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
      />

      <div className="flex-1 px-4 md:px-6 lg:px-10 pb-20 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-700">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Payment Section */}
          <div className="lg:col-span-8 space-y-8">
            {/* Status Card */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "relative overflow-hidden rounded-[2.5rem] border p-8 shadow-2xl",
                pendingMensalidade 
                  ? "border-primary/20 bg-gradient-to-br from-primary/10 via-card to-background"
                  : "border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card to-background"
              )}
            >
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-4">
                  <div className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest",
                    pendingMensalidade ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    {pendingMensalidade ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {pendingMensalidade ? "Contribuição Pendente" : "Contribuição em Dia"}
                  </div>
                  <h3 className="text-3xl font-black text-white">
                    {pendingMensalidade 
                      ? `R$ ${Number(pendingMensalidade.valor).toFixed(2).replace('.', ',')}`
                      : "Mensalidade do mês quitada"}
                  </h3>
                  <p className="text-gray-400 font-medium max-w-sm">
                    {pendingMensalidade 
                      ? "A sua contribuição mensal ajuda a manter o axé da nossa casa. Clique no botão ao lado para realizar o pagamento via Pix."
                      : "Obrigado por sua dedicação! Sua mensalidade está em dia. Que os Orixás continuem te abençoando."}
                  </p>
                  {diaVencimento > 0 && (
                    <p className="text-[11px] font-black text-primary/80 uppercase tracking-widest flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      Vencimento: dia {diaVencimento} de cada mês
                    </p>
                  )}
                </div>

                {pendingMensalidade && (
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={openPixModal}
                      disabled={pixNotConfigured && pixFetched}
                      className={cn(
                        "px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all",
                        pixNotConfigured && pixFetched
                          ? "bg-white/5 text-gray-500 cursor-not-allowed"
                          : "bg-primary text-background hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
                      )}
                    >
                      <Zap className="w-5 h-5 fill-current" />
                      Visualizar QR Code Pix
                    </button>
                    {pixNotConfigured && (
                      <p className="text-[10px] text-amber-500 font-bold text-center uppercase tracking-wider">
                        Terreiro ainda não cadastrou chave Pix
                      </p>
                    )}
                  </div>
                )}
              </div>

              {pendingMensalidade && pixConfig && (
                <div className="mt-10 pt-8 border-t border-white/5 space-y-6">
                   <div className="flex items-center gap-2 text-primary">
                      <DollarSign className="w-5 h-5" />
                      <h4 className="font-black uppercase tracking-widest text-sm">Dados de Pagamento Direto</h4>
                   </div>
                   <div className="bg-black/40 rounded-3xl p-6 border border-white/5 flex flex-col md:flex-row items-center gap-8">
                      <div className="shrink-0 bg-white p-3 rounded-2xl">
                         {/* We will rely on the modal for the official QR, but we can hint it here or just open it */}
                         <div className="w-32 h-32 flex items-center justify-center text-background font-black text-xs text-center p-2 uppercase">
                            Clique no botão acima para ver o QR Code
                         </div>
                      </div>
                      <div className="flex-1 space-y-4">
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Favorecido</p>
                            <p className="text-white font-bold">{pixConfig.nome_beneficiario || 'Terreiro'}</p>
                         </div>
                         <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Chave Pix ({pixConfig.tipo_chave})</p>
                            <div className="flex items-center gap-3">
                               <code className="text-primary font-mono text-xs bg-primary/5 px-3 py-2 rounded-lg border border-primary/20 break-all">
                                  {pixConfig.chave_pix}
                               </code>
                               <button 
                                 onClick={() => {
                                   navigator.clipboard.writeText(pixConfig.chave_pix);
                                   alert('Chave Pix copiada!');
                                 }}
                                 className="p-2 hover:bg-white/5 rounded-lg text-primary transition-colors shrink-0"
                                 title="Copiar Chave"
                               >
                                 <Receipt className="w-4 h-4" />
                               </button>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              )}

              {/* Background Accent */}
              <div className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/3 w-64 h-64 bg-primary/10 blur-[100px] pointer-events-none" />
            </motion.div>

            {/* History Table */}
            <div className="space-y-6">
              <h4 className="text-xl font-black text-white flex items-center gap-3">
                <Receipt className="w-6 h-6 text-primary" />
                Histórico de Contribuições
              </h4>
              
              <div className="grid gap-4">
                {mensalidades.length > 0 ? (
                  mensalidades.map((item, idx) => (
                    <motion.div 
                      key={item.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="card-luxury p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-primary/20 transition-colors"
                    >
                      <div className="flex items-center gap-5">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg",
                          item.status === 'pago' ? "bg-emerald-500/10 text-emerald-500 shadow-emerald-500/5" : "bg-primary/10 text-primary shadow-primary/5"
                        )}>
                          {item.status === 'pago' ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="text-white font-bold">{item.descricao || 'Mensalidade'}</p>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                            {item.data ? format(new Date(item.data), "dd 'de' MMMM, yyyy", { locale: ptBR }) : 'Data não informada'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-10">
                        <div className="text-right">
                          <p className="text-lg font-black text-white">R$ {Number(item.valor).toFixed(2).replace('.', ',')}</p>
                          <p className={cn(
                            "text-[10px] font-black uppercase tracking-widest mt-0.5",
                            item.status === 'pago' ? "text-emerald-500" : "text-primary"
                          )}>
                            {item.status === 'pago' ? "Confirmado" : "Pendente"}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-700 group-hover:text-primary transition-colors group-hover:translate-x-1" />
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="card-luxury p-12 text-center space-y-4">
                    <Wallet className="w-12 h-12 text-gray-700 mx-auto" />
                    <p className="text-gray-500 font-medium italic">Nenhuma mensalidade registrada até o momento.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar / Info Section */}
          <div className="lg:col-span-4 space-y-8">
            <div className="card-luxury p-8 bg-gradient-to-br from-primary/5 to-transparent space-y-6">
              <h4 className="text-lg font-black text-white uppercase tracking-widest">Informações</h4>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white mb-1">Pagamento via Pix</p>
                    <p className="text-xs text-gray-400 font-medium leading-relaxed">O sistema gera um QR Code dinâmico para você pagar diretamente no app do seu banco. A baixa é realizada manualmente pelo zelador após a confirmação.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white mb-1">Manutenção do Axé</p>
                    <p className="text-xs text-gray-400 font-medium leading-relaxed">Sua contribuição é fundamental para o aluguel, luz, água e materiais de ritual da nossa casa.</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] text-center italic">
                  "Quem ajuda o terreiro, ajuda a si mesmo."
                </p>
              </div>
            </div>

            {/* Quick Action */}
            <button 
              onClick={() => setActiveTab('store')}
              className="w-full group p-6 rounded-[2rem] border border-white/5 bg-white/5 hover:bg-white/10 transition-all text-left flex items-center justify-between overflow-hidden relative"
            >
              <div className="relative z-10">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Loja do Axé</p>
                <p className="text-sm font-bold text-white">Precisa de velas ou guias?</p>
              </div>
              <DollarSign className="w-10 h-10 text-white/5 absolute right-4 top-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform" />
              <ArrowRight className="w-5 h-5 text-primary relative z-10 group-hover:translate-x-2 transition-transform" />
            </button>
          </div>

        </div>
      </div>

      <PixPaymentModal
        open={pixModalOpen}
        onClose={() => setPixModalOpen(false)}
        loading={loadingPix}
        pixConfig={pixConfig}
        valor={pendingMensalidade?.valor || valorMensalidadeConfig}
        descricao="Mensalidade Terreiro"
        txid={(filho?.id || user.id).slice(0, 16).replace(/-/g, '')}
        vencimento={(() => {
          const hoje = new Date();
          let venc = setDate(hoje, diaVencimento);
          if (isBefore(venc, hoje)) venc = setDate(addMonths(hoje, 1), diaVencimento);
          return format(venc, "dd/MM/yyyy");
        })()}
      />
    </div>
  );
}
