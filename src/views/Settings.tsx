import React, { useState, useEffect } from 'react';
import { User, Shield, Bell, Loader2, CheckCircle2, Save, CreditCard, Camera, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import Subscription from './Subscription';
import WhatsAppConfig from './WhatsAppConfig';
import PageHeader from '../components/PageHeader';

interface SettingsProps {
  user: any;
  session?: any;
  tenantData?: any;
  onRefresh?: (newData?: { nome_terreiro?: string; foto_url?: string; cargo?: string | null }) => void | Promise<void>;
  setActiveTab: (tab: string) => void;
}

export default function Settings({ user, session, tenantData, onRefresh, setActiveTab }: SettingsProps) {
  console.log('[DEBUG] Settings component rendering');
  const tenantId = tenantData?.tenant_id;
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'profile' | 'subscription' | 'whatsapp'>('profile');
  const [photoUploading, setPhotoUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleOpenSubscription = () => {
      setActiveSection('subscription');
    };

    window.addEventListener('open-subscription-tab', handleOpenSubscription);
    return () => window.removeEventListener('open-subscription-tab', handleOpenSubscription);
  }, []);

  useEffect(() => {
    console.log('[DEBUG] Settings component mounted');
    if (user) {
      fetchData();
      // Teste de conectividade com a API
      fetch('/api/ping')
        .then(res => res.json())
        .then(data => console.log('[DEBUG] API Ping result:', data))
        .catch(err => console.error('[DEBUG] API Ping failed:', err));
    }
    
    // Safety timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => clearTimeout(timeoutId);
  }, [user, tenantId]);

  async function fetchData() {
    console.log('[DEBUG] Settings fetchData started');
    setLoading(true);
    try {
      if (!user) return;
      
      let profileQuery = supabase.from('perfil_lider').select('*').eq('id', user.id);

      if (tenantId) {
        profileQuery = profileQuery.eq('tenant_id', tenantId);
      }

      const { data: profileData, error: profileError } = await profileQuery.maybeSingle();

      console.log('[DEBUG] Settings profileRes:', profileError ? profileError.message : 'Success');

      if (profileData) {
        setProfile(profileData);
      } else {
        // Initialize with default values if no profile found
        setProfile({
          id: user.id,
          email: user.email,
          nome_terreiro: 'Meu Terreiro',
          cargo: 'Babalorixá'
        });
      }
    } catch (error: any) {
      console.error('[DEBUG] Settings fetchData error:', error);
      setError('Erro ao carregar dados: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
      console.log('[DEBUG] Settings fetchData finished');
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione uma imagem válida.');
      return;
    }

    // Validar tamanho (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5MB.');
      return;
    }

    setPhotoUploading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}-${Math.random()}.${fileExt}`;

        // 1. Pegar sessão
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Sessão expirada');

        // 2. Upload via Servidor (Bypassa RLS)
        const uploadRes = await fetch('/api/v1/profile/upload-photo', {
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

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json();
          throw new Error(errorData.error || 'Erro no upload via servidor');
        }

        const { publicUrl } = await uploadRes.json();
 
        // 3. Atualizar o estado local do perfil para dar feedback visual imediato
        // O salvamento real no banco só ocorrerá quando o usuário clicar em "Salvar Preferências"
        setProfile(prev => ({ ...prev, foto_url: publicUrl }));
        
        setShowSuccess(false); // Reset success to show it only on final save
        setError(null);

      } catch (err: any) {
        console.error('Erro ao subir foto:', err);
        setError(err.message || 'Erro ao atualizar foto de perfil.');
      } finally {
        setPhotoUploading(false);
      }
    };

    reader.onerror = () => {
      setError('Erro ao ler o arquivo.');
      setPhotoUploading(false);
    };

    reader.readAsDataURL(file);
  }

  async function removeProfilePhoto() {
    if (!confirm('Remover sua foto de perfil?')) return;
    
    setIsSaving(true);
    try {
      setProfile(prev => ({ ...prev, foto_url: null }));
      
      // Removemos o salvamento automático aqui a pedido do usuário.
      // Agora o usuário deve clicar em "Salvar Preferências" para persistir a remoção.
      
      if (onRefresh) onRefresh({ foto_url: undefined });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao remover foto:', err);
    } finally {
      setIsSaving(false);
      setPhotoUploading(false);
    }
  }

  async function handleSave() {
    console.log('[DEBUG] Settings handleSave (Server-side) started');
    
    setIsSaving(true);
    setShowSuccess(false);
    setError(null);

    // Timeout de 30s para a requisição ao servidor
    const saveTimeout = setTimeout(() => {
      if (isSaving) {
        setIsSaving(false);
        const msg = 'O servidor demorou demais para responder (30s). Verifique sua conexão.';
        setError(msg);
        console.error('[DEBUG] Timeout no salvamento');
      }
    }, 30000);

    try {
      if (!user?.id) {
        throw new Error('ID do usuário não encontrado. Por favor, recarregue a página.');
      }

      console.log('[DEBUG] Usando dados do usuário logado...');
      console.log('[DEBUG] Enviando dados para o servidor via fetch...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Sessão expirada. Por favor, faça login novamente.');
      }

      const response = await fetch('/api/v1/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: user.id,
          tenantId: tenantId,
          profile: {
            nome_terreiro: profile?.nome_terreiro,
            cargo: profile?.cargo,
            foto_url: profile?.foto_url, // Persistir/Atualizar a foto
            email: user.email 
          }
        })
      });

      console.log('[DEBUG] Resposta do servidor recebida. Status:', response.status);
      
      const contentType = response.headers.get("content-type");
      let data;
      
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('[DEBUG] Resposta não é JSON. Recebido:', text.substring(0, 200));
        throw new Error(`O servidor retornou um formato inesperado (HTML). Status: ${response.status}`);
      }

      console.log('[DEBUG] Dados da resposta:', data);

      if (!response.ok) {
        const errorText = data.error || `Erro do servidor (${response.status}): Falha ao salvar.`;
        throw new Error(errorText);
      }
      
      console.log('[DEBUG] Salvamento via servidor concluído com sucesso');
      setShowSuccess(true);
      
      // Atualiza o nome do terreiro, foto e plano no topo da tela
      if (onRefresh) {
        await onRefresh({ 
          nome_terreiro: profile?.nome_terreiro,
          foto_url: profile?.foto_url,
          cargo: profile?.cargo ?? null
        });
      }
      
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err: any) {
      console.error('[DEBUG] Erro no salvamento via servidor:', err);
      const errorMsg = err.message || 'Erro inesperado ao salvar os dados.';
      setError(errorMsg);
    } finally {
      clearTimeout(saveTimeout);
      setIsSaving(false);
      console.log('[DEBUG] handleSave finalizado.');
    }
  }

  const Toggle = ({ active, onToggle, label, description, icon: Icon }: any) => (
    <div className="flex items-center justify-between p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group">
      <div className="flex items-center gap-5">
        <div className={cn(
          "p-4 rounded-2xl transition-all",
          active ? "bg-primary/10 text-primary" : "bg-white/5 text-gray-500"
        )}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h4 className="text-lg font-black text-white group-hover:text-primary transition-colors">{label}</h4>
          <p className="text-sm text-gray-500 font-medium max-w-sm">{description}</p>
        </div>
      </div>
      <button 
        onClick={onToggle}
        className={cn(
          "relative w-14 h-8 rounded-full transition-all duration-300 flex items-center px-1",
          active ? "bg-primary shadow-[0_0_15px_rgba(251,188,0,0.3)]" : "bg-white/10"
        )}
      >
        <div className={cn(
          "w-6 h-6 rounded-full bg-white shadow-lg transition-all duration-300",
          active ? "translate-x-6" : "translate-x-0"
        )} />
      </button>
    </div>
  );

  if (loading && !profile) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <PageHeader 
        title={<>Configurações do <span className="text-primary">Axé</span></>}
        subtitle="Personalize sua experiência e gerencie os módulos do AxéCloud."
        tenantData={tenantData}
        setActiveTab={setActiveTab}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Sidebar Settings */}
        <div className="lg:col-span-4 space-y-4">
          <button 
            onClick={() => setActiveSection('profile')}
            className={cn(
              "w-full flex items-center gap-4 p-6 rounded-3xl font-black transition-all",
              activeSection === 'profile' ? "bg-primary text-background shadow-xl shadow-primary/10" : "bg-white/5 text-gray-400 hover:bg-white/10"
            )}
          >
            <User className="w-6 h-6" />
            Perfil do Zelador
          </button>
          <button 
            onClick={() => setActiveSection('subscription')}
            className={cn(
              "w-full flex items-center gap-4 p-6 rounded-3xl font-black transition-all",
              activeSection === 'subscription' ? "bg-primary text-background shadow-xl shadow-primary/10" : "bg-white/5 text-gray-400 hover:bg-white/10"
            )}
          >
            <CreditCard className="w-6 h-6" />
            Assinatura e Planos
          </button>
          <button 
            onClick={() => setActiveSection('whatsapp')}
            className={cn(
              "w-full flex items-center gap-4 p-6 rounded-3xl font-black transition-all",
              activeSection === 'whatsapp' ? "bg-emerald-500 text-background shadow-xl shadow-emerald-500/10" : "bg-white/5 text-gray-400 hover:bg-white/10"
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M3 21l1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>
            Conexão WhatsApp
          </button>
          
          <div className="pt-6 space-y-4 opacity-50 pointer-events-none">
            <button className="w-full flex items-center gap-4 p-6 rounded-3xl bg-white/5 text-gray-400 font-black">
              <Shield className="w-6 h-6" />
              Segurança
            </button>
            <button className="w-full flex items-center gap-4 p-6 rounded-3xl bg-white/5 text-gray-400 font-black">
              <Bell className="w-6 h-6" />
              Notificações
            </button>
          </div>
        </div>

        {/* Content Settings */}
        <div className="lg:col-span-8 space-y-10">
          {activeSection === 'profile' ? (
            <div className="card-luxury p-10 space-y-10">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="relative group">
                  <div className="w-28 h-28 rounded-[2.5rem] bg-primary/10 flex items-center justify-center text-primary font-black text-5xl shadow-2xl shadow-primary/10 border border-primary/20 overflow-hidden">
                    {profile?.foto_url ? (
                      <img 
                        src={profile.foto_url} 
                        alt="Profile" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      profile?.nome_terreiro?.[0] || 'Z'
                    )}
                    {photoUploading && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="absolute -bottom-2 -right-2 p-3 bg-primary text-background rounded-2xl shadow-xl hover:scale-110 transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Camera className="w-5 h-5" />
                  </button>
                  <input 
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <div className="text-center md:text-left">
                  <h3 className="text-3xl font-black text-white">{profile?.nome_terreiro || 'Zelador de Axé'}</h3>
                  <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">{profile?.email}</p>
                  <div className="flex items-center justify-center md:justify-start gap-4 mt-3">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="text-primary text-[10px] font-black hover:underline uppercase tracking-widest flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      Alterar Foto
                    </button>
                    {profile?.foto_url && (
                      <button 
                        onClick={removeProfilePhoto}
                        className="text-red-500 text-[10px] font-black hover:underline uppercase tracking-widest flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Nome do Terreiro</label>
                  <input
                    type="text"
                    value={profile?.nome_terreiro || ''}
                    onChange={(e) => setProfile({ ...profile, nome_terreiro: e.target.value })}
                    className="w-full bg-background border border-white/5 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-all font-bold"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Cargo / Título</label>
                  <input
                    type="text"
                    value={profile?.cargo || ''}
                    onChange={(e) => setProfile({ ...profile, cargo: e.target.value })}
                    className="w-full bg-background border border-white/5 rounded-2xl px-6 py-4 text-white focus:border-primary outline-none transition-all font-bold"
                  />
                </div>
              </div>
            </div>
          ) : activeSection === 'subscription' ? (
            <Subscription 
              session={session} 
              tenantData={tenantData} 
              onPlanUpdated={onRefresh || (() => {})} 
              onlyCurrentPlan={true} 
              setActiveTab={setActiveTab}
            />
          ) : activeSection === 'whatsapp' ? (
            <WhatsAppConfig />
          ) : null}

          {activeSection === 'profile' && (
            <>
              <div className="flex flex-col items-center gap-4 pt-4">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-red-500 font-black uppercase tracking-widest text-xs bg-red-500/10 px-4 py-2 rounded-xl border border-red-500/20"
                  >
                    {error}
                  </motion.div>
                )}
                {showSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Configurações Salvas com Sucesso!
                  </motion.div>
                )}
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className={cn(
                    "bg-primary text-background px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-2xl shadow-primary/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50",
                    showSuccess && "bg-green-500 text-white shadow-green-500/20"
                  )}
                >
                  {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : (showSuccess ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />)}
                  {isSaving ? 'Salvando...' : (showSuccess ? 'Salvo!' : 'Salvar Preferências')}
                </button>
              </div>

              <div className="card-luxury p-6 border-red-500/20 bg-red-500/5 max-w-md mx-auto w-full">
                <h3 className="text-xl font-black text-red-500 mb-1">Zona de Perigo</h3>
                <p className="text-sm text-gray-400 font-medium mb-6">Ações irreversíveis que afetam sua conta e dados do terreiro.</p>
                <button className="bg-red-500/10 text-red-500 border border-red-500/20 px-6 py-3 rounded-xl font-black hover:bg-red-500 hover:text-white transition-all text-sm w-full">
                  Excluir Conta Permanentemente
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {activeSection === 'subscription' && (
        <div className="mt-12 w-full">
          <Subscription 
            session={session} 
            tenantData={tenantData} 
            onPlanUpdated={onRefresh || (() => {})} 
            onlyAvailablePlans={true} 
            setActiveTab={setActiveTab}
          />
        </div>
      )}
    </div>
  );
}
