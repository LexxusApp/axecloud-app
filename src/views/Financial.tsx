import React, { useState, useEffect, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { DollarSign, TrendingUp, TrendingDown, PieChart, Download, Plus, ArrowUpRight, ArrowDownRight, CreditCard, Loader2, X, CheckCircle2, MessageCircle, Lock, Smartphone, Bell, Target, Save, Undo2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import LuxuryLoading from '../components/LuxuryLoading';
import FinanceiroBasico from '../components/FinanceiroBasico';
import PageHeader from '../components/PageHeader';
import BodyPortal from '../components/BodyPortal';
import { hasPlanAccess } from '../constants/plans';
import {
  countsTowardSaldo,
  normalizeMovimentoTipo,
  parseFinanceiroDataRef,
} from '../lib/financeiroSaldo';
import { resolveTenantIdForFinance } from '../lib/tenantCache';
import { MODAL_DLG_DONE, MODAL_DLG_IN, MODAL_DLG_OUT, MODAL_PANEL_DONE, MODAL_PANEL_IN, MODAL_PANEL_OUT, MODAL_TW } from '../lib/modalMotion';

type MensalidadeZeladorRow = {
  id: string;
  filho_id: string | null;
  valor: number;
  data: string;
  data_vencimento?: string | null;
  status: string | null;
  descricao: string | null;
  categoria: string | null;
  tipo?: string | null;
  created_at?: string | null;
  filhos_de_santo?: { nome: string } | null;
};

const FINANCE_UPDATED_EVENT = 'axecloud:finance-updated';

/** Alinha status do financeiro (pt) com filtros de aba pending/paid. */
function mensalidadeStatusIsPending(status: string | null) {
  const t = String(status ?? '').toLowerCase();
  return t === 'pendente' || t === 'pending';
}
function mensalidadeStatusIsPaid(status: string | null) {
  const t = String(status ?? '').toLowerCase();
  return t === 'pago' || t === 'paid';
}

/** Legado sem coluna `status`: vínculo do filho em `... (ID:uuid)` na descrição (igual ao servidor). */
function extractFilhoIdFromMensalidadeDescricao(descricao: string | null | undefined): string | null {
  const m = String(descricao || '').match(/\(ID:([0-9a-fA-F-]{36})\)/);
  return m ? m[1].toLowerCase() : null;
}

function deriveMensalidadeFilhoIdUi(row: MensalidadeZeladorRow): string | null {
  const direct = row?.filho_id;
  if (direct != null && String(direct).trim() !== '') return String(direct).trim().toLowerCase();
  return extractFilhoIdFromMensalidadeDescricao(row?.descricao);
}

function financeiroRawParaYmdIso(raw: string | null | undefined): string | null {
  const s = raw != null ? String(raw).trim() : '';
  if (!s) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (iso) return iso[1];
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return null;
}

function mensalidadeYmdPreferVenc(row: MensalidadeZeladorRow): string | null {
  return financeiroRawParaYmdIso(row.data_vencimento) ?? financeiroRawParaYmdIso(row.data);
}

/** Uma linha por filho + mês (alinhado ao servidor; cobre respostas antigas sem dedupe). */
function dedupeMensalidadesPorFilhoMesClient(rows: MensalidadeZeladorRow[]): MensalidadeZeladorRow[] {
  const byKey = new Map<string, MensalidadeZeladorRow>();
  for (const row of rows) {
    const fid = deriveMensalidadeFilhoIdUi(row);
    if (!fid) continue;
    const ymd = mensalidadeYmdPreferVenc(row);
    const mk = ymd && ymd.length >= 7 ? ymd.slice(0, 7) : '';
    const k = `${fid}|${mk}`;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, row);
      continue;
    }
    const ta = new Date(String((prev as MensalidadeZeladorRow).created_at || '')).getTime();
    const tb = new Date(String((row as MensalidadeZeladorRow).created_at || '')).getTime();
    if (tb > ta || (tb === ta && String(row.id) > String(prev.id))) byKey.set(k, row);
  }
  return Array.from(byKey.values());
}

function rowIsMensalidadePendenteLegacy(row: MensalidadeZeladorRow): boolean {
  if (String(row.categoria || '') !== 'Mensalidade' || !deriveMensalidadeFilhoIdUi(row)) return false;
  return String(row.descricao || '').toLowerCase().includes('(vencimento');
}

function rowIsMensalidadePagaLegacy(row: MensalidadeZeladorRow): boolean {
  if (String(row.categoria || '') !== 'Mensalidade' || !deriveMensalidadeFilhoIdUi(row)) return false;
  if (rowIsMensalidadePendenteLegacy(row)) return false;
  const d = String(row.descricao || '').toLowerCase();
  const tipo = String(row.tipo || '').toLowerCase();
  return (
    d.includes('(competência') ||
    d.includes('(competencia') ||
    tipo === 'entrada' ||
    tipo === 'receita' ||
    tipo === ''
  );
}

/** Aba Pendentes: coluna status OU legado por texto na descrição (API já filtra mês; UI não pode descartar status null). */
function mensalidadeRowIsPendenteForTabs(row: MensalidadeZeladorRow): boolean {
  if (mensalidadeStatusIsPaid(row.status)) return false;
  if (mensalidadeStatusIsPending(row.status)) return true;
  const st = String(row.status ?? '').trim().toLowerCase();
  if (st === 'confirmado') return false;
  if (st !== '') return false;
  return rowIsMensalidadePendenteLegacy(row);
}

/** Aba Pagas: coluna status OU legado (competência / entrada). */
function mensalidadeRowIsPagaForTabs(row: MensalidadeZeladorRow): boolean {
  if (mensalidadeStatusIsPending(row.status)) return false;
  if (mensalidadeStatusIsPaid(row.status)) return true;
  const st = String(row.status ?? '').trim().toLowerCase();
  if (st === 'confirmado') return true;
  if (st !== '') return false;
  return rowIsMensalidadePagaLegacy(row);
}

interface Transaction {
  id: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  categoria: string;
  data: string;
  descricao: string;
  filho_id?: string;
  status?: string | null;
  created_at?: string | null;
}

interface FinancialProps {
  userRole?: string;
  userId?: string;
  tenantData?: any;
  isAdminGlobal?: boolean;
  setActiveTab: (tab: string) => void;
  isSessionReady?: boolean;
}

export default function Financial({ userRole, userId, tenantData, isAdminGlobal, setActiveTab, isSessionReady = false }: FinancialProps) {
  // Não-filhos são sempre gestores do terreiro (admin, vita, cortesia, premium, oro, axe).
  // O plano controla QUAIS funções de gestão estão disponíveis (via hasPlanAccess), não SE o usuário é gestor.
  const isAdmin = userRole !== 'filho';
  const tenantId = useMemo(
    () => resolveTenantIdForFinance(tenantData?.tenant_id, userId),
    [tenantData?.tenant_id, userId]
  );
  const plan = tenantData?.plan?.toLowerCase().trim();
  const isAxePlan = plan === 'axe' || plan === 'free';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [children, setChildren] = useState<any[]>([]);
  const [activeView, setActiveView] = useState<'overview' | 'mensalidades' | 'caixinha' | 'configs'>('overview');
  const [mensalidadesTab, setMensalidadesTab] = useState<'pendentes' | 'pagas'>('pendentes');
  const [mensalidades, setMensalidades] = useState<MensalidadeZeladorRow[]>([]);
  const [mensalidadesValorEdits, setMensalidadesValorEdits] = useState<Record<string, string>>({});
  const [mensalidadesLoading, setMensalidadesLoading] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // Pix Config State
  const [pixConfig, setPixConfig] = useState({
    chave_pix: '',
    tipo_chave: 'cpf',
    nome_beneficiario: '',
    valor_mensalidade: '89.90',
    dia_vencimento: '10'
  });
  const [isSavingPix, setIsSavingPix] = useState(false);

  // Caixinha state
  const [metas, setMetas] = useState<any[]>([]);
  const [pendingDonations, setPendingDonations] = useState<any[]>([]);
  const [isMetaModalOpen, setIsMetaModalOpen] = useState(false);
  const [metaFormData, setMetaFormData] = useState({ titulo: '', valor_alvo: '' });
  const [qrCodeFile, setQrCodeFile] = useState<string | null>(null);

  const hasMensalidadesAccess = hasPlanAccess(tenantData?.plan, 'financial_whatsapp', isAdminGlobal);
  const hasReportsAccess = hasPlanAccess(tenantData?.plan, 'financial_reports', isAdminGlobal);
  const hasCaixinhaAccess = hasPlanAccess(tenantData?.plan, 'caixinha', isAdminGlobal);

  // Form state
  const [formData, setFormData] = useState({
    tipo: 'entrada' as 'entrada' | 'saida',
    valor: '',
    categoria: '',
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    filho_id: ''
  });

  const financialTxKey =
    userId && tenantId && isSessionReady && !(isAxePlan && userRole !== 'filho')
      ? (['financial-transactions', tenantId, userId, userRole] as const)
      : null;

  const { data: txJson, isLoading: txLoading, mutate: mutateTransactions } = useSWR(
    financialTxKey,
    async ([, tid, uid, role]) => {
      const response = await fetch(
        `/api/transactions?tenantId=${encodeURIComponent(tid)}&userId=${encodeURIComponent(uid)}&userRole=${encodeURIComponent(String(role))}&limit=200`
      );
      if (!response.ok) throw new Error('Failed to fetch transactions');
      return response.json() as Promise<{ data?: any[] }>;
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: true,
      dedupingInterval: 0,
      errorRetryCount: 1,
    }
  );

  useEffect(() => {
    if (!txJson?.data) return;
    const rows = (txJson.data || []).map((t: any) => ({
      ...t,
      valor: Number(t.valor) || 0,
    }));
    setTransactions(rows);
    let entradas = 0;
    let saidas = 0;
    for (const t of rows) {
      if (!countsTowardSaldo(t)) continue;
      const v = Number(t.valor) || 0;
      const mt = normalizeMovimentoTipo(t.tipo);
      if (mt === 'entrada') entradas += v;
      else if (mt === 'saida') saidas += v;
    }
    const saldoRecuperado = entradas - saidas;
    console.log('[FinanceDebug][Financial]', {
      userId,
      tenantIdEfetivo: tenantId || '(vazio)',
      tenantIdDasProps:
        tenantData?.tenant_id != null && String(tenantData.tenant_id).trim() !== ''
          ? tenantData.tenant_id
          : '(vazio)',
      saldoRecuperado,
      txCount: rows.length,
    });
  }, [txJson, userId, tenantId, tenantData?.tenant_id]);

  const loading = Boolean(financialTxKey && txLoading && !txJson);

  useEffect(() => {
    if (isAxePlan && userRole !== 'filho') return;
    if (isAdmin) {
      void fetchMensalidadesGrid();
      if (hasCaixinhaAccess) {
        fetchCaixinhaData();
      }
    }
  }, [userRole, userId, isAxePlan, hasCaixinhaAccess, tenantId]);

  /** Pix + lista de filhos (modal de lançamento / configs). Mensalidades pendentes vêm da API (status pendente ou legado com "(vencimento" na descrição). */
  async function fetchMensalidadesGrid() {
    let dia = parseInt(pixConfig.dia_vencimento, 10) || 10;
    let valorPadrao = pixConfig.valor_mensalidade || '89.90';
    try {
      const res = await fetch(`/api/v1/financial/pix-config?tenantId=${encodeURIComponent(tenantId || '')}`);
      if (res.ok) {
        const { data } = await res.json();
        if (data) {
          dia = parseInt(String(data.dia_vencimento), 10) || 10;
          valorPadrao = data.valor_mensalidade?.toString() || '89.90';
          setPixConfig({
            chave_pix: data.chave_pix || '',
            tipo_chave: data.tipo_chave || 'cpf',
            nome_beneficiario: data.nome_beneficiario || '',
            valor_mensalidade: valorPadrao,
            dia_vencimento: String(dia),
          });
        }
      }
    } catch (error) {
      console.error('Error fetching pix config:', error);
    }

    try {
      let query = supabase.from('filhos_de_santo').select('id, nome, created_at, data_entrada');
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data } = await query;
      setChildren(data || []);
    } catch (error) {
      console.error('Error fetching children for mensalidades:', error);
      setChildren([]);
    }
  }

  const refreshMensalidades = useCallback(async (opts?: { skipSync?: boolean }) => {
    if (!tenantId) return;
    setMensalidadesLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const skipSync = opts?.skipSync === true;
      if (!skipSync) {
        await fetch('/api/v1/financial/mensalidades/sync-pendentes', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        });
      }
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const base = `/api/v1/financial/mensalidades?tenantId=${encodeURIComponent(tenantId)}`;
      const [rPen, rPag] = await Promise.all([
        fetch(`${base}&view=pendentes`, { headers }),
        fetch(`${base}&view=pagas`, { headers }),
      ]);
      const jPen = await rPen.json().catch(() => ({}));
      const jPag = await rPag.json().catch(() => ({}));
      if (!rPen.ok) throw new Error(String(jPen.error || 'Falha ao carregar pendentes'));
      if (!rPag.ok) throw new Error(String(jPag.error || 'Falha ao carregar pagas'));
      const pen = dedupeMensalidadesPorFilhoMesClient((jPen.data || []) as MensalidadeZeladorRow[]);
      const pag = (jPag.data || []) as MensalidadeZeladorRow[];
      const byId = new Map<string, MensalidadeZeladorRow>();
      for (const r of pen) byId.set(r.id, r);
      for (const r of pag) byId.set(r.id, r);
      setMensalidades([...byId.values()]);
    } catch (e) {
      console.error('refreshMensalidades:', e);
      setMensalidades([]);
    } finally {
      setMensalidadesLoading(false);
    }
  }, [tenantId]);

  const mensalidadesPendentes = useMemo(
    () => mensalidades.filter((r) => mensalidadeRowIsPendenteForTabs(r)),
    [mensalidades]
  );
  const mensalidadesPagas = useMemo(
    () => mensalidades.filter((r) => mensalidadeRowIsPagaForTabs(r)),
    [mensalidades]
  );

  useEffect(() => {
    if (!isAdmin || isAxePlan || !tenantId) return;
    if (activeView !== 'mensalidades') return;
    void refreshMensalidades();
  }, [activeView, tenantId, isAdmin, isAxePlan, refreshMensalidades]);

  useEffect(() => {
    if (!isAdmin || isAxePlan || !tenantId) return;
    if (activeView !== 'mensalidades') return;
    const onWindowFocus = () => {
      void refreshMensalidades({ skipSync: true });
    };
    window.addEventListener('focus', onWindowFocus);
    return () => window.removeEventListener('focus', onWindowFocus);
  }, [activeView, tenantId, isAdmin, isAxePlan, refreshMensalidades]);

  useEffect(() => {
    if (!isAdmin || isAxePlan || !tenantId) return;
    if (activeView !== 'mensalidades') return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribeTimer = window.setTimeout(() => {
      channel = supabase
        .channel(`mensalidades_financeiro_${tenantId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'financeiro',
            filter: `tenant_id=eq.${tenantId}`,
          },
          () => {
            void refreshMensalidades({ skipSync: true });
            void mutateTransactions();
            window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
          }
        )
        .subscribe();
    }, 0);

    return () => {
      window.clearTimeout(subscribeTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [activeView, tenantId, isAdmin, isAxePlan, refreshMensalidades, mutateTransactions]);

  async function handleSavePixConfig(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingPix(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/v1/financial/pix-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          terreiro_id: tenantId,
          chave_pix: pixConfig.chave_pix,
          tipo_chave: pixConfig.tipo_chave,
          nome_beneficiario: pixConfig.nome_beneficiario,
          valor_mensalidade: parseFloat(pixConfig.valor_mensalidade) || 0,
          dia_vencimento: parseInt(pixConfig.dia_vencimento) || 10
        })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erro ao salvar');
      alert('✅ Configurações financeiras salvas com sucesso!');
      if (activeView === 'mensalidades') {
        void refreshMensalidades();
      }
    } catch (error: any) {
      console.error('Error saving pix config:', error);
      alert('Erro ao salvar configurações Pix: ' + (error.message || ''));
    } finally {
      setIsSavingPix(false);
    }
  }

  async function fetchCaixinhaData() {
    try {
      const { data: metasData } = await supabase
        .from('caixinha_metas')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      
      setMetas(metasData || []);

      const { data: donationsData } = await supabase
        .from('caixinha_doacoes')
        .select('*, filhos_de_santo(nome)')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false });
      
      setPendingDonations(donationsData || []);
    } catch (error) {
      console.error('Error fetching caixinha data:', error);
    }
  }

  async function handleCreateMeta(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('caixinha_metas')
        .insert([{
          tenant_id: tenantId,
          titulo: metaFormData.titulo,
          valor_alvo: parseFloat(metaFormData.valor_alvo),
          qr_code_url: qrCodeFile
        }]);

      if (error) throw error;
      setIsMetaModalOpen(false);
      setMetaFormData({ titulo: '', valor_alvo: '' });
      fetchCaixinhaData();
    } catch (error) {
      console.error('Error creating meta:', error);
      alert('Erro ao criar meta.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleValidateDonation(donationId: string, status: 'confirmado' | 'rejeitado', valor: number, metaId: string) {
    try {
      const { error: updateError } = await supabase
        .from('caixinha_doacoes')
        .update({ status })
        .eq('id', donationId);

      if (updateError) throw updateError;

      if (status === 'confirmado') {
        // Update meta progress
        const meta = metas.find(m => m.id === metaId);
        if (meta) {
          const { error: metaError } = await supabase
            .from('caixinha_metas')
            .update({ valor_atual: (Number(meta.valor_atual) || 0) + valor })
            .eq('id', metaId);
          
          if (metaError) throw metaError;
        }

        // Also add to financial transactions
        await supabase.from('financeiro').insert([{
          tipo: 'entrada',
          valor: valor,
          categoria: 'Doação Caixinha',
          data: new Date().toISOString().split('T')[0],
          descricao: `Doação Caixinha - Meta: ${metas.find(m => m.id === metaId)?.titulo}`,
          tenant_id: tenantId,
          lider_id: userId
        }]);
      }

      fetchCaixinhaData();
      fetchTransactions();
    } catch (error) {
      console.error('Error validating donation:', error);
      alert('Erro ao processar doação.');
    }
  }

  // Se for plano Axe, renderiza o componente simplificado (Exceto para Filhos de Santo que têm acesso livre para visualização)
  if (isAxePlan && userRole !== 'filho') {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader 
          title={<>Gestão <span className="text-primary">Financeira</span></>}
          subtitle="Controle simplificado de fluxo de caixa."
          tenantData={tenantData}
          setActiveTab={setActiveTab}
        />
        <div className="flex-1 px-4 md:px-6 lg:px-10 pb-20 max-w-[1440px] mx-auto w-full space-y-8">
          <FinanceiroBasico tenantId={tenantId} userId={userId} />
        </div>
      </div>
    );
  }

  async function handleDownloadReport() {
    if (!hasReportsAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }

    try {
      // Basic CSV Export
      const headers = ['Data', 'Tipo', 'Categoria', 'Valor', 'Descrição'];
      const csvContent = [
        headers.join(','),
        ...transactions.map(t => [
          new Date(t.data).toLocaleDateString('pt-BR'),
          t.tipo.toUpperCase(),
          t.categoria,
          t.valor.toFixed(2),
          `"${t.descricao.replace(/"/g, '""')}"`
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Libera o blob da memória após o clique
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Error downloading report:', error);
      alert('Erro ao gerar relatório.');
    }
  }

  async function handleMensalidadeLiquidar(row: MensalidadeZeladorRow) {
    if (!tenantId || !row.filho_id) return;
    const valorStr = mensalidadesValorEdits[row.id] ?? String(row.valor ?? '');
    const valor = parseFloat(valorStr);
    if (!Number.isFinite(valor) || valor <= 0) {
      alert('Informe um valor válido para a mensalidade.');
      return;
    }

    const backup = mensalidades;
    const paymentDate = new Date().toISOString().split('T')[0];
    setMensalidades((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, status: 'pago', valor, data: paymentDate } : r
      )
    );
    window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão inválida');
      const res = await fetch('/api/v1/financial/mensalidades/liquidar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: row.id,
          tenant_id: tenantId,
          valor,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body.error || 'Falha ao marcar como pago'));
      await fetchTransactions({ silent: true });
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
    } catch (error: any) {
      console.error('Error liquidar mensalidade:', error);
      setMensalidades(backup);
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
      alert(error?.message || 'Erro ao registrar pagamento.');
    }
  }

  async function handleMensalidadeEstornar(row: MensalidadeZeladorRow) {
    if (!tenantId) return;
    if (!confirm('Estornar este pagamento? A mensalidade voltará para pendentes.')) return;
    const backup = mensalidades;
    const due = String(row.data_vencimento || row.data || '').slice(0, 10);
    setMensalidades((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, status: 'pendente', data: due || r.data } : r
      )
    );
    window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sessão inválida');
      const res = await fetch('/api/v1/financial/mensalidades/estornar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: row.id, tenant_id: tenantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(body.error || 'Falha ao estornar'));
      await fetchTransactions({ silent: true });
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
    } catch (error: any) {
      console.error('Error estornar mensalidade:', error);
      setMensalidades(backup);
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
      alert(error?.message || 'Erro ao estornar.');
    }
  }

  async function handleGerarCobranca(childId: string, nome: string, competenciaIso: string, valorExibicao: string) {
    if (!hasMensalidadesAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }

    try {
      const [year, month] = competenciaIso.split('-');
      const mesAno = `${month}/${year}`;

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          tipo: 'cobranca_mensalidade',
          filhoId: childId,
          variables: {
            nome_filho: nome,
            mes_ano: mesAno,
            valor: valorExibicao,
            nome_terreiro: tenantData?.nome || 'Nosso Terreiro',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to send message');
      alert('✅ Cobrança Enviada com Sucesso para o WhatsApp!');
    } catch (error) {
      console.error('Error sending cobranca:', error);
      alert('Erro ao enviar cobrança.');
    }
  }

  async function fetchTransactions(_opts?: { silent?: boolean }) {
    if (!financialTxKey) return;
    try {
      await mutateTransactions();
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { filho_id, ...otherFormData } = formData;
      const insertData: any = {
        ...otherFormData,
        valor: parseFloat(formData.valor) || 0,
        lider_id: user.id,
        tenant_id: tenantId
      };

      // Salvamos o ID do filho na descrição como contingência se a coluna filho_id não existir
      if (filho_id) {
        const filhoNome = children.find(c => c.id === filho_id)?.nome || 'Filho';
        insertData.descricao = `${formData.descricao || 'Lançamento'} - ${filhoNome} (ID:${filho_id})`;
      }

      const { error } = await supabase
        .from('financeiro')
        .insert([insertData]);

      if (error) throw error;
      
      setIsModalOpen(false);
      setFormData({
        tipo: 'entrada',
        valor: '',
        categoria: '',
        data: new Date().toISOString().split('T')[0],
        descricao: '',
        filho_id: ''
      });
      fetchTransactions();
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('Erro ao realizar lançamento financeiro.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.')) return;

    const backup = transactions;
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }
      const res = await fetch(`/api/transactions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      let body: Record<string, unknown> = {};
      try {
        body = (await res.json()) as Record<string, unknown>;
      } catch {
        /* resposta vazia */
      }
      if (!res.ok) {
        console.error('[Financial] Exclusão do lançamento falhou (resposta do servidor):', {
          id,
          httpStatus: res.status,
          payload: body,
          mensagem: body?.error || body?.message,
        });
        throw new Error(String(body?.error || body?.message || `Erro HTTP ${res.status}`));
      }
      await fetchTransactions({ silent: true });
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
    } catch (error: unknown) {
      const err = error as { message?: string; name?: string; stack?: string };
      console.error('[Financial] Erro ao excluir lançamento:', {
        id,
        message: err?.message,
        name: err?.name,
        stack: err?.stack,
        error,
      });
      setTransactions(backup);
      window.dispatchEvent(new Event(FINANCE_UPDATED_EVENT));
      alert(err?.message || 'Erro ao excluir lançamento.');
    }
  }

  const stats = useMemo(() => {
    return transactions.reduce((acc, curr) => {
      if (!countsTowardSaldo(curr)) return acc;
      const valor = Number(curr.valor) || 0;
      const mt = normalizeMovimentoTipo(curr.tipo);
      if (mt === 'entrada') acc.entradas += valor;
      else if (mt === 'saida') acc.saidas += valor;
      return acc;
    }, { entradas: 0, saidas: 0 });
  }, [transactions]);

  const saldo = useMemo(() => stats.entradas - stats.saidas, [stats]);

  /** Entradas confirmadas agregadas por mês de competência (últimos 12 meses com lançamento). */
  const chartData = useMemo(() => {
    const byMonth: Record<string, number> = {};
    for (const t of transactions) {
      if (!countsTowardSaldo(t)) continue;
      if (normalizeMovimentoTipo(t.tipo) !== 'entrada') continue;
      const d = parseFinanceiroDataRef(t);
      if (!d) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = (byMonth[key] || 0) + (Number(t.valor) || 0);
    }
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([ym, value]) => {
        const [yearStr, monthStr] = ym.split('-');
        const y = Number(yearStr);
        const mo = Number(monthStr);
        const labelDate = new Date(y, mo - 1, 1);
        return {
          name: labelDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
          value,
          tipo: 'entrada' as const,
        };
      });
  }, [transactions]);

  if (loading && transactions.length === 0) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <LuxuryLoading />
      </div>
    );
  }

  return (
    <div className="flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden">
      <PageHeader 
        title={<>{isAdmin ? 'Gestão Financeira' : 'Meu Financeiro'}</>}
        subtitle={isAdmin ? 'Controle de fluxo de caixa e arrecadações.' : 'Acompanhe suas contribuições e mensalidades.'}
        tenantData={tenantData}
        setActiveTab={setActiveTab}
        tabs={
          isAdmin && (
            <div className="flex min-h-[44px] min-w-0 w-full max-w-full flex-nowrap gap-0.5 overflow-x-auto overscroll-x-contain rounded-xl bg-white/5 p-1 touch-pan-x [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <button 
                onClick={() => setActiveView('overview')}
                className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm whitespace-nowrap", activeView === 'overview' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
              >
                Visão Geral
              </button>
              <button 
                onClick={() => setActiveView('mensalidades')}
                className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm whitespace-nowrap flex items-center gap-1.5", activeView === 'mensalidades' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
              >
                Mensalidades
              </button>
              {hasCaixinhaAccess && (
                <button 
                  onClick={() => setActiveView('caixinha')}
                  className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm whitespace-nowrap flex items-center gap-1.5", activeView === 'caixinha' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
                >
                  <span className="hidden sm:inline">Caixinha do Axé</span>
                  <span className="sm:hidden">Caixinha</span>
                  {pendingDonations.length > 0 && (
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  )}
                </button>
              )}
              <button 
                onClick={() => setActiveView('configs')}
                className={cn("shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition-all sm:px-4 sm:py-2.5 sm:text-sm whitespace-nowrap flex items-center gap-1.5", activeView === 'configs' ? "bg-white/10 text-white shadow-lg" : "text-gray-500 hover:text-white")}
              >
                <span className="hidden sm:inline">Configurações</span>
                <span className="sm:hidden">Configs</span>
              </button>
            </div>
          )
        }
        actions={
          isAdmin && (
            <div className="flex shrink-0 gap-2 sm:gap-3">
              <div className="relative group">
                <button 
                  onClick={handleDownloadReport}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-xs font-black transition-all sm:gap-2 sm:px-4 sm:py-3 sm:text-sm",
                    hasReportsAccess 
                      ? "bg-white/5 text-white border-white/10 hover:bg-white/10" 
                      : "bg-white/5 text-white/40 border-border hover:bg-white/10"
                  )}
                >
                  <Download className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                  <span>Relatório</span>
                </button>
                {!hasReportsAccess && (
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[min(280px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] font-bold leading-snug text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:whitespace-nowrap">
                    Relatórios em PDF são exclusivos
                  </div>
                )}
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2.5 text-xs font-black text-background shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] sm:gap-2 sm:px-4 sm:py-3 sm:text-sm"
              >
                <Plus className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" />
                <span className="sm:hidden">Lançar</span>
                <span className="hidden sm:inline">Lançamento</span>
              </button>
            </div>
          )
        }
      />

      <div className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 space-y-8 px-4 pb-20 md:space-y-12 md:px-6 lg:px-10">
        {activeView === 'overview' ? (
        <>
          {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-4">
        <div className="card-luxury p-6 md:p-8 lg:p-5 rounded-3xl border-white/5 bg-gradient-to-br from-emerald-500/10 to-transparent shadow-xl">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="p-3 md:p-4 rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <TrendingUp className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] md:text-xs font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">+15%</span>
          </div>
          <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">Entradas (confirmadas)</p>
          <h3 className="text-3xl md:text-4xl font-black text-white mt-2">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.entradas)}
          </h3>
        </div>

        <div className="card-luxury p-6 md:p-8 rounded-3xl border-white/5 bg-gradient-to-br from-red-500/10 to-transparent shadow-xl">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="p-3 md:p-4 rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20">
              <TrendingDown className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] md:text-xs font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">-5%</span>
          </div>
          <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">Saídas (confirmadas)</p>
          <h3 className="text-3xl md:text-4xl font-black text-white mt-2">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stats.saidas)}
          </h3>
        </div>

        <div className="card-luxury p-6 md:p-8 rounded-3xl border-white/5 bg-gradient-to-br from-primary/10 to-transparent shadow-xl">
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="p-3 md:p-4 rounded-2xl bg-primary/10 text-primary border border-primary/20">
              <DollarSign className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest bg-primary/10 px-3 py-1 rounded-full border border-primary/20">Saldo</span>
          </div>
          <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">Saldo no caixa</p>
          <h3 className="text-3xl md:text-4xl font-black text-white mt-2">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldo)}
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        {/* Chart Section */}
        <div className="lg:col-span-6 space-y-6">
          <div className="card-luxury p-6 md:p-8 h-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
              <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary" />
                Evolução Mensal
              </h3>
              <select className="bg-card border border-border text-gray-400 text-xs md:text-sm font-bold rounded-xl px-4 py-2 focus:outline-none focus:border-primary/50 w-full md:w-auto [&>option]:bg-[#1B1C1C]">
                <option>Últimos 6 meses</option>
                <option>Último ano</option>
              </select>
            </div>
            
            {chartData.length > 0 ? (
              <div className="h-64 md:h-80 w-full" style={{ minHeight: '256px', minWidth: '0' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={256} debounce={50}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333434" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#6B7280', fontSize: 10, fontWeight: 700 }} 
                    />
                    <Tooltip 
                      cursor={{ fill: 'rgba(251,188,0,0.05)' }}
                      contentStyle={{ backgroundColor: '#242525', border: '1px solid #333434', borderRadius: '12px', fontWeight: 700, fontSize: '12px' }}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.tipo === 'entrada' ? '#10B981' : '#EF4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-center px-6">
                <p className="text-xs md:text-sm font-bold text-primary tracking-wide">
                  Gráfico ficará disponível após o primeiro lançamento de entrada ou saída.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Transactions Section */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-primary" />
              Últimos Lançamentos
            </h3>
            <button className="text-sm font-bold text-primary hover:underline">Ver todos</button>
          </div>
          <div className="space-y-4">
            {transactions.map((t) => (
              <div key={t.id} className="card-luxury p-5 flex items-center justify-between group relative">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center border",
                    t.tipo === 'entrada' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                  )}>
                    {t.tipo === 'entrada' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">{t.descricao}</h4>
                    <p className="text-xs text-gray-400 font-medium">{new Date(t.data).toLocaleDateString('pt-BR')} • {t.categoria}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-sm font-black",
                    t.tipo === 'entrada' ? "text-emerald-500" : "text-red-500"
                  )}>
                    {t.tipo === 'entrada' ? '+' : '-'} {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.valor)}
                  </span>
                  {t.categoria === 'Mensalidade' && (t as any).filho_id && (
                    <button 
                      onClick={async () => {
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          await fetch('/api/whatsapp/send', {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${session?.access_token}`
                            },
                            body: JSON.stringify({
                              tipo: 'financeiro',
                              filhoId: (t as any).filho_id,
                              variables: {
                                nome_filho: t.descricao.split(' ').slice(1).join(' ') || 'Filho',
                                valor_mensalidade: t.valor.toString(),
                                data_vencimento: new Date(t.data).toLocaleDateString('pt-BR'),
                                nome_terreiro: tenantData?.nome || 'Nosso Terreiro'
                              }
                            })
                          });
                          alert('✅ Lembrete Enviado com Sucesso!');
                        } catch (e) {
                          console.error('Error sending financial reminder:', e);
                          alert('Erro ao enviar lembrete.');
                        }
                      }}
                      className="p-2 text-primary hover:bg-primary/10 rounded-xl transition-all"
                      title="Enviar Lembrete WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                  <button 
                    onClick={() => handleDelete(t.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-500 transition-all"
                    title="Excluir lançamento"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
        </>
      ) : (
        <div className="space-y-6">
          {activeView === 'mensalidades' ? (
            <div className="card-luxury p-4 sm:p-6 lg:p-8">
              <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-2xl font-black leading-tight text-white sm:text-2xl">Controle de Mensalidades</h3>
                  <p className="mt-1 max-w-lg text-sm font-medium leading-relaxed text-gray-400">
                    Use as abas <span className="text-white/80">Pendentes</span> e <span className="text-white/80">Pagas</span>.
                    Ao marcar como pago, o item sai de pendentes e aparece em pagas na hora.
                  </p>
                </div>
                <div
                  role="tablist"
                  aria-label="Mensalidades por status"
                  className="flex shrink-0 rounded-xl border border-white/10 bg-black/30 p-1"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mensalidadesTab === 'pendentes'}
                    id="tab-mensalidades-pendentes"
                    onClick={() => setMensalidadesTab('pendentes')}
                    className={cn(
                      'rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-all sm:px-5 sm:text-sm',
                      mensalidadesTab === 'pendentes'
                        ? 'bg-primary text-background shadow-lg'
                        : 'text-gray-500 hover:text-white'
                    )}
                  >
                    Pendentes
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mensalidadesTab === 'pagas'}
                    id="tab-mensalidades-pagas"
                    onClick={() => setMensalidadesTab('pagas')}
                    className={cn(
                      'rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest transition-all sm:px-5 sm:text-sm',
                      mensalidadesTab === 'pagas'
                        ? 'bg-primary text-background shadow-lg'
                        : 'text-gray-500 hover:text-white'
                    )}
                  >
                    Pagas
                  </button>
                </div>
              </div>

              {mensalidadesLoading && (
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Atualizando lista…
                </div>
              )}

              {mensalidadesTab === 'pendentes' ? (
                <div role="tabpanel" aria-labelledby="tab-mensalidades-pendentes">
                  {mensalidadesPendentes.length === 0 && !mensalidadesLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-6 py-14 text-center">
                      <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-500" aria-hidden />
                      <p className="text-lg font-black text-white">Tudo em dia!</p>
                      <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-gray-400">
                        Nenhuma mensalidade pendente para este período.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3 sm:hidden">
                        {mensalidadesPendentes.map((row) => {
                          const nome = row.filhos_de_santo?.nome || 'Filho de santo';
                          const fid = row.filho_id || '';
                          const venc = String(row.data_vencimento || row.data || '').slice(0, 10);
                          const valorCampo = mensalidadesValorEdits[row.id] ?? String(row.valor ?? '');
                          return (
                            <div key={row.id} className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <h4 className="min-w-0 flex-1 text-base font-black leading-snug text-white">{nome}</h4>
                                <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">
                                  Pendente
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <label className="space-y-1.5">
                                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Valor (R$)</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={valorCampo}
                                    onChange={(e) =>
                                      setMensalidadesValorEdits((prev) => ({ ...prev, [row.id]: e.target.value }))
                                    }
                                    className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-bold text-white outline-none focus:border-primary"
                                  />
                                </label>
                                <div className="space-y-1.5">
                                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-500">Vencimento</span>
                                  <p className="flex h-11 items-center rounded-lg border border-white/5 bg-black/30 px-3 text-xs font-bold text-gray-300">
                                    {venc ? new Date(`${venc}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleMensalidadeLiquidar(row)}
                                  className="h-10 rounded-lg bg-white/10 text-xs font-black text-white transition-all hover:bg-white/20"
                                >
                                  Pago
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    fid
                                      ? void handleGerarCobranca(fid, nome, venc, valorCampo)
                                      : undefined
                                  }
                                  disabled={!fid}
                                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#25D366]/10 text-xs font-black text-[#25D366] transition-all hover:bg-[#25D366]/20 disabled:opacity-40"
                                  title="Gerar Cobrança WhatsApp"
                                >
                                  <MessageCircle className="h-4 w-4" />
                                  Cobrar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="hidden overflow-x-auto sm:block">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-white/5">
                              <th className="pb-4 text-xs font-black uppercase tracking-widest text-gray-500">Filho</th>
                              <th className="pb-4 text-xs font-black uppercase tracking-widest text-gray-500">Valor (R$)</th>
                              <th className="pb-4 text-xs font-black uppercase tracking-widest text-gray-500">Vencimento</th>
                              <th className="pb-4 text-xs font-black uppercase tracking-widest text-gray-500">Status</th>
                              <th className="pb-4 text-right text-xs font-black uppercase tracking-widest text-gray-500">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {mensalidadesPendentes.map((row) => {
                              const nome = row.filhos_de_santo?.nome || 'Filho de santo';
                              const fid = row.filho_id || '';
                              const venc = String(row.data_vencimento || row.data || '').slice(0, 10);
                              const valorCampo = mensalidadesValorEdits[row.id] ?? String(row.valor ?? '');
                              return (
                                <tr key={row.id} className="group transition-colors hover:bg-white/[0.02]">
                                  <td className="py-4 font-bold text-white">{nome}</td>
                                  <td className="py-4">
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={valorCampo}
                                      onChange={(e) =>
                                        setMensalidadesValorEdits((prev) => ({ ...prev, [row.id]: e.target.value }))
                                      }
                                      className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-white outline-none focus:border-primary"
                                    />
                                  </td>
                                  <td className="py-4 text-sm font-medium text-gray-300">
                                    {venc ? new Date(`${venc}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                                  </td>
                                  <td className="py-4">
                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-400">
                                      Pendente
                                    </span>
                                  </td>
                                  <td className="space-x-2 py-4 text-right">
                                    <button
                                      type="button"
                                      onClick={() => void handleMensalidadeLiquidar(row)}
                                      className="rounded-lg bg-white/10 px-4 py-2 text-xs font-bold text-white transition-all hover:bg-white/20"
                                    >
                                      Pago
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        fid ? void handleGerarCobranca(fid, nome, venc, valorCampo) : undefined
                                      }
                                      disabled={!fid}
                                      className="inline-flex items-center gap-2 rounded-lg bg-[#25D366]/10 px-4 py-2 text-xs font-bold text-[#25D366] transition-all hover:bg-[#25D366]/20 disabled:opacity-40"
                                      title="Gerar Cobrança WhatsApp"
                                    >
                                      <MessageCircle className="h-4 w-4" />
                                      Cobrar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4" role="tabpanel" aria-labelledby="tab-mensalidades-pagas">
                  {mensalidadesPagas.length === 0 && !mensalidadesLoading ? (
                    <p className="rounded-xl border border-white/5 bg-white/[0.03] py-10 text-center text-sm font-medium text-gray-500">
                      Nenhuma mensalidade paga registrada no mês atual.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.03]">
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500">Filho</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500">Valor</th>
                            <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-500">Data do pagamento</th>
                            <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-gray-500">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {mensalidadesPagas.map((row) => {
                            const nome = row.filhos_de_santo?.nome || 'Filho de santo';
                            const pay = String(row.data || '').slice(0, 10);
                            return (
                              <tr key={row.id}>
                                <td className="px-4 py-3 font-bold text-white">{nome}</td>
                                <td className="px-4 py-3 text-sm font-black text-emerald-400">
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                                    Number(row.valor) || 0
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-300">
                                  {pay ? new Date(`${pay}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() => void handleMensalidadeEstornar(row)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-400 transition-colors hover:bg-rose-500/20"
                                  >
                                    <Undo2 className="h-3.5 w-3.5" />
                                    Estornar
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeView === 'caixinha' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-white px-0">Caixinha do Axé</h3>
                  <p className="text-gray-400 font-medium px-0">Gerencie as metas e arrecadações coletivas.</p>
                </div>
                <button 
                  onClick={() => setIsMetaModalOpen(true)}
                  className="bg-primary text-background px-6 py-3 rounded-xl font-black flex items-center gap-2 hover:scale-105 transition-transform"
                >
                  <Plus className="w-5 h-5" />
                  Nova Meta
                </button>
              </div>

              {pendingDonations.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-red-500">
                    <Bell className="w-5 h-5 animate-bounce" />
                    <h4 className="font-black uppercase tracking-widest text-sm">Doações Pendentes de Validação</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingDonations.map(donation => (
                      <div key={donation.id} className="card-luxury p-6 flex flex-col gap-4 border-l-4 border-l-red-500">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Doador</p>
                            <p className="font-bold text-white">{donation.filhos_de_santo?.nome || 'Anônimo'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Valor</p>
                            <p className="font-black text-primary text-lg">R$ {Number(donation.valor).toFixed(2)}</p>
                          </div>
                        </div>
                        {donation.comprovante_url && (
                          <div className="relative group aspect-video rounded-xl overflow-hidden bg-black/40 border border-white/5">
                            <img src={donation.comprovante_url} alt="Comprovante" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <a href={donation.comprovante_url} target="_blank" rel="noopener noreferrer" className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg text-xs font-bold text-white border border-white/10 transition-all hover:bg-white/20">
                                Ver em Tela Cheia
                              </a>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <button onClick={() => handleValidateDonation(donation.id, 'confirmado', Number(donation.valor), donation.meta_id)} className="flex-1 bg-emerald-500 text-white py-3 rounded-xl font-black text-xs hover:bg-emerald-600 transition-colors">
                            Confirmar Recebimento
                          </button>
                          <button onClick={() => handleValidateDonation(donation.id, 'rejeitado', Number(donation.valor), donation.meta_id)} className="px-4 bg-white/5 text-gray-500 py-3 rounded-xl font-black text-xs hover:bg-red-500/10 hover:text-red-500 transition-all">
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-sans">
                {metas.map(meta => {
                  const progress = Math.min((Number(meta.valor_atual) / Number(meta.valor_alvo)) * 100, 100);
                  return (
                    <div key={meta.id} className="card-luxury p-8 space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <Target className="w-6 h-6 text-primary" />
                        </div>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                          meta.status === 'active' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                        )}>
                          {meta.status === 'active' ? 'Em Andamento' : 'Concluída'}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-white mb-1">{meta.titulo}</h4>
                        <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Meta do Terreiro</p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <p className="text-xs font-black text-gray-500 uppercase tracking-widest px-0">Progresso</p>
                          <p className="text-sm font-black text-white px-0">
                            R$ {Number(meta.valor_atual).toFixed(2)} <span className="text-gray-500">/ R$ {Number(meta.valor_alvo).toFixed(2)}</span>
                          </p>
                        </div>
                        <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} className="h-full bg-[#FFD700] shadow-[0_0_15px_rgba(255,215,0,0.3)]" />
                        </div>
                      </div>
                      {meta.qr_code_url && (
                        <div className="pt-4 border-t border-white/5">
                          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">QR Code Pix Configurado</p>
                          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white p-1">
                            <img src={meta.qr_code_url} alt="QR Code" className="w-full h-full object-contain" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-8">
              <div className="card-luxury p-8 space-y-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-white leading-tight">Configurações de Recebimento</h3>
                    <p className="text-xs text-gray-500 font-medium">Defina sua chave Pix para mensalidades e doações.</p>
                  </div>
                </div>
                <form onSubmit={handleSavePixConfig} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] ml-0.5">Mensalidade Padrão</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold">R$</span>
                        <input
                          type="number" step="0.01"
                          value={pixConfig.valor_mensalidade}
                          onChange={(e) => setPixConfig({...pixConfig, valor_mensalidade: e.target.value})}
                          className="w-full bg-background border border-white/5 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm font-bold focus:border-primary outline-none transition-all"
                          placeholder="89,90"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] ml-0.5">Tipo de Chave</label>
                      <select
                        value={pixConfig.tipo_chave}
                        onChange={(e) => setPixConfig({...pixConfig, tipo_chave: e.target.value})}
                        className="w-full bg-background border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm font-bold focus:border-primary outline-none transition-all [&>option]:bg-[#1B1C1C]"
                      >
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="celular">Celular</option>
                        <option value="aleatoria">Aleatória</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] ml-0.5">Chave Pix</label>
                    <input
                      type="text"
                      value={pixConfig.chave_pix}
                      onChange={(e) => setPixConfig({...pixConfig, chave_pix: e.target.value})}
                      className="w-full bg-background border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:border-primary outline-none transition-all"
                      placeholder="Sua chave pix aqui..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] ml-0.5">Nome do Beneficiário</label>
                      <input
                        type="text"
                        value={pixConfig.nome_beneficiario}
                        onChange={(e) => setPixConfig({...pixConfig, nome_beneficiario: e.target.value})}
                        className="w-full bg-background border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:border-primary outline-none transition-all"
                        placeholder="Nome completo ou Razão Social"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.15em] ml-0.5">Dia de Vencimento</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={pixConfig.dia_vencimento}
                          onChange={(e) => setPixConfig({...pixConfig, dia_vencimento: e.target.value})}
                          className="w-full bg-background border border-white/5 rounded-xl px-4 py-2.5 text-white text-sm font-bold focus:border-primary outline-none transition-all"
                          placeholder="10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-600 font-bold">/ mês</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSavingPix}
                      className="inline-flex items-center gap-2 bg-primary text-background px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20"
                    >
                      {isSavingPix ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSavingPix ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Upgrade */}
      <AnimatePresence>
        {isUpgradeModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsUpgradeModalOpen(false)}
              className="absolute inset-0 bg-black/[0.92] backdrop-blur-none"
            />
            <motion.div
              initial={MODAL_PANEL_IN}
              animate={MODAL_PANEL_DONE}
              exit={MODAL_PANEL_OUT}
              transition={MODAL_TW}
              className="relative z-10 w-full space-y-5 rounded-3xl border border-primary/20 bg-[#1B1C1C] px-6 py-8 text-center sm:max-w-md sm:px-10"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-10 h-10 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white">Recurso Exclusivo</h3>
                <p className="text-gray-400 font-medium">
                  A automação de mensagens e relatórios avançados são exclusivos para assinantes do <span className="text-primary font-bold">Plano Premium</span> ou <span className="text-primary font-bold">Plano Vita</span>.
                </p>
              </div>
              <div className="pt-4 space-y-3">
                <button 
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    window.dispatchEvent(new CustomEvent('navigate-to-subscription'));
                  }}
                  className="w-full bg-primary text-background font-black py-4 rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-transform"
                >
                  Fazer Upgrade Agora
                </button>
                <button 
                  onClick={() => setIsUpgradeModalOpen(false)}
                  className="w-full text-gray-500 font-bold py-2 hover:text-white transition-colors"
                >
                  Talvez mais tarde
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Nova Meta */}
      <AnimatePresence>
        {isMetaModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto overscroll-y-contain p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMetaModalOpen(false)}
              className="absolute inset-0 bg-background/[0.94] backdrop-blur-none"
            />
            <motion.div
              initial={MODAL_DLG_IN}
              animate={MODAL_DLG_DONE}
              exit={MODAL_DLG_OUT}
              transition={MODAL_TW}
              className="bg-card border border-white/10 w-full max-w-sm rounded-[2rem] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Target className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white">Nova Meta</h3>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-widest">Caixinha do Axé</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsMetaModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <form onSubmit={handleCreateMeta} className="p-5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto no-scrollbar">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Título da Meta</label>
                    <input
                      required
                      type="text"
                      value={metaFormData.titulo}
                      onChange={(e) => setMetaFormData({ ...metaFormData, titulo: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                      placeholder="Ex: Reforma do Telhado"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Valor Alvo (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={metaFormData.valor_alvo}
                      onChange={(e) => setMetaFormData({ ...metaFormData, valor_alvo: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">QR Code Pix (URL da Imagem)</label>
                    <input
                      type="url"
                      value={qrCodeFile || ''}
                      onChange={(e) => setQrCodeFile(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                      placeholder="https://..."
                    />
                    <p className="text-[10px] text-gray-500 italic ml-1">Insira o link da imagem do seu QR Code Pix pessoal.</p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-primary text-background py-3 sm:py-4 rounded-xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 text-sm sm:text-base cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin mx-auto" />
                    ) : (
                      'Criar Meta Coletiva'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <BodyPortal>
          <div className="fixed inset-0 z-[100] flex min-h-0 items-center justify-center overflow-y-auto overscroll-y-contain p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-background/[0.94] backdrop-blur-none"
            />
            <motion.div
              initial={MODAL_PANEL_IN}
              animate={MODAL_PANEL_DONE}
              exit={MODAL_PANEL_OUT}
              transition={MODAL_TW}
              className="relative z-10 flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-card shadow-2xl sm:max-w-lg"
            >
              <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-white">Novo Lançamento</h3>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-widest">Controle de Caixa</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto no-scrollbar">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'entrada' })}
                    className={cn(
                      "py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm",
                      formData.tipo === 'entrada' 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" 
                        : "bg-white/5 border-white/5 text-gray-500"
                    )}
                  >
                    <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, tipo: 'saida' })}
                    className={cn(
                      "py-3 rounded-xl font-black flex items-center justify-center gap-2 border transition-all text-sm",
                      formData.tipo === 'saida' 
                        ? "bg-red-500/10 border-red-500/30 text-red-500" 
                        : "bg-white/5 border-white/5 text-gray-500"
                    )}
                  >
                    <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5" />
                    Saída
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Valor (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Categoria</label>
                    <select
                      required
                      value={formData.categoria}
                      onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all [&>option]:bg-[#1B1C1C]"
                    >
                      <option value="">Selecione...</option>
                      <option value="Mensalidade">Mensalidade</option>
                      <option value="Doação">Doação</option>
                      <option value="Evento">Evento</option>
                      <option value="Insumos">Insumos</option>
                      <option value="Contas">Contas</option>
                      <option value="Manutenção">Manutenção</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Data</label>
                    <input
                      required
                      type="date"
                      value={formData.data}
                      onChange={(e) => setFormData({ ...formData, data: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Vincular a Filho (Opcional)</label>
                    <select
                      value={formData.filho_id}
                      onChange={(e) => setFormData({ ...formData, filho_id: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all [&>option]:bg-[#1B1C1C]"
                    >
                      <option value="">Nenhum</option>
                      {children.map(c => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest ml-1">Descrição</label>
                    <input
                      required
                      type="text"
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm sm:text-base text-white focus:border-primary outline-none transition-all"
                      placeholder="Ex: Mensalidade João Silva"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3 sm:gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-white/5 hover:bg-white/10 text-white font-black py-3 sm:py-4 rounded-xl transition-all border border-white/5 text-sm sm:text-base"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-primary text-background font-black py-3 sm:py-4 rounded-xl transition-all flex items-center justify-center gap-2 sm:gap-3 shadow-lg shadow-primary/20 hover:scale-[1.02] disabled:opacity-50 text-sm sm:text-base"
                  >
                    {isSubmitting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                    Confirmar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
          </BodyPortal>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
}
