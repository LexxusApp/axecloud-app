import React, { useState, useEffect, useRef } from 'react';

const SYSTEM_VERSION = '1.9.52'; // RBAC: portal exclusivo para filho

import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import Children from './views/Children';
import Calendar from './views/Calendar';
import Financial from './views/Financial';
import Inventory from './views/Inventory';
import NoticeBoard from './views/NoticeBoard';
import Settings from './views/Settings';
import Admin from './views/Admin';
import MasterPortal from './views/MasterPortal';
import Login from './views/Login';
import ChildProfile from './views/ChildProfile';
import PerfilFilho from './views/PerfilFilho';
import FilhoHome from './views/FilhoHome';
import FilhoSidebar from './components/FilhoSidebar';
import Library from './views/Library';
import MensalidadeFilho from './views/MensalidadeFilho';
import Store from './views/Store';
import SubscriptionLock from './components/SubscriptionLock';
import { supabase } from './lib/supabase';
import { Session } from '@supabase/supabase-js';
import { Loader2, Menu, BookOpen, ShoppingBag, Layout as LayoutIcon, User as UserIcon, Calendar as CalendarIcon, DollarSign as DollarSignIcon, Sun, ShieldAlert, Crown, Bell } from 'lucide-react';
import NotificationPanel from './components/NotificationPanel';
import { cn } from './lib/utils';
import { hasPlanAccess, isLifetimePlan } from './constants/plans';
import Paywall from './components/Paywall';
import Subscription from './views/Subscription';
import { useWebPush } from './hooks/useWebPush';

const FILHO_ALLOWED_TABS = new Set(['profile', 'perfil', 'financial', 'calendar', 'library', 'store', 'mural']);

function normalizeFilhoTab(tab: string) {
  return FILHO_ALLOWED_TABS.has(tab) ? tab : 'profile';
}

function isFilhoIdentity(user?: { email?: string | null; user_metadata?: any } | null, emailFallback?: string, roleFallback?: string) {
  const role = String(user?.user_metadata?.role || roleFallback || '').toLowerCase().trim();
  const email = String(user?.email || emailFallback || '').toLowerCase().trim();
  return role === 'filho' || (email.startsWith('f_') && email.endsWith('@axecloud.internal'));
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionActive, setSubscriptionActive] = useState(true);
  const [isAdminGlobal, setIsAdminGlobal] = useState(false);
  const [isMasterActive, setIsMasterActive] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'filho' | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [tenantData, setTenantData] = useState<{ 
    nome: string; 
    plan: string; 
    tenant_id?: string;
    expires_at?: string;
    status?: string;
    foto_url?: string;
    cargo?: string | null;
    role?: string | null;
  } | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [filhoFotoUrl, setFilhoFotoUrl] = useState<string | null>(null);

  const { permission, subscribe, loading: pushLoading } = useWebPush(
    session?.user?.id || null,
    tenantData?.tenant_id || null
  );

  const initializedRef = useRef(false);

  const loadAllTenantData = async (userId: string, userEmail?: string, authRole?: string) => {
    let retries = 5;
    const isFilhoAuth = isFilhoIdentity(null, userEmail, authRole);
    
    // Safety Net: Garantia de que o loader sairá em no máximo 15s
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
      console.warn('[SYSTEM] Safety timeout atingido. Forçando encerramento do loader.');
    }, 15000);

    try {
      while (retries > 0) {
        try {
          const url = `/api/tenant-info?userId=${userId}&email=${encodeURIComponent(userEmail || '')}`;
          const response = await fetch(url);
          
          if (response.status === 403) {
            const errorData = await response.json();
            if (errorData.status === 'blocked') setIsBlocked(true);
            if (errorData.status === 'deleted') setIsDeleted(true);
            return;
          }

          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();

          // Reset block/delete states on successful load
          setIsBlocked(false);
          setIsDeleted(false);

        // 1. Role & Admin Status
        // Normaliza: apenas 'filho' é tratado como filho — qualquer outro valor (admin, lider, zelador, etc.) é gestor.
        const rawRole = (data.role || 'admin').toLowerCase().trim();
        const role: 'admin' | 'filho' = rawRole === 'filho' || isFilhoAuth ? 'filho' : 'admin';
        setUserRole(role);
        
        // 2. Tenant Info
        const nome = data.nome_terreiro || 'Meu Terreiro';
        const plan = (data.plan || 'axe').toLowerCase().trim();
        const isGlobalAdmin = !!data.is_admin_global;
        
        setTenantData({ 
          nome, 
          plan, 
          tenant_id: data.tenant_id || userId,
          expires_at: data.expires_at,
          status: data.status,
          foto_url: data.foto_url,
          cargo: data.cargo ?? undefined,
          role: role
        });

          setIsAdminGlobal(isGlobalAdmin);

          if (isGlobalAdmin) {
            setIsMasterActive(true);
          }
          
          if (!isGlobalAdmin && activeTab === 'admin') {
            setActiveTab('dashboard');
          }

          // Se for filho, garante que ele caia no Perfil (profile)
          if (role === 'filho') {
            setIsMasterActive(false);
            setActiveTab(prev => normalizeFilhoTab(prev));
          }

          // 5. Se for filho, buscar o ID e foto_url dele na tabela filhos_de_santo
          if (role === 'filho') {
            const { data: childData, error: childError } = await supabase
              .from('filhos_de_santo')
              .select('id, foto_url')
              .eq('user_id', userId)
              .maybeSingle();
            
            if (childError) {
              console.error("Erro ao buscar vínculo de filho:", childError);
            } else if (childData) {
              setSelectedChildId(childData.id);
              setFilhoFotoUrl(childData.foto_url || null);
            }
          }

          // 3. Subscription (Filhos de Santo não precisam de assinatura ativa)
          if (isGlobalAdmin || role === 'filho') {
            setSubscriptionActive(true);
          } else if (isLifetimePlan(plan)) {
            // Planos vitalícios (vita/cortesia): ativo se status for 'active' ou se não houver registro de assinatura
            setSubscriptionActive(!data.status || data.status === 'active');
          } else if (!data.status) {
            setSubscriptionActive(false);
          } else if (!data.expires_at) {
            setSubscriptionActive(false);
          } else {
            const now = new Date();
            const expiresAt = new Date(data.expires_at);
            const isActive = data.status === 'active' && expiresAt > now;
            setSubscriptionActive(isActive);
          }

          return; 

        } catch (err: any) {
          console.warn(`[WARN] Recuperando Tenant (Tentativa ${6 - retries}): ${err?.message || 'Failed to fetch'}`);
          retries--;
          
          if (retries > 0) {
            // Atraso progressivo (2s) antes de tentar novamente para contornar reinícios de server em deploy
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          if (retries === 0) {
            const isSuperAdmin = userEmail === 'lucasilvasiqueira@outlook.com.br';
            if (isFilhoAuth) {
              setTenantData({ nome: 'Meu Terreiro', plan: 'axe', tenant_id: userId, role: 'filho' });
              setIsAdminGlobal(false);
              setIsMasterActive(false);
              setUserRole('filho');
              setSubscriptionActive(true);
              setActiveTab(prev => normalizeFilhoTab(prev));
              return;
            }
            const plan = isSuperAdmin ? 'premium' : 'axe';
            setTenantData({ nome: 'Meu Terreiro', plan });
            setIsAdminGlobal(isSuperAdmin);
            setIsMasterActive(isSuperAdmin);
            setUserRole('admin');
            setSubscriptionActive(isSuperAdmin);
          } else {
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }
    } finally {
      clearTimeout(safetyTimeout);
      setLoading(false);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const lastVersion = localStorage.getItem('axecloud_version');
      
      if (lastVersion !== SYSTEM_VERSION) {
        console.log('[SYSTEM] Nova versão detectada:', SYSTEM_VERSION);
        localStorage.setItem('axecloud_version', SYSTEM_VERSION);
        // Remove apenas notificações de versão ANTIGAS (sys_X.X.X) — mantém plano e pagamento
        try {
          const notifs = JSON.parse(localStorage.getItem('axecloud_notifications') || '[]');
          const cleaned = notifs.filter((n: any) => !(n.type === 'system' && n.id?.startsWith('sys_') && n.id !== `sys_${SYSTEM_VERSION}`));
          localStorage.setItem('axecloud_notifications', JSON.stringify(cleaned));
        } catch { /* ignora erros de parse */ }
        // Force refresh due to system version bump
        await supabase.auth.signOut();
        window.location.reload();
      }
    };

    initializeAuth();

    // 2. Auth Listener
    // This will trigger INITIAL_SESSION immediately on subscribe
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      
      // Quando trocamos de aba, o Supabase muitas vezes dispara eventos espúrios.
      // Se não há alteração real na sessão e ela já estava setada, nós ignoramos chamadas extras custosas de fetch (INITIAL_SESSION/SIGNED_IN)
      if (
        (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && 
        session && 
        initializedRef.current
      ) {
         setSession(session); 
         return;
      }

      // Evento disparado silenciamente ao trocar de aba sem alterar o usuário
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session) setSession(session);
        return; 
      }

      try {
        setSession(session);
        if (session) {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            // Garante que qualquer papel residual de sessão anterior não vaze para a UI
            // enquanto os dados do novo usuário ainda estão sendo carregados.
            setUserRole(null);
            setLoading(true);
            // Sempre inicia na Home após sessão válida; evita aba 'profile' órfã (sem filho)
            // da sessão anterior. Filhos de santo são reposicionados em loadAllTenantData.
            const isFilhoAuth = isFilhoIdentity(session.user);
            setActiveTab(isFilhoAuth ? 'profile' : 'dashboard');
            if (isFilhoAuth) {
              setUserRole('filho');
              setIsAdminGlobal(false);
              setIsMasterActive(false);
              setSubscriptionActive(true);
            }
            await loadAllTenantData(session.user.id, session.user.email, session.user.user_metadata?.role);
            initializedRef.current = true;
          }
        } else {
          setUserRole(null);
          setIsAdminGlobal(false);
          setSubscriptionActive(true);
          setTenantData(null);
          setSelectedChildId(null);
          setFilhoFotoUrl(null);
          setActiveTab('dashboard');
          initializedRef.current = false;
        }
      } catch (error: any) {
        if (error && error.message && (error.message.includes('stole it') || error.message.includes('Lock'))) {
          return;
        }
        console.error('Error in onAuthStateChange:', error);
      } finally {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
           setLoading(false);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleNavigateToSubscription = () => {
      setActiveTab('settings');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-subscription-tab'));
      }, 100);
    };

    window.addEventListener('navigate-to-subscription', handleNavigateToSubscription);
    return () => window.removeEventListener('navigate-to-subscription', handleNavigateToSubscription);
  }, []);

  useEffect(() => {
    if (userRole === 'filho' && !FILHO_ALLOWED_TABS.has(activeTab)) {
      setActiveTab('profile');
    }
  }, [userRole, activeTab]);

  const refreshAllData = async (newData?: { nome_terreiro?: string; foto_url?: string; cargo?: string | null }) => {
    if (session?.user) {
      
      if (newData) {
        setTenantData(prev => prev ? ({
          ...prev,
          nome: newData.nome_terreiro || prev.nome,
          foto_url: newData.foto_url !== undefined ? newData.foto_url : prev.foto_url,
          cargo: newData.cargo !== undefined ? newData.cargo : prev.cargo
        }) : null);
      } else {
        await loadAllTenantData(session.user.id, session.user.email, session.user.user_metadata?.role);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ 
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/login-bg.png')`,
            backgroundAttachment: 'fixed'
          }}
        />
        <Loader2 className="w-12 h-12 text-primary animate-spin relative z-10" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (isDeleted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ 
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/login-bg.png')`,
            backgroundAttachment: 'fixed'
          }}
        />
        <div className="max-w-md w-full bg-card border border-white/5 p-12 rounded-[40px] text-center space-y-6 relative z-10">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter">CONTA EXCLUÍDA</h2>
          <p className="text-gray-400 font-medium">Esta conta foi removida do sistema. Entre em contato com o suporte para mais informações.</p>
          <button onClick={() => supabase.auth.signOut()} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all">
            VOLTAR AO LOGIN
          </button>
        </div>
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ 
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/login-bg.png')`,
            backgroundAttachment: 'fixed'
          }}
        />
        <div className="max-w-md w-full bg-card border border-white/5 p-12 rounded-[40px] text-center space-y-6 relative z-10">
          <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto">
            <ShieldAlert className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-3xl font-black text-white tracking-tighter">ACESSO SUSPENSO</h2>
          <p className="text-gray-400 font-medium">Seu acesso ao AxéCloud foi temporariamente suspenso por um administrador.</p>
          <button onClick={() => supabase.auth.signOut()} className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all">
            VOLTAR AO LOGIN
          </button>
        </div>
      </div>
    );
  }

  // Show lock screen if subscription is not active AND user is not admin
  // Admins and Children should always have access to the system
  if (!subscriptionActive && !isAdminGlobal && userRole !== 'filho') {
    return <SubscriptionLock plan={tenantData?.plan} />;
  }

  if (loading || !userRole) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none"
          style={{ 
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('/login-bg.png')`,
            backgroundAttachment: 'fixed'
          }}
        />
        <Loader2 className="w-12 h-12 text-primary animate-spin relative z-10" />
      </div>
    );
  }

  const navigateToTab = (tab: string) => {
    setActiveTab(userRole === 'filho' ? normalizeFilhoTab(tab) : tab);
  };

  const renderView = () => {
    // SISTEMA DO FILHO: Se for filho, ele tem um sistema de visualização dedicado
    // Independente de planos ou assinaturas do zelador.
    // Injetamos is_admin_global: true no tenantData enviado aos componentes APENAS para bypassar travas de PLANO
    // Mas passamos isAdminGlobal={false} para desativar botões de edição/exclusão.
    const hijoTenantData = tenantData ? { ...tenantData, is_admin_global: true } : null;

    if (userRole === 'filho') {
      // Filhos de Santo nunca são bloqueados por plano — eles acessam o conteúdo
      // que o zelador/zeladora publica, sem precisar de assinatura própria.
      switch (activeTab) {
        case 'profile':
        case 'perfil': return <PerfilFilho user={session.user} tenantData={hijoTenantData} setActiveTab={navigateToTab} />;
        case 'financial': return <MensalidadeFilho user={session.user} tenantData={hijoTenantData} setActiveTab={navigateToTab} />;
        case 'calendar': return <Calendar user={session.user} tenantData={hijoTenantData} setActiveTab={navigateToTab} userRole={userRole} />;
        case 'library': return <Library user={session.user} userRole={userRole} tenantData={hijoTenantData} isAdminGlobal={false} setActiveTab={navigateToTab} />;
        case 'store': return <Store userRole={userRole} tenantData={hijoTenantData} userId={session.user.id} isAdminGlobal={false} setActiveTab={navigateToTab} />;
        case 'mural': return <NoticeBoard isAdmin={false} tenantData={hijoTenantData} setActiveTab={navigateToTab} />;
        default: return <PerfilFilho user={session.user} tenantData={hijoTenantData} setActiveTab={navigateToTab} />;
      }
    }

    
    // Check access for the active tab (Filhos de Santo têm acesso total de visualização via plano Cortesia)
    const featureAccess = {
      dashboard: true,
      children: true,
      calendar: true,
      mural: true,
      settings: true,
      profile: true,
      admin: isAdminGlobal,
      inventory: hasPlanAccess(tenantData?.plan, 'inventory', isAdminGlobal),
      library: hasPlanAccess(tenantData?.plan, 'library', isAdminGlobal),
      financial: hasPlanAccess(tenantData?.plan, 'financial', isAdminGlobal),
      store: hasPlanAccess(tenantData?.plan, 'store', isAdminGlobal),
      subscription: true
    };

    const isFeatureRestricted = !featureAccess[activeTab as keyof typeof featureAccess];

    if (isFeatureRestricted) {
      const requiredPlan = activeTab === 'financial' || activeTab === 'store' ? 'Fundamento' : 'Orô';
      return (
        <Paywall 
          featureName={activeTab === 'financial' ? 'Financeiro' : activeTab === 'store' ? 'Loja do Axé' : activeTab === 'inventory' ? 'Almoxarifado' : 'Biblioteca'} 
          requiredPlan={requiredPlan}
          onUpgrade={() => navigateToTab('subscription')}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard': 
        return <Dashboard setActiveTab={navigateToTab} user={session.user} userRole={userRole} tenantData={tenantData} isAdminGlobal={isAdminGlobal} setSelectedChildId={setSelectedChildId} systemVersion={SYSTEM_VERSION} />;
      case 'children': 
        return <Children setActiveTab={navigateToTab} user={session.user} setSelectedChildId={setSelectedChildId} tenantData={tenantData} />;
      case 'inventory': 
        return <Inventory tenantData={tenantData} userRole={userRole} isAdminGlobal={isAdminGlobal} setActiveTab={navigateToTab} />;
      case 'calendar': 
        return <Calendar user={session.user} userRole={userRole} tenantData={tenantData} setActiveTab={navigateToTab} />;
      case 'mural':
        /* Neste ramo o usuário nunca é filho (filho tem switch próprio acima) — sempre gestão do terreiro */
        return <NoticeBoard isAdmin tenantData={tenantData} setActiveTab={navigateToTab} />;
      case 'financial': 
        return <Financial userRole={userRole} userId={session.user.id} tenantData={tenantData} isAdminGlobal={isAdminGlobal} setActiveTab={navigateToTab} />;
      case 'settings': 
        return <Settings user={session.user} session={session} onRefresh={refreshAllData} tenantData={tenantData} setActiveTab={navigateToTab} />;
      case 'library':
        return <Library user={session.user} userRole={userRole} tenantData={tenantData} isAdminGlobal={isAdminGlobal} setActiveTab={navigateToTab} />;
      case 'store':
        return <Store userRole={userRole} tenantData={tenantData} userId={session.user.id} isAdminGlobal={isAdminGlobal} setActiveTab={navigateToTab} />;
      case 'admin': 
        return isAdminGlobal ? <Admin session={session} tenantData={tenantData} setActiveTab={navigateToTab} /> : <Dashboard setActiveTab={navigateToTab} user={session.user} userRole={userRole} tenantData={tenantData} systemVersion={SYSTEM_VERSION} />;
      case 'profile':
      case 'perfil':
        if (!selectedChildId) {
          return <Dashboard setActiveTab={navigateToTab} user={session.user} userRole={userRole} tenantData={tenantData} isAdminGlobal={isAdminGlobal} setSelectedChildId={setSelectedChildId} systemVersion={SYSTEM_VERSION} />;
        }
        return <ChildProfile childId={selectedChildId} setActiveTab={navigateToTab} user={session.user} tenantData={tenantData} isSelfView={false} />;
      case 'subscription':
        return <Subscription session={session} tenantData={tenantData} onPlanUpdated={refreshAllData} setActiveTab={navigateToTab} />;
      default: 
        return <Dashboard setActiveTab={navigateToTab} user={session.user} userRole={userRole} systemVersion={SYSTEM_VERSION} />;
    }
  };

  const getPlanColor = (plan: string) => {
    switch (plan.toLowerCase()) {
      case 'premium': return 'text-[#FBBC00]';
      case 'oro': return 'text-emerald-500';
      case 'axe': return 'text-blue-500';
      case 'vita':
      case 'cortesia': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  if (isMasterActive && isAdminGlobal) {
    return (
      <div className="min-h-screen text-white font-sans selection:bg-primary selection:text-background flex relative overflow-hidden">
        {/* Background Image - Árvore (Always Present) */}
        <div 
          className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none -z-20 opacity-70"
          style={{ 
            backgroundImage: `url('https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80')`
          }}
        />
        <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80 pointer-events-none -z-10" />

        <MasterPortal 
          session={session} 
          onLogout={() => setIsMasterActive(false)} 
          onSwitchToNormal={() => setIsMasterActive(false)}
        />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full text-white font-sans selection:bg-primary selection:text-background flex relative overflow-hidden">
      {/* Background Image - Árvore (Always Present) */}
      <div 
        className="fixed inset-0 bg-cover bg-center bg-no-repeat pointer-events-none -z-20 opacity-70"
        style={{ 
          backgroundImage: `url('https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1920&q=80')`
        }}
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/20 via-black/30 to-black/80 pointer-events-none -z-10" />

      {userRole === 'filho' ? (
        <FilhoSidebar 
          activeTab={activeTab} 
          setActiveTab={navigateToTab} 
          tenantData={tenantData}
          user={session?.user}
          filhoFotoUrl={filhoFotoUrl}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
        />
      ) : (
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={navigateToTab} 
          isMobileOpen={isMobileOpen} 
          setIsMobileOpen={setIsMobileOpen} 
          isAdmin={isAdminGlobal}
          userRole={userRole}
          tenantData={tenantData}
          onSwitchToMaster={() => setIsMasterActive(true)}
        />
      )}

      <div className={cn(
        "flex min-w-0 flex-1 flex-col h-[100dvh] relative z-10",
        userRole === 'filho' ? "lg:pl-64" : "lg:pl-56"
      )}>
        {/* Mobile Header */}
        <header className="sticky top-0 z-50 flex h-20 min-w-0 shrink-0 items-center justify-between border-b border-white/5 bg-black/40 px-4 backdrop-blur-xl sm:px-6 lg:hidden">
          {userRole === 'filho' ? (
            /* Header exclusivo para filho de santo */
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-yellow-500/30 bg-black/40">
                  <img
                    src={
                      filhoFotoUrl ||
                      session?.user?.user_metadata?.foto_url ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(session?.user?.user_metadata?.nome || 'filho')}`
                    }
                    alt="Perfil"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col pr-2">
                  <h1 className="truncate text-sm font-black text-white">
                    {session?.user?.user_metadata?.nome || 'Filho de Santo'}
                  </h1>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-yellow-500" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-yellow-500">
                      {tenantData?.nome || 'TERREIRO'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <NotificationPanel tenantData={tenantData} systemVersion={SYSTEM_VERSION} userRole={userRole} userId={session?.user?.id} />
                <button
                  onClick={() => setIsMobileOpen(true)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <Menu className="w-6 h-6" />
                </button>
              </div>
            </>
          ) : (
            /* Header padrão do zelador */
            <>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-primary text-center text-lg font-black leading-10 text-background shadow-lg shadow-primary/20">
                  {tenantData?.foto_url ? (
                    <img 
                      src={tenantData.foto_url} 
                      alt="Profile" 
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    tenantData?.nome?.[0] || 'Z'
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col pr-2">
                  <h1 className="truncate text-sm font-black text-white" title={tenantData?.nome || 'AXÉCLOUD'}>
                    {tenantData?.nome || 'AXÉCLOUD'}
                  </h1>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="flex shrink-0 items-center gap-1.5">
                      <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-primary">ONLINE</p>
                    </div>
                    {tenantData && (
                      <>
                        <span className="shrink-0 text-[10px] text-white/30">|</span>
                        <span className={cn(
                          "min-w-0 truncate text-[9px] font-black uppercase tracking-widest",
                          getPlanColor(tenantData.plan)
                        )}>
                          {tenantData.plan}
                          {tenantData.plan.toLowerCase() === 'premium' && " 👑"}
                          {(tenantData.plan.toLowerCase() === 'vita' || tenantData.plan.toLowerCase() === 'plano vita' || tenantData.plan.toLowerCase() === 'cortesia') && " 💎"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <NotificationPanel tenantData={tenantData} systemVersion={SYSTEM_VERSION} userRole={userRole} userId={session?.user?.id} />
                <button 
                  onClick={() => setIsMobileOpen(true)}
                  className="p-2 text-gray-400 hover:text-white"
                >
                  <Menu className="w-6 h-6" />
                </button>
              </div>
            </>
          )}
        </header>

        {/* Main Content Area with Scroll */}
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <main className={cn("flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden bg-[#121212]/80 backdrop-blur-[2px] lg:pb-0", userRole !== 'filho' ? "pb-24" : "pb-6")} data-role={userRole ?? undefined}>
            {/* Notification Prompt for PWA */}
            {permission === 'default' && session && (
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold">Ativar Notificações?</h4>
                    <p className="text-xs text-gray-400">Receba avisos do mural e eventos em tempo real.</p>
                  </div>
                </div>
                <button
                  onClick={subscribe}
                  disabled={pushLoading}
                  className="w-full md:w-auto bg-primary text-background px-6 py-2 rounded-xl font-black text-sm hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {pushLoading ? 'Ativando...' : 'Ativar Agora'}
                </button>
              </div>
            )}
            {renderView()}
          </main>
        </div>

        {/* Mobile Bottom Tab Bar — apenas para zelador */}
        {userRole !== 'filho' && <nav className="safe-area-bottom fixed bottom-0 left-0 right-0 z-50 flex min-w-0 items-stretch justify-between gap-0.5 border-t border-white/5 bg-black/40 px-2 py-3 backdrop-blur-xl sm:gap-1 sm:px-4 lg:hidden">
          {(userRole === 'admin' ? [
            { id: 'dashboard', icon: LayoutIcon, label: 'Início' },
            { id: 'children', icon: UserIcon, label: 'Filhos' },
            { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
            { id: 'financial', icon: DollarSignIcon, label: 'Axé' },
            { id: 'settings', icon: BookOpen, label: 'Mais' }
          ] : [
            { id: 'dashboard', icon: LayoutIcon, label: 'Início' },
            { id: 'profile', icon: UserIcon, label: 'Meu Perfil' },
            { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
            { id: 'financial', icon: DollarSignIcon, label: 'Financeiro' }
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => navigateToTab(item.id)}
              className={cn(
                "flex min-w-0 flex-1 basis-0 flex-col items-center gap-1 px-0.5 transition-all",
                activeTab === item.id ? "text-primary" : "text-gray-500"
              )}
            >
              <item.icon className={cn("h-6 w-6 shrink-0", activeTab === item.id && "drop-shadow-[0_0_8px_rgba(251,188,0,0.5)]")} />
              <span className="w-full max-w-[5.5rem] truncate text-center text-[9px] font-black uppercase leading-tight tracking-widest sm:max-w-none sm:text-[10px]">{item.label}</span>
            </button>
          ))}
        </nav>}

        {/* Footer */}
        <footer className="px-6 py-4 border-t border-white/5 text-center bg-black/20 backdrop-blur-md">
          <p className="text-xs font-black text-gray-600 uppercase tracking-[0.2em]">
            © 2026 AxéCloud - CNPJ: 66.335.964/0001-07
          </p>
        </footer>
      </div>
    </div>
  );
}
