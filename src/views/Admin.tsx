import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  DollarSign,
  Crown,
  Trash2,
  Ban,
  CheckCircle,
  MoreVertical,
  Settings,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import LuxuryLoading from '../components/LuxuryLoading';
import PageHeader from '../components/PageHeader';
import { Session } from '@supabase/supabase-js';
import { isLifetimePlan, usesDistantSubscriptionExpiry } from '../constants/plans';

interface Tenant {
  id: string;
  email: string;
  nome_terreiro: string;
  cargo: string;
  updated_at: string;
  is_blocked: boolean;
  deleted_at: string | null;
  plano: string;
}

interface PlanConfig {
  name: string;
  price: number;
  description: string;
}

interface AdminProps {
  session?: Session | null;
  tenantData?: any;
  setActiveTab: (tab: string) => void;
}

export default function Admin({ session: propSession, tenantData, setActiveTab }: AdminProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<Record<string, PlanConfig>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const [newTenant, setNewTenant] = useState({
    nome_terreiro: '',
    nome_zelador: '',
    email: '',
    whatsapp: '',
    plan: 'axe',
    observacao: '',
    password: Math.random().toString(36).slice(-8) // Random initial password
  });

  useEffect(() => {
    fetchAdminData();
  }, [propSession]);

  const fetchAdminData = async () => {
    let retries = 3;
    while (retries > 0) {
      try {
        setLoading(true);
        setError(null);
        
        let currentSession = propSession;

        if (!currentSession) {
        const { data: { session: freshSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        currentSession = freshSession;
      }

      if (!currentSession) {
        // One last try with getUser which is more authoritative
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Sessão expirada ou inválida. Por favor, faça login novamente.");
        
        const { data: { session: finalSession } } = await supabase.auth.getSession();
        currentSession = finalSession;
      }

      if (!currentSession) throw new Error("Não foi possível validar sua sessão.");
      if (!currentSession.access_token) throw new Error("Token de acesso ausente na sessão.");

      console.log('[DEBUG] Buscando dados administrativos...', { 
        hasToken: !!currentSession.access_token,
        tokenLength: currentSession.access_token?.length 
      });

      const url = '/api/admin/tenants';
      console.log('[DEBUG] Fetching admin data from:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`
        }
      });
      console.log('[DEBUG] Admin response status:', response.status);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao buscar dados");
      }

      const { profiles, subs, plans: plansConfig } = await response.json();

      const tenantsWithPlans = (profiles || []).map((p: any) => {
        const sub = subs?.find((s: any) => s.id === p.id);
        return {
          ...p,
          plano: sub?.plan || 'axe'
        };
      });

      setTenants(tenantsWithPlans);
        setPlans(plansConfig || {});
        setLoading(false);
        return; // Success

      } catch (err: any) {
        console.error(`Error fetching admin data (Attempt ${4 - retries}):`, err);
        retries--;
        if (retries === 0) {
          setError(err.message || "Erro ao carregar dados administrativos");
          setLoading(false);
        } else {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    }
  };

  const toggleStatus = async (tenantId: string, isBlocked: boolean) => {
    const action = isBlocked ? 'unblock' : 'block';
    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sessão expirada ou inválida");

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Não foi possível obter a sessão");

      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          targetUserId: tenantId,
          action
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao executar comando");
      }

      await fetchAdminData();
    } catch (error: any) {
      console.error('Error toggling status:', error);
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const updatePlan = async (tenantId: string, newPlan: string) => {
    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sessão expirada ou inválida");

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Não foi possível obter a sessão");

      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          targetUserId: tenantId,
          action: 'change-plan',
          newPlan
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Erro ao executar comando");
      }

      await fetchAdminData();
    } catch (error: any) {
      console.error('Error updating plan:', error);
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (tenantId: string) => {
    setTenantToDelete(tenantId);
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!tenantToDelete) return;
    
    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sessão expirada ou inválida");

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Não foi possível obter a sessão");

      const response = await fetch('/api/admin/manage-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          targetUserId: tenantToDelete,
          action: 'delete'
        })
      });

      if (!response.ok) throw new Error("Erro ao excluir");

      setIsDeleteModalOpen(false);
      setTenantToDelete(null);
      await fetchAdminData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveGlobalPlans = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ data: plans })
        .eq('id', 'plans');

      if (error) throw error;
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving plans:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sessão expirada ou inválida");

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Não foi possível obter a sessão");

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
      fetchAdminData();
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
    alert('Dados copiados para o WhatsApp!');
  };

  const filteredTenants = tenants.filter(t => 
    t.nome_terreiro.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const mrr = tenants.reduce((acc, t) => {
    const planKey = (t.plano || 'axe').toLowerCase();
    const price = plans[planKey]?.price || 0;
    return !t.is_blocked ? acc + price : acc;
  }, 0);

  const activeCount = tenants.filter(t => !t.is_blocked).length;
  const pendingCount = tenants.filter(t => t.is_blocked).length;

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <LuxuryLoading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-black text-white">Erro de Autenticação</h3>
          <p className="text-gray-500 max-w-md">{error}</p>
        </div>
        <button 
          onClick={() => fetchAdminData()}
          className="bg-primary text-background px-8 py-3 rounded-xl font-black hover:scale-105 transition-transform"
        >
          TENTAR NOVAMENTE
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader 
        title={<>Painel do <span className="text-primary font-black">Proprietário</span></>}
        subtitle="Controle global da plataforma AxéCloud."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
        actions={
          <button 
            onClick={() => {
              setSuccessData(null);
              setNewTenant({
                nome_terreiro: '',
                nome_zelador: '',
                email: '',
                whatsapp: '',
                plan: 'axe',
                observacao: '',
                password: Math.random().toString(36).slice(-8)
              });
              setIsRegisterModalOpen(true);
            }}
            className="bg-primary text-background px-8 py-3 rounded-lg font-black flex items-center gap-3 shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
          >
            <Building2 className="w-6 h-6" />
            CADASTRAR NOVO TERREIRO
          </button>
        }
      />

      <div className="flex-1 px-4 md:px-6 lg:px-10 pb-20 max-w-[1440px] mx-auto w-full space-y-12 animate-in fade-in duration-700">
        {/* Metrics Grid */}
      <div className="bg-gradient-to-b from-[#1A1A1A] to-background rounded-[2rem] md:rounded-[3rem] p-6 md:p-12 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12">
          <div className="card-luxury p-10 flex flex-col justify-between min-h-[200px] bg-black/40 border-white/[0.03] hover:border-emerald-500/20 group">
            <div className="flex items-center justify-between">
              <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-500">
                <DollarSign className="w-8 h-8" />
              </div>
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] bg-emerald-500/10 px-3 py-1 rounded-full">MRR</span>
            </div>
            <div>
              <h3 className="text-4xl font-black text-white tracking-tighter">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mrr)}
              </h3>
              <p className="text-sm font-bold text-gray-500 mt-2">Faturamento Mensal Estimado</p>
            </div>
          </div>

          <div className="card-luxury p-10 flex flex-col justify-between min-h-[200px] bg-black/40 border-white/[0.03] hover:border-primary/20 group">
            <div className="flex items-center justify-between">
              <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                <Building2 className="w-8 h-8" />
              </div>
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] bg-primary/10 px-3 py-1 rounded-full">ATIVOS</span>
            </div>
            <div>
              <h3 className="text-4xl font-black text-white tracking-tighter">{activeCount}</h3>
              <p className="text-sm font-bold text-gray-500 mt-2">Terreiros com Acesso Liberado</p>
            </div>
          </div>

          <div className="card-luxury p-10 flex flex-col justify-between min-h-[200px] bg-black/40 border-white/[0.03] hover:border-orange-500/20 group">
            <div className="flex items-center justify-between">
              <div className="p-4 rounded-2xl bg-orange-500/10 text-orange-500">
                <CreditCard className="w-8 h-8" />
              </div>
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] bg-orange-500/10 px-3 py-1 rounded-full">PENDENTES</span>
            </div>
            <div>
              <h3 className="text-4xl font-black text-white tracking-tighter">{pendingCount}</h3>
              <p className="text-sm font-bold text-gray-500 mt-2">Assinaturas Expiradas/Bloqueadas</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Tenant Management (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-xl md:text-2xl font-black text-white flex items-center gap-3">
              <Users className="w-6 h-6 text-primary" />
              Gestão de Inquilinos
            </h3>
            <div className="flex items-center gap-4">
              <div className="relative w-full sm:w-64 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Buscar terreiro..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-card border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block card-luxury overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white/5 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  <th className="px-6 py-4">Terreiro / Zelador</th>
                  <th className="px-6 py-4">Plano</th>
                  <th className="px-6 py-4">Expiração</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-white group-hover:text-primary transition-colors">{tenant.nome_terreiro}</span>
                        <span className="text-xs text-gray-500">{tenant.email}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select 
                        value={tenant.plano || 'axe'}
                        onChange={(e) => updatePlan(tenant.id, e.target.value)}
                        className="bg-background border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-primary focus:outline-none [&>option]:bg-[#1B1C1C]"
                      >
                        <option value="axe">Axé</option>
                        <option value="oro">Orô</option>
                        <option value="premium">Premium 👑</option>
                        <option value="cortesia">Cortesia</option>
                        <option value="vita">Plano Vita (vitalício)</option>
                      </select>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-gray-400">
                        {tenant.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                        tenant.is_blocked ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                      )}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", tenant.is_blocked ? "bg-amber-500" : "bg-emerald-500")} />
                        {tenant.is_blocked ? 'Suspenso' : 'Ativo'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => toggleStatus(tenant.id, tenant.is_blocked)}
                          title={tenant.is_blocked ? "Desbloquear" : "Bloquear"}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            tenant.is_blocked ? "text-emerald-500 hover:bg-emerald-500/10" : "text-amber-500 hover:bg-amber-500/10"
                          )}
                        >
                          {tenant.is_blocked ? <CheckCircle className="w-5 h-5" /> : <Ban className="w-5 h-5" />}
                        </button>
                        <button 
                          onClick={() => confirmDelete(tenant.id)}
                          title="Excluir"
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List */}
          <div className="lg:hidden space-y-4">
            {filteredTenants.map((tenant) => (
              <div key={tenant.id} className="card-luxury p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col">
                    <span className="font-black text-white text-lg">{tenant.nome_terreiro}</span>
                    <span className="text-xs text-gray-500 font-bold">{tenant.email}</span>
                  </div>
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    tenant.is_blocked ? "bg-amber-500/10 text-amber-500" : "bg-emerald-500/10 text-emerald-500"
                  )}>
                    <div className={cn("w-1.5 h-1.5 rounded-full", tenant.is_blocked ? "bg-amber-500" : "bg-emerald-500")} />
                    {tenant.is_blocked ? 'Suspenso' : 'Ativo'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Plano</span>
                    <select 
                      value={tenant.plano || 'axe'}
                      onChange={(e) => updatePlan(tenant.id, e.target.value)}
                      className="w-full bg-background border border-white/10 rounded-lg px-2 py-2 text-xs font-bold text-primary focus:outline-none [&>option]:bg-[#1B1C1C]"
                    >
                      <option value="axe">Axé</option>
                      <option value="oro">Orô</option>
                      <option value="premium">Premium 👑</option>
                      <option value="cortesia">Cortesia</option>
                      <option value="vita">Plano Vita (vitalício)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Expiração</span>
                    <p className="text-xs font-bold text-white py-2">
                      {tenant.updated_at ? new Date(tenant.updated_at).toLocaleDateString('pt-BR') : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-4">
                  <button 
                    onClick={() => toggleStatus(tenant.id, tenant.is_blocked)}
                    className={cn(
                      "flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                      tenant.is_blocked ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                    )}
                  >
                    {tenant.is_blocked ? (
                      <><CheckCircle className="w-4 h-4" /> Desbloquear</>
                    ) : (
                      <><Ban className="w-4 h-4" /> Bloquear</>
                    )}
                  </button>
                  <button 
                    onClick={() => confirmDelete(tenant.id)}
                    className="flex-1 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Global Configuration (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <h3 className="text-2xl font-black text-white flex items-center gap-3">
            <Settings className="w-6 h-6 text-primary" />
            Configuração Global
          </h3>

          <div className="card-luxury p-6 md:p-8 space-y-8">
            <div className="space-y-6">
              {Object.entries(plans).map(([key, plan]) => {
                const p = plan as PlanConfig;
                return (
                  <div key={key} className="space-y-3">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Plano {p.name}</label>
                    <div className="flex gap-4">
                      <div className="relative flex-1">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                        <input
                          type="number"
                          value={p.price}
                          onChange={(e) => setPlans({
                            ...plans,
                            [key]: { ...p, price: Number(e.target.value) || 0 }
                          })}
                          className="w-full bg-background border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white font-bold focus:outline-none focus:border-primary/50"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={p.description}
                      onChange={(e) => setPlans({
                        ...plans,
                        [key]: { ...p, description: e.target.value }
                      })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-2 text-xs text-gray-400 focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>

            <button 
              onClick={saveGlobalPlans}
              disabled={saving}
              className="w-full bg-primary text-background font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              SALVAR ALTERAÇÕES
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto overscroll-y-contain p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => !saving && setIsDeleteModalOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative w-full max-w-md bg-card border border-white/5 p-12 rounded-[40px] text-center space-y-8"
          >
            <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <div className="space-y-4">
              <h2 className="text-3xl font-black text-white tracking-tighter">EXCLUIR TERREIRO?</h2>
              <p className="text-gray-400 font-medium">
                Esta ação é irreversível. O terreiro será removido da lista e o acesso será bloqueado imediatamente.
              </p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={saving}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all disabled:opacity-50"
              >
                CANCELAR
              </button>
              <button 
                onClick={executeDelete}
                disabled={saving}
                className="flex-1 py-4 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-500/20 hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                EXCLUIR
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Registration Modal */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-y-contain p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => !registering && setIsRegisterModalOpen(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-card border border-[#FBBC00]/30 w-full max-w-2xl rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
          >
            {!successData ? (
              <>
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-white">Novo Terreiro</h3>
                      <p className="text-sm text-gray-500 font-medium uppercase tracking-widest">Expansão AxéCloud</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                  >
                    <ShieldAlert className="w-6 h-6" />
                  </button>
                </div>

                <form onSubmit={handleCreateTenant} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Nome do Terreiro</label>
                    <input
                      required
                      type="text"
                      value={newTenant.nome_terreiro}
                      onChange={(e) => setNewTenant({ ...newTenant, nome_terreiro: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                      placeholder="Ex: Ilê Axé..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Zelador(a)</label>
                    <input
                      required
                      type="text"
                      value={newTenant.nome_zelador}
                      onChange={(e) => setNewTenant({ ...newTenant, nome_zelador: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
                    <input
                      required
                      type="email"
                      value={newTenant.email}
                      onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                      placeholder="cliente@email.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">WhatsApp</label>
                    <input
                      required
                      type="text"
                      value={newTenant.whatsapp}
                      onChange={(e) => setNewTenant({ ...newTenant, whatsapp: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Plano</label>
                    <div className="relative">
                      <select
                        value={newTenant.plan}
                        onChange={(e) => setNewTenant({ ...newTenant, plan: e.target.value })}
                        className={cn(
                          "w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all appearance-none [&>option]:bg-[#1B1C1C]",
                          usesDistantSubscriptionExpiry(newTenant.plan) && "border-primary/50 text-primary"
                        )}
                      >
                        <option value="axe">Plano Axé (R$ {plans.axe?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '49,90'})</option>
                        <option value="oro">Plano Orô (R$ {plans.oro?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '89,90'})</option>
                        <option value="premium">Plano Premium (R$ {plans.premium?.price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '149,90'}) 👑</option>
                        <option value="cortesia">Cortesia (vitalício)</option>
                        <option value="vita">Plano Vita (vitalício)</option>
                      </select>
                      {usesDistantSubscriptionExpiry(newTenant.plan) && (
                        <Crown className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-pulse" />
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Observação / Motivo da Cortesia</label>
                    <textarea
                      value={newTenant.observacao}
                      onChange={(e) => setNewTenant({ ...newTenant, observacao: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all min-h-[100px]"
                      placeholder="Ex: Parceria com Federação X, cortesia vitalícia..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Senha Provisória</label>
                    <input
                      required
                      type="text"
                      value={newTenant.password}
                      onChange={(e) => setNewTenant({ ...newTenant, password: e.target.value })}
                      className="w-full bg-background border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                    />
                  </div>

                  <div className="md:col-span-2 pt-6 flex gap-4">
                    <button
                      type="button"
                      onClick={() => setIsRegisterModalOpen(false)}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black py-4 rounded-2xl transition-all border border-white/5"
                    >
                      CANCELAR
                    </button>
                    <button
                      type="submit"
                      disabled={registering}
                      className="flex-1 bg-primary text-background font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] disabled:opacity-50"
                    >
                      {registering ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                      FINALIZAR CADASTRO
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-12 text-center space-y-8">
                <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-12 h-12 text-emerald-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-3xl font-black text-white">
                    {successData.plan === 'premium'
                      ? 'Terreiro Premium Cadastrado!'
                      : isLifetimePlan(successData.plan)
                        ? 'Acesso vitalício liberado!'
                        : 'Cadastro Realizado!'}
                  </h3>
                  <p className="text-gray-500 font-medium">
                    {successData.plan === 'premium'
                      ? <>O terreiro <span className="text-primary font-bold">{successData.nome_terreiro}</span> foi cadastrado no <span className="text-primary">Plano Premium</span>.</>
                      : isLifetimePlan(successData.plan)
                        ? <>O terreiro <span className="text-primary font-bold">{successData.nome_terreiro}</span> teve o <span className="text-primary">acesso vitalício</span> liberado.</>
                        : <>O terreiro <span className="text-primary font-bold">{successData.nome_terreiro}</span> já pode acessar o sistema.</>
                    }
                  </p>
                </div>
                
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left space-y-3">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Dados de Acesso</p>
                  <div className="space-y-1">
                    <p className="text-white font-bold">E-mail: <span className="text-primary font-mono">{successData.email}</span></p>
                    <p className="text-white font-bold">Senha: <span className="text-primary font-mono">{successData.password}</span></p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={copyAccessData}
                    className="w-full bg-primary text-background font-black py-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                  >
                    COPIAR DADOS PARA WHATSAPP
                  </button>
                  <button
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="w-full bg-white/5 text-white font-black py-4 rounded-2xl hover:bg-white/10 transition-all"
                  >
                    FECHAR
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
    </div>
  );
}

// Helper for Settings icon
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
  );
}
