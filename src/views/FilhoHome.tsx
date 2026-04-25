import React, { useState, useEffect } from 'react';
import { 
  User, 
  DollarSign, 
  Bell, 
  Calendar, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Loader2,
  Info
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FilhoHomeProps {
  user: any;
  tenantData?: any;
  setActiveTab: (tab: string) => void;
}

export default function FilhoHome({ user, tenantData, setActiveTab }: FilhoHomeProps) {
  const [child, setChild] = useState<any>(null);
  const [financialStatus, setFinancialStatus] = useState<'pago' | 'pendente' | 'vencido' | 'loading'>('loading');
  const [notices, setNotices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tenantId = tenantData?.tenant_id;
        if (!user?.id) return;

        // 1. Fetch Child Profile - Busca robusta por user_id ou e-mail como fallback
        let { data: childData, error: childError } = await supabase
          .from('filhos_de_santo')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!childData && user.email) {
          console.log("[FILHO-HOME] Vínculo por user_id falhou, tentando por e-mail...");
          const { data: emailChild } = await supabase
            .from('filhos_de_santo')
            .select('*')
            .eq('email', user.email)
            .maybeSingle();
          childData = emailChild;
          
          // Se achou por e-mail, atualiza o user_id para futuras sessões
          if (emailChild && !emailChild.user_id) {
             await supabase.from('filhos_de_santo').update({ user_id: user.id }).eq('id', emailChild.id);
          }
        }

        if (childError) throw childError;
        setChild(childData);

        if (childData) {
          // 2. Fetch Financial Status (latest monthly)
          const { data: finData } = await supabase
            .from('financeiro')
            .select('*')
            .eq('filho_id', childData.id)
            .order('data_vencimento', { ascending: false })
            .limit(1);
          
          if (finData && finData.length > 0) {
            setFinancialStatus(finData[0].status as any);
          } else {
            setFinancialStatus('pago');
          }

          // 3. Fetch Recent Notices
          const { data: noticesData } = await supabase
            .from('mural_avisos')
            .select('*')
            .eq('tenant_id', tenantId || childData.tenant_id)
            .order('data_publicacao', { ascending: false })
            .limit(2);
          
          setNotices(noticesData || []);
        }
      } catch (err) {
        console.error("Error fetching home data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, user?.email, tenantData?.tenant_id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  // Se mesmo com fallback não achar, usamos os dados do Auth Metadata que o servidor gravou
  const displayChild = child || { 
    nome: user?.user_metadata?.nome || user?.user_metadata?.full_name || 'Filho de Santo', 
    foto_url: user?.user_metadata?.foto_url || null 
  };

  // Tratamento para evitar mostrar IDs técnicos no nome
  const isIdTechnical = typeof displayChild.nome === 'string' && /^f_[a-f0-9-]{8,}$/i.test(displayChild.nome);
  const displayNameToRender = isIdTechnical ? (user?.user_metadata?.nome || 'Filho de Santo') : displayChild.nome;

  return (
    <div className="flex-1 p-4 lg:p-10 space-y-8 overflow-y-auto custom-scrollbar relative z-10">
      {/* 1. Header Profile Card (Estilo Foto 1) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group w-full cursor-pointer"
        onClick={() => setActiveTab('profile')}
      >
        <div className="bg-black/40 backdrop-blur-3xl border border-yellow-500/30 rounded-[2.5rem] p-8 sm:p-10 shadow-[0_0_50px_rgba(234,179,8,0.1)]">
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative">
              <div className="w-32 h-32 rounded-full border-4 border-yellow-500/40 p-1 bg-black/40 shadow-2xl overflow-hidden ring-8 ring-yellow-500/5">
                <img 
                  src={displayChild.foto_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayNameToRender)}`} 
                  alt={displayNameToRender}
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayNameToRender)}`;
                  }}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 w-10 h-10 bg-yellow-500 rounded-full border-4 border-black flex items-center justify-center shadow-lg">
                <CheckCircle2 className="w-5 h-5 text-black" strokeWidth={3} />
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left">
              <p className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] mb-2 drop-shadow-md">
                {tenantData?.nome || 'TERREIRO PREVIEW'}
              </p>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight uppercase mb-4 drop-shadow-lg">
                {displayNameToRender}
              </h1>
              <span className="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest backdrop-blur-md shadow-inner">
                FILHO DE SANTO
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-8">
        {/* 2. Mensalidade Card (Estilo Foto 1) */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <h2 className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] ml-4 drop-shadow-sm">Minha Mensalidade</h2>
          <button 
            onClick={() => setActiveTab('financial')}
            className="w-full bg-black/40 backdrop-blur-2xl border border-white/5 p-10 rounded-[2.5rem] transition-all hover:bg-black/60 group text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between relative z-10">
              <div>
                <h3 className={cn(
                  "text-4xl font-black uppercase mb-2 tracking-tighter",
                  financialStatus === 'pago' ? "text-white" : "text-red-500"
                )}>
                  {financialStatus === 'loading' ? 'Verificando...' : financialStatus === 'pago' ? 'Em Dia' : 'Em Aberto'}
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest opacity-60">
                  {financialStatus === 'loading' ? 'Carregando status...' : 'Clique para ver detalhes do seu financeiro'}
                </p>
              </div>
              <div className={cn(
                "w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-500 group-hover:scale-110 group-hover:rotate-6",
                financialStatus === 'pago' ? "bg-emerald-500/10 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]" : "bg-red-500/10 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]"
              )}>
                {financialStatus === 'pago' ? <CheckCircle2 className="w-8 h-8" /> : <Clock className="w-8 h-8" />}
              </div>
            </div>
            {/* Glossy overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
          </button>
        </motion.div>

        {/* 3. Mural Card (Estilo Foto 1) */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between px-4">
            <h2 className="text-[10px] font-black text-yellow-500 uppercase tracking-[0.4em] drop-shadow-sm">Mural do Terreiro</h2>
            <button 
              onClick={() => setActiveTab('mural')}
              className="text-[10px] font-black text-white/40 uppercase tracking-widest hover:text-yellow-500 flex items-center gap-2 transition-colors"
            >
              Últimos avisos <ArrowRight className="w-3 h-3 text-yellow-500" />
            </button>
          </div>

          <div className="bg-black/40 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] p-10 min-h-[200px] flex flex-col justify-center">
            {notices.length > 0 ? (
              <div className="space-y-8">
                {notices.map((notice) => (
                  <div key={notice.id} className="flex gap-6 group cursor-pointer" onClick={() => setActiveTab('mural')}>
                    <div className="w-1.5 h-14 bg-yellow-500/20 rounded-full group-hover:bg-yellow-500 transition-all duration-300 group-hover:scale-y-110 shadow-lg shadow-yellow-500/5" />
                    <div>
                      <h4 className="text-lg font-black text-white group-hover:text-yellow-500 transition-colors line-clamp-1 uppercase tracking-tight">{notice.titulo}</h4>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1 opacity-50">{format(new Date(notice.data_publicacao), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center space-y-6 py-6 opacity-40">
                <div className="w-20 h-20 bg-white/5 rounded-[2rem] flex items-center justify-center ring-1 ring-white/10">
                  <Info className="w-10 h-10 text-white/20" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white uppercase tracking-widest">Nenhum aviso por aqui ainda</h4>
                  <p className="text-[10px] text-white/40 font-bold mt-2 uppercase tracking-[0.2em] max-w-xs mx-auto">
                    Quando o zelador publicar avisos no mural, eles aparecerão neste feed.
                  </p>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Footer Branding (Estilo Foto 1) */}
      <div className="pt-20 pb-10 text-center">
        <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.6em] flex items-center justify-center gap-6">
          <span className="w-12 h-[1px] bg-white/10" />
          AXÉCLOUD — PORTAL DO FILHO DE SANTO
          <span className="w-12 h-[1px] bg-white/10" />
        </div>
      </div>
    </div>
  );
}
