/**
 * Lógica compartilhada entre `server.ts` e `api/index.ts` para mensalidades do zelador.
 * Recebe `supabaseAdmin` e `resolveLeaderId` injetados.
 */

import { computeProximaDataMensalidadePrevisao } from './mensalidadeDueDate';

export type MensalidadeZeladorRow = {
  id: string;
  filho_id: string | null;
  valor: number;
  data: string;
  data_vencimento?: string | null;
  status: string | null;
  descricao: string | null;
  categoria: string | null;
  tipo?: string | null;
  filhos_de_santo?: { nome: string } | null;
};

export async function assertZeladorTenantAccess(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data: prof } = await supabaseAdmin
    .from('perfil_lider')
    .select('id, tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (!prof) return false;
  const a = await resolveLeaderId(tenantId);
  const b = await resolveLeaderId(String(prof.tenant_id || prof.id));
  return a === b;
}

export async function hasPaidMensalidadeInCalendarMonth(
  supabaseAdmin: any,
  filhoId: string,
  ref: Date
): Promise<boolean> {
  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const { data, error } = await supabaseAdmin
    .from('financeiro')
    .select('id, status, categoria, tipo')
    .eq('filho_id', filhoId)
    .eq('categoria', 'Mensalidade')
    .gte('data', start)
    .lte('data', endStr);
  if (error) return false;
  for (const r of data || []) {
    const st = String((r as any).status || '').toLowerCase();
    if (st === 'pendente' || st === 'excluido') continue;
    const tipo = String((r as any).tipo || '').toLowerCase();
    if (tipo === 'entrada' || tipo === 'receita' || tipo === '') return true;
  }
  return false;
}

export async function fetchMensalidadesPendentesList(
  supabaseAdmin: any,
  tenantId: string
): Promise<MensalidadeZeladorRow[]> {
  const { data, error } = await supabaseAdmin
    .from('financeiro')
    .select('*, filhos_de_santo(nome)')
    .or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`)
    .eq('categoria', 'Mensalidade')
    .eq('status', 'pendente')
    .order('data', { ascending: true });
  if (error) throw error;
  return (data || []) as MensalidadeZeladorRow[];
}

export async function fetchMensalidadesPagasMesAtual(
  supabaseAdmin: any,
  tenantId: string,
  ref: Date = new Date()
): Promise<MensalidadeZeladorRow[]> {
  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const { data, error } = await supabaseAdmin
    .from('financeiro')
    .select('*, filhos_de_santo(nome)')
    .or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`)
    .eq('categoria', 'Mensalidade')
    .eq('status', 'pago')
    .gte('data', start)
    .lte('data', endStr)
    .order('data', { ascending: false });
  if (error) throw error;
  return (data || []) as MensalidadeZeladorRow[];
}

export async function syncMensalidadesPendentes(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string
): Promise<{ created: number }> {
  const resolvedTenant = await resolveLeaderId(tenantId);
  let dia = 10;
  let valorPadrao = 89.9;
  const { data: pix } = await supabaseAdmin
    .from('configuracoes_pix')
    .select('valor_mensalidade, dia_vencimento')
    .or(`terreiro_id.eq.${resolvedTenant},terreiro_id.eq.${tenantId}`)
    .maybeSingle();
  if (pix) {
    dia = parseInt(String(pix.dia_vencimento), 10) || 10;
    valorPadrao = Number(pix.valor_mensalidade) || valorPadrao;
  }

  const { data: children, error: chErr } = await supabaseAdmin
    .from('filhos_de_santo')
    .select('id, nome, tenant_id, lider_id, created_at, data_entrada')
    .or(`tenant_id.eq.${tenantId},tenant_id.eq.${resolvedTenant}`);
  if (chErr) throw chErr;
  const rows = (children || []).filter((c: any) => {
    const same =
      c.tenant_id === tenantId ||
      c.tenant_id === resolvedTenant ||
      c.lider_id === userId ||
      c.lider_id === tenantId ||
      c.lider_id === resolvedTenant;
    return same;
  });

  const ref = new Date();
  let created = 0;
  for (const child of rows) {
    const fid = child.id as string;
    const { data: pend } = await supabaseAdmin
      .from('financeiro')
      .select('id')
      .eq('filho_id', fid)
      .eq('categoria', 'Mensalidade')
      .eq('status', 'pendente')
      .limit(1);
    if (pend && pend.length > 0) continue;
    const paid = await hasPaidMensalidadeInCalendarMonth(supabaseAdmin, fid, ref);
    if (paid) continue;

    const inc = child.data_entrada || child.created_at;
    const dueStr = computeProximaDataMensalidadePrevisao(inc, dia, ref);
    const nome = String(child.nome || 'Filho').trim() || 'Filho';
    const insert: Record<string, unknown> = {
      tipo: 'entrada',
      valor: valorPadrao,
      categoria: 'Mensalidade',
      data: dueStr,
      descricao: `Mensalidade - ${nome} (vencimento ${dueStr}) (ID:${fid})`,
      status: 'pendente',
      tenant_id: tenantId,
      lider_id: userId,
      filho_id: fid,
      data_vencimento: dueStr,
    };
    let { error: insErr } = await supabaseAdmin.from('financeiro').insert([insert]);
    if (insErr && String(insErr.message || '').includes('data_vencimento')) {
      delete insert.data_vencimento;
      const r2 = await supabaseAdmin.from('financeiro').insert([insert]);
      insErr = r2.error;
    }
    if (!insErr) created += 1;
  }
  return { created };
}

async function loadFinanceiroRow(supabaseAdmin: any, id: string) {
  const { data, error } = await supabaseAdmin.from('financeiro').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as any;
}

function rowTenantMatches(row: any, tenantId: string, resolvedTenant: string, userId: string): boolean {
  return (
    row.tenant_id === tenantId ||
    row.tenant_id === resolvedTenant ||
    row.lider_id === tenantId ||
    row.lider_id === resolvedTenant ||
    row.lider_id === userId
  );
}

export async function liquidarMensalidadePendente(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string,
  financeiroId: string,
  valorOverride?: number
): Promise<{ ok: true }> {
  const row = await loadFinanceiroRow(supabaseAdmin, financeiroId);
  if (!row) throw new Error('Lançamento não encontrado');
  const resolved = await resolveLeaderId(tenantId);
  if (!rowTenantMatches(row, tenantId, resolved, userId)) {
    throw new Error('Sem permissão para este lançamento');
  }
  const st = String(row.status || '').toLowerCase();
  if (st !== 'pendente') throw new Error('Este registro não está pendente');
  if (String(row.categoria || '') !== 'Mensalidade') throw new Error('Tipo de lançamento inválido');

  const paymentDate = new Date().toISOString().split('T')[0];
  const v = Number.isFinite(valorOverride) && (valorOverride as number) > 0 ? (valorOverride as number) : Number(row.valor) || 0;
  if (v <= 0) throw new Error('Valor inválido');

  const filhoId = row.filho_id as string;
  const { data: child } = await supabaseAdmin
    .from('filhos_de_santo')
    .select('nome')
    .eq('id', filhoId)
    .maybeSingle();
  const nome = String(child?.nome || 'Filho').trim() || 'Filho';
  const comp = String(row.data_vencimento || row.data || paymentDate).slice(0, 10);

  const { error: upErr } = await supabaseAdmin
    .from('financeiro')
    .update({
      status: 'pago',
      tipo: 'entrada',
      valor: v,
      data: paymentDate,
      descricao: `Mensalidade - ${nome} (competência ${comp}) (ID:${filhoId})`,
    })
    .eq('id', financeiroId)
    .eq('status', 'pendente');
  if (upErr) throw upErr;
  return { ok: true };
}

export async function estornarMensalidadePaga(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string,
  financeiroId: string,
  ref: Date = new Date()
): Promise<{ ok: true }> {
  const row = await loadFinanceiroRow(supabaseAdmin, financeiroId);
  if (!row) throw new Error('Lançamento não encontrado');
  const resolved = await resolveLeaderId(tenantId);
  if (!rowTenantMatches(row, tenantId, resolved, userId)) {
    throw new Error('Sem permissão para este lançamento');
  }
  const st = String(row.status || '').toLowerCase();
  if (st !== 'pago') throw new Error('Apenas mensalidades marcadas como pagas podem ser estornadas');
  if (String(row.categoria || '') !== 'Mensalidade') throw new Error('Tipo de lançamento inválido');

  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  const payDay = String(row.data || '').slice(0, 10);
  if (payDay < start || payDay > endStr) {
    throw new Error('Só é possível estornar pagamentos registrados no mês atual');
  }

  const due = String(row.data_vencimento || row.data || payDay).slice(0, 10);
  const filhoId = row.filho_id as string;
  const { data: child } = await supabaseAdmin
    .from('filhos_de_santo')
    .select('nome')
    .eq('id', filhoId)
    .maybeSingle();
  const nome = String(child?.nome || 'Filho').trim() || 'Filho';

  const { error: upErr } = await supabaseAdmin
    .from('financeiro')
    .update({
      status: 'pendente',
      tipo: 'entrada',
      data: due,
      descricao: `Mensalidade - ${nome} (vencimento ${due}) (ID:${filhoId})`,
    })
    .eq('id', financeiroId)
    .eq('status', 'pago');
  if (upErr) throw upErr;
  return { ok: true };
}
