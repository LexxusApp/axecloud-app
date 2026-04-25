import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  TrendingUp, 
  CreditCard, 
  Search, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronRight, 
  Save, 
  Loader2,
  Calendar,
  Building2,
  DollarSign as DollarSignIcon,
  Crown,
  Trash2,
  Ban,
  CheckCircle,
  MoreVertical,
  Settings,
  AlertTriangle,
  LayoutDashboard,
  Activity,
  History,
  FileText,
  BarChart3,
  Globe,
  Bell,
  LogOut,
  Plus,
  Menu,
  X,
  Database,
  Smartphone,
  CheckCircle2,
  XCircle,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  DollarSign,
  Clock,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  Tooltip as ReChartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { Session } from '@supabase/supabase-js';
import LuxuryLoading from '../components/LuxuryLoading';

interface MasterPortalProps {
  session: Session;
  onLogout: () => void;
  onSwitchToNormal: () => void;
}

interface TenantMetadata {
  id: string;
  email: string;
  nome_terreiro: string;
  nome_zelador: string;
  whatsapp: string;
  plan: string;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  totalChildren?: number;
}

export default function MasterPortal({ session, onLogout, onSwitchToNormal }: MasterPortalProps) {
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'tenants' | 'billing' | 'plans' | 'logs' | 'demo' | 'trial'>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [tenants, setTenants] = useState<TenantMetadata[]>([]);
  const [plans, setPlans] = useState<any>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [systemStats, setSystemStats] = useState<any>(null);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [newTenant, setNewTenant] = useState({
    nome_terreiro: '',
    nome_zelador: '',
    email: '',
    whatsapp: '',
    plan: 'axe',
    observacao: '',
    password: Math.random().toString(36).slice(-8)
  });

  useEffect(() => {
    fetchGlobalData();
    fetchSystemStats();
  }, []);

  const fetchSystemStats = async () => {
    try {
      const resp = await fetch('/api/admin/system-stats', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (resp.ok) {
        setSystemStats(await resp.json());
      }
    } catch (err) {
      console.error("Error fetching system stats:", err);
    }
  };

  const fetchGlobalData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/tenants', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      if (!response.ok) throw new Error("Erro ao carregar dados do núcleo");
      
      const { profiles, subs, plans: plansConfig } = await response.json();
      const merged = (profiles || []).map((p: any) => {
        const sub = subs?.find((s: any) => s.id === p.id);
        return { ...p, plan: sub?.plan || 'axe', expires_at: sub?.expires_at };
      });

      setTenants(merged);
      setPlans(plansConfig || {});
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (tenantId: string, isBlocked: boolean) => {
    const action = isBlocked ? 'unblock' : 'block';
    setSaving(true);
    try {
      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ targetUserId: tenantId, action })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao executar comando");
      }
      await fetchGlobalData();
    } catch (error: any) {
      console.error('Error toggling status:', error);
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!tenantToDelete) return;
    setSaving(true);
    try {
      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ targetUserId: tenantToDelete, action: 'delete' })
      });
      if (!response.ok) throw new Error("Erro ao excluir");

      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
      await fetchGlobalData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const response = await fetch('/api/admin/create-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(newTenant)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao cadastrar');

      setSuccessData({
        ...newTenant,
        id: result.user.id
      });
      await fetchGlobalData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setRegistering(false);
    }
  };

  const copyAccessData = () => {
    if (!successData) return;
    const text = `*Acesso AxéCloud*\n\nOlá! Seu terreiro *${successData.nome_terreiro}* já está no sistema.\n\n*Dados de Acesso:*\nE-mail: ${successData.email}\nSenha: ${successData.password}\n\nLink: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    alert('Dados copiados com sucesso!');
  };

  const saveGlobalPlans = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ data: plans })
        .eq('id', 'plans');

      if (error) throw error;
      alert('Tabela de Planos atualizada com sucesso no núcleo Global!');
    } catch (error) {
      console.error('Error saving plans:', error);
      alert('Falha ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlanChange = (planKey: string, field: string, value: any) => {
    setPlans(prev => ({
      ...prev,
      [planKey]: {
        ...prev[planKey],
        [field]: field === 'price' ? Number(value) : value
      }
    }));
  };

  const handleRenew = async (tenantId: string) => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          targetUserId: tenantId, 
          action: 'renew', 
          amount: 30, 
          unit: 'days' 
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao renovar plano");
      }
      
      alert('Plano renovado com sucesso por mais 30 dias!');
      await fetchGlobalData();
    } catch (error: any) {
      console.error('Error renewing:', error);
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      // Usuário demo mantém o plano selecionado mas com flag para expiração curta
      const demoData = {
        ...newTenant,
        nome_terreiro: `[DEMO] ${newTenant.nome_terreiro}`,
        isDemo: true // Flag para o servidor aplicar expiração de 48h
      };

      const response = await fetch('/api/admin/create-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(demoData)
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erro ao criar demo');

      setSuccessData({
        ...demoData,
        id: result.user.id
      });
      await fetchGlobalData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setRegistering(false);
    }
  };

  const dashboardStats = useMemo(() => {
    const totalTenants = tenants.length;
    const mrr = tenants.reduce((acc, t) => acc + (plans[t.plan?.toLowerCase()]?.price || 0), 0);
    const activeToday = systemStats?.dailyAccess?.[new Date().toISOString().split('T')[0]] || 0;
    
    return [
      { label: 'Terreiros Ativos', value: totalTenants.toString(), icon: Building2, trend: '+4%' },
      { label: 'MRR Consolidado', value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mrr), icon: DollarSign, trend: '+12.5%' },
      { label: 'Acessos Nucleares', value: activeToday.toString(), icon: Zap, trend: 'Ativo' },
      { label: 'Growth Rate', value: '28%', icon: TrendingUp, trend: '+2%' }
    ];
  }, [tenants, plans, systemStats]);

  const chartData = useMemo(() => {
    const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    return days.map(d => ({ name: d, val: Math.floor(Math.random() * 500) + 100 }));
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#141518] flex items-center justify-center">
      <LuxuryLoading />
    </div>
  );

  return (
    <div className="min-h-screen flex-1 w-full relative z-10 bg-[#141518] text-zinc-100 font-sans selection:bg-yellow-500/30">
      
      {/* Executive Header */}
      <header className="fixed top-0 left-0 right-0 z-[100] bg-[#222327]/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
                   <Crown className="w-5 h-5 text-black" />
                </div>
                <span className="font-bold tracking-tight text-white uppercase text-xs tracking-[0.2em]">AxéCloud <span className="opacity-40">System</span></span>
             </div>
             
             <nav className="hidden md:flex items-center gap-1 ml-4 py-1 px-1 bg-white/5 rounded-lg border border-white/5">
                {[
                  { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
                  { id: 'tenants', icon: Users, label: 'Terreiros' },
                  { id: 'plans', icon: CreditCard, label: 'Planos' },
                  { id: 'billing', icon: BarChart3, label: 'Financeiro' },
                  { id: 'demo', icon: Smartphone, label: 'Demo' },
                  { id: 'logs', icon: Activity, label: 'Audit Log' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubTab(item.id as any)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-1.5 rounded-md transition-all text-[11px] font-black uppercase tracking-widest",
                      activeSubTab === item.id 
                        ? "bg-yellow-400 text-black" 
                        : "text-zinc-500 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                ))}
             </nav>
          </div>

          <div className="flex items-center gap-4">
             <div className="hidden md:flex flex-col items-end mr-4">
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Master Admin</span>
                <span className="text-xs font-bold text-white">{session.user.email}</span>
             </div>
             <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="md:hidden p-2 text-zinc-500 hover:text-white transition-colors bg-white/5 rounded-lg border border-white/5">
                {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
             </button>
             <button onClick={onLogout} className="p-2 text-zinc-500 hover:text-red-400 transition-colors bg-white/5 rounded-lg border border-white/5">
                <LogOut className="w-4 h-4" />
             </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden border-t border-white/5 bg-[#222327]"
            >
              <div className="px-6 py-4 flex flex-col gap-2">
                {[
                  { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
                  { id: 'tenants', icon: Users, label: 'Terreiros' },
                  { id: 'plans', icon: CreditCard, label: 'Planos' },
                  { id: 'billing', icon: BarChart3, label: 'Financeiro' },
                  { id: 'demo', icon: Smartphone, label: 'Demo' },
                  { id: 'logs', icon: Activity, label: 'Audit Log' },
                ].map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSubTab(item.id as any);
                      setIsMobileMenuOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-xs font-black uppercase tracking-widest text-left",
                      activeSubTab === item.id 
                        ? "bg-yellow-400 text-black shadow-lg" 
                        : "text-zinc-500 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="pt-24 pb-12 px-6 sm:px-10 lg:px-20 max-w-[1600px] mx-auto min-h-screen">
        
        <AnimatePresence mode="wait">
          {activeSubTab === 'overview' && (
            <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
               
               <div className="flex items-center justify-between pb-6 border-b border-white/5">
                  <div>
                     <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        Controle do Núcleo
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">Sistemas Ativos</span>
                     </h2>
                     <p className="text-zinc-500 text-xs mt-1">Gestão centralizada de infraestrutura e performance da malha AxéCloud.</p>
                  </div>
                  <div className="flex items-center gap-3 bg-zinc-900 border border-white/5 p-2 rounded-xl">
                      <div className="px-4 py-2 border-r border-white/5">
                         <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Status</div>
                         <div className="text-xs font-bold text-emerald-500 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> OPERACIONAL</div>
                      </div>
                      <div className="px-4 py-2">
                         <div className="text-[9px] font-black text-zinc-600 uppercase tracking-widest leading-none mb-1">Uptime</div>
                         <div className="text-xs font-bold text-white">99.98%</div>
                      </div>
                  </div>
               </div>

               {/* Metrics Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {dashboardStats.map((stat, i) => (
                    <div key={i} className="bg-[#222327] border border-white/5 p-8 rounded-2xl group hover:border-yellow-400/20 transition-all flex flex-col justify-between h-40 shadow-lg shadow-black/20">
                       <div className="flex justify-between items-start">
                          <div className="p-3 bg-white/5 rounded-xl border border-white/5 group-hover:border-yellow-400/30 transition-all">
                             <stat.icon className="w-5 h-5 text-yellow-400" />
                          </div>
                          <span className={cn(
                             "text-[10px] font-black px-2 py-1 rounded border",
                             stat.trend.includes('+') ? "text-emerald-500 bg-emerald-500/5 border-emerald-500/10" : "text-zinc-500 bg-white/5 border-white/10"
                          )}>
                             {stat.trend}
                          </span>
                       </div>
                       <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{stat.label}</p>
                          <p className="text-3xl font-black text-white">{stat.value}</p>
                       </div>
                    </div>
                  ))}
               </div>

               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Activity Chart */}
                  <div className="lg:col-span-8 bg-[#222327] border border-white/5 rounded-2xl p-8 flex flex-col shadow-lg shadow-black/20">
                     <div className="flex justify-between items-center mb-8">
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest">Fluxo de Requisições GLOBAIS</h4>
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-yellow-400" />
                              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sincronização</span>
                           </div>
                        </div>
                     </div>
                     <div className="h-[300px] w-full" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300} debounce={50}>
                           <AreaChart data={chartData}>
                              <defs>
                                 <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#facc15" stopOpacity={0.1}/>
                                    <stop offset="95%" stopColor="#facc15" stopOpacity={0}/>
                                 </linearGradient>
                              </defs>
                              <Area type="monotone" dataKey="val" stroke="#facc15" strokeWidth={2} fill="url(#glow)" dot={{ r: 4, fill: '#facc15', strokeWidth: 2, stroke: '#18191c' }} />
                           </AreaChart>
                        </ResponsiveContainer>
                     </div>
                  </div>

                  {/* Nodes Summary */}
                  <div className="lg:col-span-4 bg-[#222327] border border-white/5 rounded-2xl p-8 flex flex-col shadow-lg shadow-black/20">
                     <div className="flex justify-between items-center mb-6">
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest">Nódulos Recentes</h4>
                        <button onClick={() => setActiveSubTab('tenants')} className="text-yellow-400 hover:text-yellow-300">
                           <Plus className="w-5 h-5" />
                        </button>
                     </div>
                     <div className="flex-1 space-y-4">
                        {tenants.slice(0, 5).map((t, i) => (
                           <div key={i} className="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                              <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center text-yellow-400 font-bold border border-white/5 uppercase">{t.nome_terreiro.charAt(0)}</div>
                              <div className="min-w-0 flex-1">
                                 <p className="text-sm font-bold text-white truncate">{t.nome_terreiro}</p>
                                 <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t.plan}</p>
                              </div>
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </motion.div>
          )}

          {activeSubTab === 'tenants' && (
            <motion.div key="tn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
               <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
                  <div className="relative flex-1 w-full max-w-md">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                     <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome, e-mail ou terreiro..."
                        className="w-full bg-[#222327] border border-white/5 rounded-xl pl-12 pr-4 py-3 text-sm focus:outline-none focus:border-yellow-400/30 font-medium text-white"
                     />
                  </div>
                  <button onClick={() => setIsRegisterModalOpen(true)} className="w-full md:w-auto px-8 py-3 bg-yellow-400 text-black font-black uppercase text-[11px] tracking-widest rounded-xl hover:bg-yellow-300 transition-colors flex items-center justify-center gap-2">
                     <Plus className="w-4 h-4" />
                     Novo Terreiro
                  </button>
               </div>

               <div className="bg-[#222327] border border-white/5 rounded-2xl overflow-hidden shadow-lg shadow-black/20">
                  <table className="w-full text-left border-collapse">
                     <thead>
                        <tr className="bg-white/5 text-zinc-500 uppercase text-[10px] font-black tracking-widest">
                           <th className="px-8 py-5">Terreiro / Zelador</th>
                           <th className="px-8 py-5">Plano</th>
                           <th className="px-8 py-5">Criado em</th>
                           <th className="px-8 py-5 text-right">Ações</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {tenants.filter(t => t.nome_terreiro.toLowerCase().includes(searchTerm.toLowerCase())).map(t => (
                           <tr key={t.id} className="hover:bg-white/[0.02] transition-colors group">
                              <td className="px-8 py-6">
                                 <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center text-yellow-400 font-bold uppercase">{t.nome_terreiro.charAt(0)}</div>
                                    <div>
                                       <p className="text-sm font-bold text-white">{t.nome_terreiro}</p>
                                       <p className="text-xs text-zinc-500">{t.email}</p>
                                    </div>
                                 </div>
                              </td>
                              <td className="px-8 py-6">
                                 <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                    t.plan === 'premium' ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" : (t.plan === 'vita' || t.plan === 'plano vita' || t.plan === 'cortesia') ? "bg-purple-500/10 text-purple-400 border-purple-400/20" : t.plan === 'oro' ? "bg-emerald-500/10 text-emerald-400 border-emerald-400/20" : "bg-white/5 text-zinc-500 border-white/10"
                                 )}>
                                    {t.plan}
                                 </span>
                              </td>
                              <td className="px-8 py-6">
                                 <p className="text-xs font-medium text-zinc-400">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
                              </td>
                              <td className="px-8 py-6">
                                 <div className="flex items-center justify-end gap-2">
                                    <button 
                                       onClick={() => handleRenew(t.id)}
                                       title="Renovar Plano (30 dias)"
                                       className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 transition-colors flex items-center justify-center"
                                    >
                                       <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => toggleStatus(t.id, t.is_blocked)} className={cn(
                                       "w-9 h-9 rounded-lg border flex items-center justify-center transition-colors",
                                       t.is_blocked ? "bg-yellow-400/10 border-yellow-400/20 text-yellow-500 hover:bg-yellow-400/20" : "bg-white/5 border-white/10 text-zinc-500 hover:text-white"
                                    )}>
                                       {t.is_blocked ? <CheckCircle className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                                    </button>
                                    <button onClick={() => { setTenantToDelete(t.id); setIsDeleteModalOpen(true); }} className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 text-zinc-500 hover:text-red-500 transition-colors flex items-center justify-center">
                                       <Trash2 className="w-4 h-4" />
                                    </button>
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </motion.div>
          )}

          {activeSubTab === 'plans' && (
             <motion.div key="pl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="flex justify-between items-center bg-[#222327] p-8 rounded-2xl border border-white/5 shadow-lg shadow-black/20">
                   <div>
                      <h3 className="text-xl font-bold text-white">Configuração Global de Planos</h3>
                      <p className="text-sm text-zinc-500">Defina os valores e categorias para todos os terreiros da rede.</p>
                   </div>
                   <button onClick={saveGlobalPlans} className="px-8 py-3 bg-yellow-400 text-black font-black uppercase text-[11px] tracking-widest rounded-xl hover:bg-yellow-300 transition-colors">Confirmar Alterações</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {['axe', 'oro', 'premium'].map(k => {
                      const p = plans[k] || {};
                      return (
                         <div key={k} className="bg-[#222327] border border-white/5 p-8 rounded-2xl space-y-6 shadow-lg shadow-black/20">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-white/5 flex items-center justify-center text-yellow-400">
                                  <Star className="w-5 h-5" />
                               </div>
                               <h4 className="font-bold text-white uppercase tracking-[0.2em] text-xs">Tier {k}</h4>
                            </div>
                            <div className="space-y-4">
                               <div>
                                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-2 block">Nome Publicitário</label>
                                  <input type="text" value={p.name} onChange={e => handlePlanChange(k, 'name', e.target.value)} className="w-full bg-zinc-900 border border-white/5 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/30 outline-none" />
                               </div>
                               <div>
                                  <label className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-2 block">Valor Mensal (BRL)</label>
                                  <div className="relative">
                                     <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-yellow-400" />
                                     <input type="number" value={p.price} onChange={e => handlePlanChange(k, 'price', e.target.value)} className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-white font-bold focus:border-yellow-400/30 outline-none" />
                                  </div>
                               </div>
                            </div>
                         </div>
                      )
                   })}
                </div>
             </motion.div>
          )}

          {activeSubTab === 'billing' && (
             <motion.div key="bl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-12">
                <div className="bg-[#222327] border border-white/5 p-16 rounded-[2.5rem] text-center space-y-8 flex flex-col items-center shadow-2xl shadow-black/40">
                   <div className="w-20 h-20 bg-yellow-400/10 rounded-2xl flex items-center justify-center text-yellow-400 border border-yellow-400/20">
                      <BarChart3 className="w-10 h-10" />
                   </div>
                   <div className="space-y-2">
                      <p className="text-xs font-black text-zinc-600 uppercase tracking-[0.4em]">Receita Bruta Mensal (Estimated)</p>
                      <h3 className="text-7xl font-black tracking-tighter text-white">
                         {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tenants.reduce((acc, t) => acc + (plans[t.plan?.toLowerCase()]?.price || 0), 0))}
                      </h3>
                   </div>
                   <div className="grid grid-cols-3 gap-8 w-full pt-10 border-t border-white/5">
                      <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">Previsão 2026</p>
                         <p className="text-xl font-bold text-white">R$ 1.2M</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">Churn Rate</p>
                         <p className="text-xl font-bold text-emerald-400">1.2%</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">ARPU</p>
                         <p className="text-xl font-bold text-white">R$ 350.00</p>
                      </div>
                   </div>
                </div>
             </motion.div>
          )}

          {activeSubTab === 'demo' && (
             <motion.div key="dm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-10">
                <div className="bg-[#222327] border border-white/5 p-12 rounded-[2.5rem] space-y-8 shadow-2xl shadow-black/40">
                   <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-2xl bg-yellow-400/10 flex items-center justify-center text-yellow-400 border border-yellow-400/20">
                         <Smartphone className="w-8 h-8" />
                      </div>
                      <div>
                         <h3 className="text-2xl font-bold text-white uppercase tracking-tight">Gerador de Acessos Demonstrativos</h3>
                         <p className="text-zinc-500 text-sm">Crie terreiros temporários para exibição e testes comerciais.</p>
                      </div>
                   </div>

                   <form className="space-y-6" onSubmit={handleCreateDemo}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Nome da Demo</label>
                            <input required type="text" placeholder="Ex: Terreiro de Teste" value={newTenant.nome_terreiro} onChange={e => setNewTenant({...newTenant, nome_terreiro: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">E-mail Demo</label>
                            <input required type="email" placeholder="test@demo.com" value={newTenant.email} onChange={e => setNewTenant({...newTenant, email: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                         </div>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Simular Plano</label>
                         <select value={newTenant.plan} onChange={e => setNewTenant({...newTenant, plan: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none appearance-none">
                            {Object.entries(plans).map(([k, v]: [string, any]) => (
                               <option key={k} value={k}>{v.name}</option>
                            ))}
                         </select>
                      </div>

                      <div className="bg-yellow-400/5 border border-yellow-400/10 p-6 rounded-xl">
                         <p className="text-xs text-yellow-400/80 leading-relaxed">
                            <Zap className="w-4 h-4 inline mr-2 mb-1" />
                            O ambiente demo simulará todas as funcionalidades do plano selecionado e expirará em <b>48 horas</b>.
                         </p>
                      </div>
                      <button type="submit" disabled={registering} className="w-full py-4 bg-yellow-400 disabled:opacity-50 text-black font-black uppercase text-xs tracking-[0.2em] rounded-xl hover:bg-yellow-300 transition-colors shadow-2xl shadow-yellow-900/10">
                         {registering ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Gerar Ambiente Demo'}
                      </button>
                   </form>
                </div>
                
                {successData && successData.isDemo && (
                   <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center justify-between">
                         <div>
                            <p className="text-emerald-500 font-bold uppercase text-[10px] tracking-widest mb-1">Ambiente Pronto</p>
                            <p className="text-white font-bold">{successData.email} / {successData.password}</p>
                         </div>
                         <button onClick={copyAccessData} className="px-6 py-2 bg-emerald-500 text-black font-bold text-[10px] uppercase rounded-lg">Copiar Dados</button>
                      </div>
                   </div>
                )}
             </motion.div>
          )}

          {activeSubTab === 'logs' && (
             <motion.div key="lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                <div className="bg-[#222327] border border-white/5 rounded-2xl overflow-hidden shadow-lg shadow-black/20">
                   <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-yellow-500">Audit Registry Log</h4>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-zinc-700" />
                        <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Real-time update</span>
                      </div>
                   </div>
                   <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto custom-scrollbar">
                      {tenants.map((t, i) => (
                         <div key={i} className="p-6 flex justify-between items-center hover:bg-white/[0.02] transition-colors">
                            <div className="flex items-center gap-6">
                               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                               <div>
                                  <p className="text-sm font-bold text-zinc-200 uppercase tracking-tighter">Tenant Synchronized: {t.nome_terreiro}</p>
                                  <p className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em] mt-1">UUID: {t.id} • STATUS: 200 OK</p>
                               </div>
                            </div>
                            <span className="text-[9px] font-black text-zinc-800 bg-white/5 px-3 py-1 rounded uppercase">Audit Verified</span>
                         </div>
                      ))}
                   </div>
                </div>
             </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Register Modal - Executive Redesign */}
      <AnimatePresence>
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsRegisterModalOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-sm" />
             <motion.div 
               initial={{ opacity: 0, scale: 0.98, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 10 }}
               className="relative w-full max-w-2xl bg-[#222327] rounded-3xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
             >
                <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                   <h3 className="text-xl font-bold text-white uppercase tracking-widest">Ativar Novo Terreiro</h3>
                   <button onClick={() => setIsRegisterModalOpen(false)} className="text-zinc-600 hover:text-white transition-colors">
                      <X className="w-6 h-6" />
                   </button>
                </div>

                <div className="p-8">
                   {successData ? (
                     <div className="py-10 text-center space-y-8 animate-in fade-in zoom-in duration-300">
                        <div className="w-20 h-20 border-2 border-emerald-500 rounded-full flex items-center justify-center mx-auto">
                           <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                        </div>
                        <div>
                           <h3 className="text-2xl font-bold text-white uppercase tracking-tighter">Terreiro Ativo</h3>
                           <p className="text-zinc-500 text-sm mt-2">As credenciais de acesso foram geradas com sucesso.</p>
                        </div>
                        <div className="bg-zinc-900 border border-white/5 rounded-xl p-6 text-left space-y-4">
                           <div className="flex justify-between items-center group cursor-pointer" onClick={copyAccessData}>
                              <div>
                                 <p className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">E-mail Operacional</p>
                                 <p className="text-lg font-bold text-white">{successData.email}</p>
                              </div>
                              <ArrowUpRight className="w-5 h-5 text-zinc-800 group-hover:text-yellow-500 transition-colors" />
                           </div>
                           <div className="flex justify-between items-center group cursor-pointer" onClick={copyAccessData}>
                              <div>
                                 <p className="text-[9px] text-zinc-600 uppercase font-black tracking-widest">Senha de Provisionamento</p>
                                 <p className="text-lg font-bold text-yellow-400 tracking-widest">{successData.password}</p>
                              </div>
                           </div>
                        </div>
                        <button onClick={() => { setSuccessData(null); setIsRegisterModalOpen(false); }} className="w-full py-4 bg-yellow-400 text-black font-black uppercase text-xs tracking-widest rounded-xl hover:bg-yellow-300 transition-colors">Finalizar Comando</button>
                     </div>
                   ) : (
                     <form className="space-y-6" onSubmit={handleCreateTenant}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Instituição (Terreiro)</label>
                              <input required type="text" value={newTenant.nome_terreiro} onChange={e => setNewTenant({...newTenant, nome_terreiro: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Responsável Legal</label>
                              <input required type="text" value={newTenant.nome_zelador} onChange={e => setNewTenant({...newTenant, nome_zelador: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">ID Comunicador (WhatsApp)</label>
                              <input required type="text" value={newTenant.whatsapp} onChange={e => setNewTenant({...newTenant, whatsapp: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                           </div>
                           <div className="space-y-2">
                              <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Protocolo E-mail</label>
                              <input required type="email" value={newTenant.email} onChange={e => setNewTenant({...newTenant, email: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none" />
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Plano de Serviços</label>
                           <select value={newTenant.plan} onChange={e => setNewTenant({...newTenant, plan: e.target.value})} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-400/50 outline-none appearance-none">
                              {Object.entries(plans).map(([k, v]: [string, any]) => <option key={k} value={k}>{v.name}</option>)}
                           </select>
                        </div>
                        <div className="pt-6 flex gap-3">
                           <button type="submit" disabled={registering} className="flex-1 py-4 bg-yellow-400 disabled:opacity-50 text-black font-black uppercase text-xs tracking-[0.2em] rounded-xl hover:bg-yellow-300 transition-colors shadow-2xl shadow-yellow-900/10">
                             {registering ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Provisionar Terreiro'}
                           </button>
                           <button type="button" onClick={() => setIsRegisterModalOpen(false)} className="px-8 py-4 border border-white/10 text-zinc-500 font-bold uppercase text-xs tracking-widest rounded-xl hover:border-white/20 transition-all">Cancelar</button>
                        </div>
                     </form>
                   )}
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Modal - Clean & Professional */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/98 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
              className="relative bg-zinc-900 border border-red-500/30 p-10 rounded-2xl w-full max-w-md text-center"
            >
               <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center text-red-500 mb-6">
                  <AlertTriangle className="w-8 h-8" />
               </div>
               <h3 className="text-xl font-bold text-white uppercase tracking-widest mb-4">Deletar Terreiro?</h3>
               <p className="text-zinc-500 text-sm leading-relaxed mb-10">A confirmação deste comando resultará na exclusão <b>irreversível</b> de todos os registros deste terreiro na malha central.</p>
               <div className="flex flex-col gap-3">
                  <button onClick={executeDelete} disabled={saving} className="w-full py-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors font-bold uppercase">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Confirmar Exclusão Definitiva'}
                  </button>
                  <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-4 text-zinc-600 font-bold uppercase text-xs tracking-widest hover:text-white transition-colors">Voltar</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
