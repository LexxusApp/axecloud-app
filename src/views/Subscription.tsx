import React, { useState, useEffect } from 'react';
import { Check, Crown, Zap, Star, ShieldCheck, ArrowRight, Loader2, X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { PLAN_NAMES, CHECKOUT_URLS, isLifetimePlan, canonicalPlanSlug } from '../constants/plans';
import PageHeader from '../components/PageHeader';

interface PlanCardProps {
  name: string;
  price: string;
  description: string;
  features: string[];
  icon: any;
  isPopular?: boolean;
  color: string;
  onSelect: () => void;
  loading?: boolean;
  isCurrentPlan?: boolean;
}

function PlanCard({ name, price, description, features, icon: Icon, isPopular, color, onSelect, loading, isCurrentPlan }: PlanCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -10 }}
      className={cn(
        "relative flex flex-col p-8 rounded-3xl border transition-all duration-500 bg-card/50 backdrop-blur-sm",
        isPopular ? "border-[#FBBC00] shadow-2xl shadow-[#FBBC00]/10 scale-105 z-10" : "border-white/5 hover:border-white/20",
        isCurrentPlan && "border-primary shadow-lg shadow-primary/20"
      )}
    >
      {isPopular && !isCurrentPlan && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#FBBC00] text-background text-[10px] font-black px-4 py-1 rounded-full tracking-widest uppercase">
          Mais Escolhido
        </div>
      )}
      {isCurrentPlan && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-background text-[10px] font-black px-4 py-1 rounded-full tracking-widest uppercase flex items-center gap-1">
          <Check className="w-3 h-3" />
          Seu Plano Atual
        </div>
      )}

      <div className="mb-8">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-lg", color)}>
          <Icon className="w-8 h-8 text-white" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">{name}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
      </div>

      <div className="mb-8">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black text-white">R$ {price}</span>
          <span className="text-gray-500 font-bold">/mês</span>
        </div>
      </div>

      <div className="flex-1 space-y-4 mb-10">
        {features.map((feature, index) => (
          <div key={index} className="flex items-start gap-3">
            <div className="mt-1 bg-emerald-500/10 rounded-full p-0.5">
              <Check className="w-3 h-3 text-emerald-500" />
            </div>
            <span className="text-sm text-gray-300 font-medium">{feature}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onSelect}
        disabled={loading || isCurrentPlan}
        className={cn(
          "w-full py-4 rounded-2xl font-black flex items-center justify-center gap-3 transition-all group",
          isCurrentPlan
            ? "bg-white/10 text-white cursor-not-allowed border border-white/10"
            : isPopular 
              ? "bg-[#FBBC00] text-background hover:bg-[#FBBC00]/90 shadow-lg shadow-[#FBBC00]/20" 
              : "bg-white/5 text-white hover:bg-white/10 border border-white/10"
        )}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isCurrentPlan ? (
          <>
            <Check className="w-5 h-5" />
            PLANO ATIVO
          </>
        ) : (
          <>
            ASSINAR AGORA
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </>
        )}
      </button>
    </motion.div>
  );
}

interface SubscriptionProps {
  session: any;
  tenantData: any;
  onPlanUpdated: () => void;
  hideHeader?: boolean;
  onlyCurrentPlan?: boolean;
  onlyAvailablePlans?: boolean;
  setActiveTab: (tab: string) => void;
}

export default function Subscription({ session, tenantData, onPlanUpdated, hideHeader, onlyCurrentPlan, onlyAvailablePlans, setActiveTab }: SubscriptionProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [plansConfig, setPlansConfig] = useState<Record<string, any>>({});
  const [fetchingPlans, setFetchingPlans] = useState(true);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await fetch('/api/plans');
        if (response.ok) {
          const data = await response.json();
          setPlansConfig(data.plans || {});
        }
      } catch (error) {
        console.error('Error fetching plans:', error);
      } finally {
        setFetchingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = async (planId: string) => {
    console.log(`[SUBSCRIPTION] handleSelectPlan: ${planId}`);
    
    if (tenantData?.plan === planId) {
      alert('Você já possui este plano ativo.');
      return;
    }

    const url = CHECKOUT_URLS[planId];
    
    if (!url) {
      console.error(`[SUBSCRIPTION] URL de checkout não encontrada para o plano: ${planId}`);
      console.log('[DEBUG] CHECKOUT_URLS:', CHECKOUT_URLS);
      alert(`Erro: A URL de checkout para o plano "${planId}" não foi configurada. Por favor, verifique se as variáveis VITE_KIWIFY_${planId.toUpperCase()}_URL estão configuradas corretamente no painel de Secrets ou no Vercel.`);
      return;
    }

    console.log(`[SUBSCRIPTION] Abrindo checkout Kiwify em pop-up: ${url}`);
    
    const width = 500;
    const height = 750;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    window.open(
      url, 
      'KiwifyCheckout', 
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );
  };

  // Listener para mensagens do iframe de checkout (caso a Kiwify envie mensagens via postMessage)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Aqui você pode adicionar lógica para capturar eventos reais da Kiwify se eles usarem postMessage
      // Por enquanto, mantemos apenas para logs de depuração
      if (event.data?.type === 'checkout_success') {
        console.log('[SUBSCRIPTION] Evento de sucesso recebido via postMessage');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const formatPrice = (price?: number, defaultPrice: string = "0,00") => {
    if (price === undefined || price === null) return defaultPrice;
    return price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (fetchingPlans) {
    if (onlyCurrentPlan) {
      return (
        <div className="card-luxury p-8 flex items-center justify-center min-h-[120px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const planKey = canonicalPlanSlug(tenantData?.plan);
  const currentPlanName = PLAN_NAMES[planKey] || plansConfig[tenantData?.plan]?.name || tenantData?.plan || 'Nenhum';
  const expiresAt = tenantData?.expires_at ? new Date(tenantData.expires_at).toLocaleDateString('pt-BR') : 'Sem validade definida';
  const isLifetime = isLifetimePlan(tenantData?.plan);

  if (onlyCurrentPlan) {
    return (
      <div className="card-luxury p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-primary/20 bg-primary/5">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-2xl font-black text-white">Plano {currentPlanName}</h3>
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-black tracking-widest uppercase">Ativo</span>
            </div>
            <p className="text-gray-400 font-medium">
              {isLifetime ? 'Seu plano é vitalício e não possui data de expiração.' : `Sua assinatura expira em: ${expiresAt}`}
            </p>
          </div>
        </div>
        {!isLifetime && (
          <button 
            onClick={() => handleSelectPlan(tenantData?.plan)}
            disabled={loading === tenantData?.plan}
            className="bg-primary text-background px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-50 whitespace-nowrap"
          >
            {loading === tenantData?.plan ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            RENOVAR ASSINATURA
          </button>
        )}
      </div>
    );
  }

  const plansGrid = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
      <PlanCard
        name={plansConfig.axe?.name || "Plano Axé"}
        price={formatPrice(plansConfig.axe?.price, "49,90")}
        description={plansConfig.axe?.description || "Ideal para terreiros que estão começando a digitalização."}
        icon={Zap}
        color="bg-blue-500 shadow-blue-500/20"
        features={[
          "Gestão de Filhos de Santo",
          "Mural de Avisos",
          "Calendário de Giras",
          "Suporte via WhatsApp",
          "Acesso para 1 Zelador"
        ]}
        onSelect={() => handleSelectPlan('axe')}
        loading={loading === 'axe'}
        isCurrentPlan={tenantData?.plan === 'axe' || tenantData?.plan === 'free'}
      />

      <PlanCard
        name={plansConfig.oro?.name || "Plano Orô"}
        price={formatPrice(plansConfig.oro?.price, "89,90")}
        description={plansConfig.oro?.description || "Controle de estoque e biblioteca de estudos para o seu corpo mediúnico."}
        icon={Star}
        isPopular
        color="bg-emerald-500 shadow-emerald-500/20"
        features={[
          "Tudo do Plano Axé",
          "Almoxarifado (Estoque)",
          "Biblioteca de Estudos",
          "Gestão de Eventos",
          "Acesso para 2 Administradores"
        ]}
        onSelect={() => handleSelectPlan('oro')}
        loading={loading === 'oro'}
        isCurrentPlan={tenantData?.plan === 'oro'}
      />

      <PlanCard
        name={plansConfig.premium?.name || "Plano Premium"}
        price={formatPrice(plansConfig.premium?.price, "149,90")}
        description={plansConfig.premium?.description || "Gestão espiritual e financeira completa para o seu terreiro."}
        icon={Crown}
        color="bg-[#FBBC00] shadow-[#FBBC00]/20"
        features={[
          "Tudo do Plano Orô",
          "Financeiro Completo",
          "Prontuário Espiritual",
          "Loja do Axé (Vendas)",
          "Relatórios Avançados",
          "Acesso Ilimitado"
        ]}
        onSelect={() => handleSelectPlan('premium')}
        loading={loading === 'premium'}
        isCurrentPlan={planKey === 'premium' || planKey === 'cortesia' || planKey === 'vita'}
      />
    </div>
  );

  if (onlyAvailablePlans) {
    return (
      <div className="w-full">
        {plansGrid}
      </div>
    );
  }

  return (
    <div className={cn("max-w-7xl mx-auto", hideHeader ? "" : "pb-12")}>
      {!hideHeader && (
        <PageHeader 
          title={<>Escolha o fundamento da sua <span className="text-[#FBBC00]">Gestão</span></>}
          subtitle="Selecione o plano que melhor atende às necessidades do seu terreiro e tenha controle total na palma da sua mão."
          tenantData={tenantData}
          setActiveTab={setActiveTab}
        />
      )}

      {hideHeader && (
        <div className="mb-12">
          <div className="card-luxury p-8 flex flex-col md:flex-row items-center justify-between gap-6 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                <Crown className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-2xl font-black text-white">Plano {currentPlanName}</h3>
                  <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-black tracking-widest uppercase">Ativo</span>
                </div>
                <p className="text-gray-400 font-medium">
                  {isLifetime ? 'Seu plano é vitalício e não possui data de expiração.' : `Sua assinatura expira em: ${expiresAt}`}
                </p>
              </div>
            </div>
            {!isLifetime && (
              <button 
                onClick={() => handleSelectPlan(tenantData?.plan)}
                disabled={loading === tenantData?.plan}
                className="bg-primary text-background px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {loading === tenantData?.plan ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                RENOVAR ASSINATURA
              </button>
            )}
          </div>
        </div>
      )}

      {plansGrid}

      <div className="mt-20 p-10 rounded-3xl bg-white/5 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-white mb-1">Segurança e Transparência</h4>
            <p className="text-gray-400 text-sm">Seus dados são protegidos com criptografia de ponta a ponta. Cancele quando quiser.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 grayscale opacity-50">
          <img src="https://kiwify.com.br/wp-content/uploads/2021/08/logo-kiwify.png" alt="Kiwify" className="h-6" referrerPolicy="no-referrer" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png" alt="Visa" className="h-4" referrerPolicy="no-referrer" />
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png" alt="Mastercard" className="h-6" referrerPolicy="no-referrer" />
        </div>
      </div>
    </div>
  );
}
