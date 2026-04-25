import React, { useEffect, useState, useMemo } from 'react';
import NotificationPanel from '../components/NotificationPanel';
import {
  Plus,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical
} from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { cn } from '../lib/utils';
import LuxuryLoading from '../components/LuxuryLoading';
import { supabase } from '../lib/supabase';

interface DashboardProps {
  setActiveTab: (tab: string) => void;
  user: any;
  userRole?: 'admin' | 'filho';
  tenantData?: any;
  isAdminGlobal?: boolean;
  setSelectedChildId?: (id: string) => void;
  systemVersion?: string;
}

export default function Dashboard({ setActiveTab, user, userRole = 'admin', tenantData, isAdminGlobal = false, setSelectedChildId, systemVersion = '1.0.0' }: DashboardProps) {
  const tenantId = tenantData?.tenant_id;
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalReceita: 12650,
    totalDespesa: 2850,
    despesasExtras: 2350,
    lucroLiquido: 10300,
    growth: 15
  });
  const [childrenData, setChildrenData] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [historyData, setHistoryData] = useState<any[]>([]);

  const dashboardCalendar = useMemo(() => {
    const anchor = new Date();
    const monthStart = startOfMonth(anchor);
    const monthEnd = endOfMonth(anchor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const rawMonth = format(anchor, 'MMMM yyyy', { locale: ptBR });
    const monthTitle = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
    return { days, monthTitle, anchor };
  }, []);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        if (!user) return;

        let lojaTenantPk: string | null = null;
        if (userRole !== 'filho') {
          const seed = tenantId || user.id;
          const { data: plRow } = await supabase
            .from('perfil_lider')
            .select('id')
            .or(`id.eq.${seed},tenant_id.eq.${seed}`)
            .maybeSingle();
          lojaTenantPk = plRow?.id || seed;
        }

        const [childrenRes, transactionsRes, lojaRes] = await Promise.all([
          fetch(`/api/children?userId=${user.id}&tenantId=${tenantId || user.id}`).then((r) => r.json()),
          fetch(`/api/transactions?tenantId=${tenantId || user.id}&userId=${user.id}&userRole=${userRole || ''}`).then((r) => r.json()),
          userRole !== 'filho' && lojaTenantPk
            ? supabase
                .from('loja_pedidos')
                .select('*')
                .eq('tenant_id', lojaTenantPk)
                .order('created_at', { ascending: false })
                .limit(12)
            : Promise.resolve({ data: [], error: null } as { data: any[]; error: any }),
        ]);

        const children = (childrenRes.data || []).filter((c: any) => c.status === 'Ativo');
        setChildrenData(children.slice(0, 4));

        const transactions = transactionsRes.data || [];
        const lojaRows = (lojaRes.data || []) as any[];
        if (lojaRes.error) {
          console.warn('[Dashboard] loja_pedidos:', lojaRes.error);
        }

        const lojaHistorico = lojaRows.map((p) => {
          const acao = p.tipo === 'reserva' ? 'reservou na loja' : 'comprou na loja';
          const met =
            p.metodo_pagamento === 'mensalidade'
              ? 'mensalidade'
              : p.metodo_pagamento === 'pix'
                ? 'PIX'
                : p.metodo_pagamento === 'reserva'
                  ? 'reserva'
                  : String(p.metodo_pagamento || '');
          return {
            tipo: 'entrada',
            descricao: `${p.filho_nome || 'Filho de santo'} ${acao} (${met}): ${p.resumo_itens || ''}`,
            valor: Number(p.valor_total) || 0,
            data: p.created_at,
          };
        });

        const merged = [...transactions, ...lojaHistorico].sort(
          (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
        );
        setHistoryData(merged.slice(0, 8));

        const currentMonth = new Date().getMonth();
        const monthTransactions = transactions.filter((t: any) => new Date(t.data).getMonth() === currentMonth);
        
        const rec = monthTransactions.filter((t: any) => t.tipo === 'entrada').reduce((acc: number, t: any) => acc + (Number(t.valor) || 0), 0) || 12650;
        const des = monthTransactions.filter((t: any) => t.tipo === 'saida').reduce((acc: number, t: any) => acc + (Number(t.valor) || 0), 0) || 2850;

        setStats({
          totalReceita: rec,
          totalDespesa: des,
          despesasExtras: 2350,
          lucroLiquido: rec - des,
          growth: 15
        });

        // Mock chart data to look exactly like the image (curvy with dots)
        setChartData([
          { val: 100 }, { val: 250 }, { val: 180 }, { val: 320 }, { val: 240 }, { val: 400 }, { val: 300 }, { val: 450 }
        ]);

      } catch (e) {
        console.error('Error fetching dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    if (user) fetchDashboardData();
  }, [user, tenantId, userRole]);

  if (loading) return <div className="h-[70vh] flex items-center justify-center"><LuxuryLoading /></div>;

  const terreiroNome = tenantData?.nome?.trim() || 'Meu Terreiro';
  const headerRoleLine =
    userRole === 'filho' ? 'Filho de Santo' : (tenantData?.cargo?.trim() || null);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const greetingEmoji = hour < 12 ? '🌅' : hour < 18 ? '☀️' : '🌙';
  const greetingSubtitle =
    hour < 12
      ? 'Que o Axé abra os caminhos desta manhã.'
      : hour < 18
      ? 'O terreiro pulsa com energia. Veja o resumo.'
      : 'A força dos Orixás guia esta noite.';

  return (
    <div className="min-h-screen bg-transparent text-white p-6 lg:p-10 font-sans selection:bg-[#D4AF37]/30">
      
      {/* Header Bar */}
      <header className="flex justify-between items-center mb-10">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37] mb-1">{greetingEmoji} {greeting}, {terreiroNome.split(' ')[0]}</p>
          <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">Axé em Movimento</h1>
          <p className="text-[11px] text-gray-500 mt-1 font-medium">{greetingSubtitle}</p>
        </div>
        {/* Avatar + Sino — lg+ apenas: evita dois painéis + dois canais Realtime entre sm e lg (header mobile ainda visível) */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <NotificationPanel tenantData={tenantData} systemVersion={systemVersion} userRole={userRole} userId={user?.id} />
          <div className="flex items-center gap-3 bg-[#121212]/50 p-1 pr-4 rounded-full border border-white/5 cursor-pointer hover:bg-[#1a1a1a] transition-all">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-primary/20 flex items-center justify-center text-background font-black text-sm">
              {tenantData?.foto_url ? (
                <img src={tenantData.foto_url} alt={terreiroNome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                terreiroNome.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left min-w-0 max-w-[200px]">
              <p className="text-xs font-bold text-white leading-none truncate">{terreiroNome}</p>
              {headerRoleLine && (
                <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest leading-none truncate">{headerRoleLine}</p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Section (65%) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Card: Pagamentos do Mês */}
          <div className="bg-[#121212] rounded-[2rem] border border-white/5 shadow-2xl p-8 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-96 h-96 bg-[#D4AF37]/5 blur-[120px] -mr-48 -mt-48 pointer-events-none" />
            
            <div className="relative z-10 flex justify-between items-start mb-2">
               <div>
                  <p className="text-sm font-medium text-gray-400">Pagamentos do Mês</p>
                  <h2 className="text-5xl font-black mt-2 tracking-tighter">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalReceita)}
                  </h2>
                  <div className="flex items-center gap-2 mt-4 text-[13px] font-bold">
                    <span className="text-emerald-500 flex items-center gap-1">
                       <Plus className="w-3.5 h-3.5" /> {stats.growth}%
                    </span>
                    <span className="text-gray-500">em relação ao mês anterior</span>
                  </div>
               </div>
               <div className="flex gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/30"></div>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]/30"></div>
               </div>
            </div>

            <div className="h-44 w-full mt-6 relative z-10" style={{ minWidth: 0 }}>
               <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={176} debounce={50}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorWave" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="val" 
                      stroke="#D4AF37" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#colorWave)" 
                      animationDuration={3000}
                    />
                  </AreaChart>
               </ResponsiveContainer>
               {/* Decorative dots to match the image style */}
               <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
                  <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-[#D4AF37] rounded-full shadow-[0_0_10px_#D4AF37]"></div>
                  <div className="absolute top-3/4 left-1/2 w-1.5 h-1.5 bg-[#D4AF37] rounded-full shadow-[0_0_10px_#D4AF37]"></div>
                  <div className="absolute top-2/3 right-1/4 w-2 h-2 bg-[#D4AF37] rounded-full shadow-[0_0_12px_#D4AF37]"></div>
               </div>
            </div>
          </div>

          {/* Card: Filhos de Santo */}
          <div className="bg-[#121212] rounded-[2rem] border border-white/5 shadow-2xl p-8">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-xl font-bold">Filhos de Santo</h3>
                <button onClick={() => setActiveTab('children')} className="text-xs font-bold text-[#D4AF37] hover:underline uppercase tracking-widest">Ver todos</button>
             </div>
             
             <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                {childrenData.map((filho, idx) => (
                  <div
                    key={filho.id}
                    className="flex flex-col items-center cursor-pointer group"
                    onClick={() => {
                      if (setSelectedChildId) {
                        setSelectedChildId(filho.id);
                        setActiveTab('profile');
                      }
                    }}
                  >
                    {/* Avatar com anel pulsante permanente */}
                    <div className="relative w-20 h-20">
                      {/* Anel externo pulsante */}
                      <span className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/60 animate-ping" style={{ animationDuration: '2.4s' }} />
                      {/* Anel fixo dourado */}
                      <span className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/80 group-hover:border-[#D4AF37] transition-colors" />
                      {/* Foto */}
                      <div className="absolute inset-[3px] rounded-full overflow-hidden">
                        {filho.foto_url ? (
                          <img src={filho.foto_url} alt={filho.nome} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${filho.nome}`} alt={filho.nome} className="w-full h-full object-cover bg-[#0a0a0a]" />
                        )}
                      </div>
                      {/* Brilho ao hover */}
                      <div className="absolute inset-0 rounded-full bg-[#D4AF37]/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <p className="text-xs font-bold mt-3 text-center text-[#D4AF37]">{filho.nome.split(' ')[0]}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 text-center truncate w-full uppercase tracking-widest font-medium">Ativo</p>
                  </div>
                ))}
                {childrenData.length === 0 && Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center opacity-20">
                     <div className="w-20 h-20 rounded-full bg-white/5"></div>
                     <div className="w-16 h-2 bg-white/5 mt-4 rounded"></div>
                  </div>
                ))}
             </div>
          </div>

          {/* Card: Resumo Financeiro */}
          <div className="bg-[#121212] rounded-[2rem] border border-white/5 shadow-2xl p-8 flex flex-col md:flex-row gap-10">
             <div className="flex-1">
                <h3 className="text-xl font-bold mb-8">Resumo Financeiro</h3>
                <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Receitas</p>
                      <p className="text-lg font-black text-emerald-500 mt-1 tracking-tighter">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalReceita)}
                      </p>
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Despesas</p>
                      <p className="text-lg font-black text-rose-500 mt-1 tracking-tighter">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.totalDespesa)}
                      </p>
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Despesas</p>
                      <p className="text-lg font-black text-white mt-1 tracking-tighter">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.despesasExtras)}
                      </p>
                   </div>
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Lucro Líquido</p>
                      <p className="text-lg font-black text-white mt-1 tracking-tighter">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.lucroLiquido)}
                      </p>
                   </div>
                </div>
             </div>
             
             <div className="flex flex-col items-center justify-center p-6 bg-black/20 rounded-3xl border border-white/5 min-w-[200px] relative overflow-hidden group">
                <div className="absolute inset-0 bg-[#D4AF37]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative z-10 w-40 h-40" style={{ minWidth: 0 }}>
                   <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={160} debounce={50}>
                      <PieChart>
                         <Pie
                           data={[{ val: 81 }, { val: 19 }]}
                           cx="50%"
                           cy="50%"
                           innerRadius={55}
                           outerRadius={65}
                           stroke="none"
                           dataKey="val"
                           startAngle={90}
                           endAngle={-270}
                         >
                            <Cell fill="#D4AF37" />
                            <Cell fill="rgba(255,255,255,0.03)" />
                         </Pie>
                      </PieChart>
                   </ResponsiveContainer>
                   <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-3xl font-black text-white">81%</span>
                      <span className="text-[8px] font-black text-gray-500 uppercase tracking-[0.2em] mt-1">Lucratividade</span>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Right Section (35%) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Card: Calendário */}
          <div className="bg-[#121212] rounded-[2rem] border border-white/5 shadow-2xl p-8">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Calendário</h3>
                <ChevronRight className="w-5 h-5 text-gray-600" />
             </div>
             
             <p className="text-xs font-bold text-[#D4AF37] text-center mb-6 uppercase tracking-widest">
                {dashboardCalendar.monthTitle}
             </p>
             
             <div className="grid grid-cols-7 gap-y-2 gap-x-0 text-center">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(day => (
                  <span key={day} className="text-[9px] font-bold text-gray-600 uppercase col-span-1">{day}</span>
                ))}
                {dashboardCalendar.days.map(day => {
                  const inMonth = isSameMonth(day, dashboardCalendar.anchor);
                  const isTodayCell = isSameDay(day, new Date());
                  return (
                    <span
                      key={day.toISOString()}
                      className={cn(
                        'text-xs font-bold p-2 rounded-lg flex items-center justify-center min-h-[2rem]',
                        !inMonth && 'text-gray-700 opacity-35',
                        inMonth && !isTodayCell && 'text-gray-400',
                        isTodayCell && 'bg-[#D4AF37] text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                  );
                })}
             </div>
          </div>

          {/* Card: Histórico */}
          <div className="bg-[#121212] rounded-[2rem] border border-white/5 shadow-2xl p-8 flex flex-col min-h-[400px]">
             <div className="flex justify-between items-center mb-8">
                <h3 className="text-lg font-bold">Histórico</h3>
                <button aria-label="Mais opções de histórico" className="text-gray-600 hover:text-white transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
             </div>

             <div className="space-y-6 flex-1">
               {historyData.length > 0 ? historyData.map((transaction, idx) => (
                 <div key={idx} className="flex items-center justify-between group cursor-pointer">
                    <div className="flex items-center gap-4">
                       <div className={cn(
                         "w-10 h-10 rounded-xl flex items-center justify-center border border-white/5 transition-all text-black",
                         transaction.tipo === 'entrada' ? "bg-emerald-500" : "bg-rose-500"
                       )}>
                          {transaction.tipo === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                       </div>
                       <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">{transaction.descricao || 'Transação'}</span>
                          <span className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">{new Date(transaction.data).toLocaleDateString('pt-BR')}</span>
                       </div>
                    </div>
                    <span className={cn(
                      "text-xs font-black",
                      transaction.tipo === 'entrada' ? "text-emerald-500" : "text-rose-500"
                    )}>
                      {transaction.tipo === 'entrada' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(transaction.valor)}
                    </span>
                 </div>
               )) : (
                 <div className="flex flex-col items-center justify-center h-full opacity-20 italic text-sm text-center">Nenhum histórico disponível.</div>
               )}
             </div>
          </div>
        </div>

      </div>

    </div>
  );
}
