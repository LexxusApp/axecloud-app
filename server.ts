import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import cors from "cors";
import geoip from "geoip-lite";
import webpush from "web-push";
import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
} from "date-fns";

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// VAPID Keys for Web Push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BEKar2pRRjBhX5Pz-EtX1QT07JbDBhSBx_-t5mAPZ3TevskbdG0w9JJNz-TbR-TzuIigtXTg27vCX_8GElZUM7Y";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "QsB2TftnfoqwCo7UhYYmmLMNR2yoorTI-FKjsmgrjA0";

webpush.setVapidDetails(
  "mailto:contato@axecloud.com.br",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// --- Financeiro + mensalidades (inline; mesma lógica que api/index.ts) ---

function normalizeQueryTenantId(raw: unknown): string {
  if (raw == null) return "";
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (!s || s === "undefined" || s === "null" || s === "NaN") return "";
  return s;
}

async function resolveFinanceiroTenantScope(
  supabaseAdmin: { from: (t: string) => any },
  userId: string | undefined,
  userRole: string | undefined,
  tenantFromQuery: string
): Promise<string> {
  const q = normalizeQueryTenantId(tenantFromQuery);
  const role = String(userRole || "").toLowerCase();

  if (q) return q;

  if (!userId) return "";

  const { data: profile } = await supabaseAdmin
    .from("perfil_lider")
    .select("tenant_id, id")
    .eq("id", userId)
    .maybeSingle();

  const fromProfile = String(profile?.tenant_id || "").trim();
  if (fromProfile) return fromProfile;

  const leaderPk = String(profile?.id || "").trim();
  if (role !== "filho" && leaderPk) return leaderPk;

  if (role === "filho") {
    const { data: child } = await supabaseAdmin
      .from("filhos_de_santo")
      .select("lider_id, tenant_id")
      .eq("user_id", userId)
      .maybeSingle();
    const ref = String(child?.lider_id || child?.tenant_id || "").trim();
    if (!ref) return "";
    const { data: leader } = await supabaseAdmin
      .from("perfil_lider")
      .select("tenant_id, id")
      .eq("id", ref)
      .maybeSingle();
    const tid = String(leader?.tenant_id || "").trim();
    if (tid) return tid;
    const lid = String(leader?.id || "").trim();
    if (lid) return lid;
    const ct = String(child?.tenant_id || "").trim();
    if (ct) return ct;
  }

  return "";
}

function clampDayInMonth(year: number, monthIndex0: number, dayWanted: number): Date {
  const last = endOfMonth(new Date(year, monthIndex0, 1)).getDate();
  const d = Math.min(Math.max(1, dayWanted), last);
  return new Date(year, monthIndex0, d);
}

function firstDueOnOrAfterInclusion(inclusao: Date, diaVenc: number): Date {
  const d = Math.min(Math.max(1, Math.floor(diaVenc) || 10), 31);
  let y = inclusao.getFullYear();
  let m = inclusao.getMonth();
  let candidate = clampDayInMonth(y, m, d);
  if (isBefore(candidate, startOfDay(inclusao))) {
    const nm = addMonths(new Date(y, m, 1), 1);
    candidate = clampDayInMonth(nm.getFullYear(), nm.getMonth(), d);
  }
  return candidate;
}

function computeProximaDataMensalidadePrevisao(
  dataInclusaoIso: string | null | undefined,
  diaVencimento: number,
  referencia: Date = new Date()
): string {
  const hoje = startOfDay(referencia);
  let inclusao = hoje;
  if (dataInclusaoIso && String(dataInclusaoIso).trim() !== "") {
    const raw = String(dataInclusaoIso).trim().slice(0, 10);
    const parsed = parseISO(raw);
    if (isValid(parsed)) inclusao = startOfDay(parsed);
  }

  const d = Math.min(Math.max(1, Math.floor(Number(diaVencimento)) || 10), 31);

  let cursor = firstDueOnOrAfterInclusion(inclusao, d);
  while (isBefore(cursor, hoje)) {
    const nm = addMonths(new Date(cursor.getFullYear(), cursor.getMonth(), 1), 1);
    cursor = clampDayInMonth(nm.getFullYear(), nm.getMonth(), d);
  }

  const mesmoMesAno =
    cursor.getFullYear() === hoje.getFullYear() && cursor.getMonth() === hoje.getMonth();
  const diasAte = differenceInCalendarDays(cursor, hoje);
  if (mesmoMesAno && diasAte === 1) {
    const nm = addMonths(new Date(cursor.getFullYear(), cursor.getMonth(), 1), 1);
    cursor = clampDayInMonth(nm.getFullYear(), nm.getMonth(), d);
  }

  return format(cursor, "yyyy-MM-dd");
}

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
  filhos_de_santo?: { nome: string } | null;
};

async function assertZeladorTenantAccess(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string
): Promise<boolean> {
  const { data: prof } = await supabaseAdmin
    .from("perfil_lider")
    .select("id, tenant_id")
    .eq("id", userId)
    .maybeSingle();
  if (!prof) return false;
  const a = await resolveLeaderId(tenantId);
  const b = await resolveLeaderId(String(prof.tenant_id || prof.id));
  return a === b;
}

async function hasPaidMensalidadeInCalendarMonth(
  supabaseAdmin: any,
  filhoId: string,
  ref: Date
): Promise<boolean> {
  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const { data, error } = await supabaseAdmin
    .from("financeiro")
    .select("id, status, categoria, tipo")
    .eq("filho_id", filhoId)
    .eq("categoria", "Mensalidade")
    .gte("data", start)
    .lte("data", endStr);
  if (error) return false;
  for (const r of data || []) {
    const st = String((r as any).status || "").toLowerCase();
    if (st === "pendente" || st === "excluido") continue;
    const tipo = String((r as any).tipo || "").toLowerCase();
    if (tipo === "entrada" || tipo === "receita" || tipo === "") return true;
  }
  return false;
}

async function fetchMensalidadesPendentesList(
  supabaseAdmin: any,
  tenantId: string
): Promise<MensalidadeZeladorRow[]> {
  const { data, error } = await supabaseAdmin
    .from("financeiro")
    .select("*, filhos_de_santo(nome)")
    .or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`)
    .eq("categoria", "Mensalidade")
    .eq("status", "pendente")
    .order("data", { ascending: true });
  if (error) throw error;
  return (data || []) as MensalidadeZeladorRow[];
}

async function fetchMensalidadesPagasMesAtual(
  supabaseAdmin: any,
  tenantId: string,
  ref: Date = new Date()
): Promise<MensalidadeZeladorRow[]> {
  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const { data, error } = await supabaseAdmin
    .from("financeiro")
    .select("*, filhos_de_santo(nome)")
    .or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`)
    .eq("categoria", "Mensalidade")
    .eq("status", "pago")
    .gte("data", start)
    .lte("data", endStr)
    .order("data", { ascending: false });
  if (error) throw error;
  return (data || []) as MensalidadeZeladorRow[];
}

async function syncMensalidadesPendentes(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string
): Promise<{ created: number }> {
  const resolvedTenant = await resolveLeaderId(tenantId);
  let dia = 10;
  let valorPadrao = 89.9;
  const { data: pix } = await supabaseAdmin
    .from("configuracoes_pix")
    .select("valor_mensalidade, dia_vencimento")
    .or(`terreiro_id.eq.${resolvedTenant},terreiro_id.eq.${tenantId}`)
    .maybeSingle();
  if (pix) {
    dia = parseInt(String((pix as any).dia_vencimento), 10) || 10;
    valorPadrao = Number((pix as any).valor_mensalidade) || valorPadrao;
  }

  const { data: children, error: chErr } = await supabaseAdmin
    .from("filhos_de_santo")
    .select("id, nome, tenant_id, lider_id, created_at, data_entrada")
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
      .from("financeiro")
      .select("id")
      .eq("filho_id", fid)
      .eq("categoria", "Mensalidade")
      .eq("status", "pendente")
      .limit(1);
    if (pend && pend.length > 0) continue;
    const paid = await hasPaidMensalidadeInCalendarMonth(supabaseAdmin, fid, ref);
    if (paid) continue;

    const inc = (child as any).data_entrada || (child as any).created_at;
    const dueStr = computeProximaDataMensalidadePrevisao(inc, dia, ref);
    const nome = String((child as any).nome || "Filho").trim() || "Filho";
    const insert: Record<string, unknown> = {
      tipo: "entrada",
      valor: valorPadrao,
      categoria: "Mensalidade",
      data: dueStr,
      descricao: `Mensalidade - ${nome} (vencimento ${dueStr}) (ID:${fid})`,
      status: "pendente",
      tenant_id: tenantId,
      lider_id: userId,
      filho_id: fid,
      data_vencimento: dueStr,
    };
    let { error: insErr } = await supabaseAdmin.from("financeiro").insert([insert]);
    if (insErr && String(insErr.message || "").includes("data_vencimento")) {
      delete insert.data_vencimento;
      const r2 = await supabaseAdmin.from("financeiro").insert([insert]);
      insErr = r2.error;
    }
    if (!insErr) created += 1;
  }
  return { created };
}

async function loadFinanceiroRow(supabaseAdmin: any, id: string) {
  const { data, error } = await supabaseAdmin.from("financeiro").select("*").eq("id", id).maybeSingle();
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

async function liquidarMensalidadePendente(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string,
  financeiroId: string,
  valorOverride?: number
): Promise<{ ok: true }> {
  const row = await loadFinanceiroRow(supabaseAdmin, financeiroId);
  if (!row) throw new Error("Lançamento não encontrado");
  const resolved = await resolveLeaderId(tenantId);
  if (!rowTenantMatches(row, tenantId, resolved, userId)) {
    throw new Error("Sem permissão para este lançamento");
  }
  const st = String(row.status || "").toLowerCase();
  if (st !== "pendente") throw new Error("Este registro não está pendente");
  if (String(row.categoria || "") !== "Mensalidade") throw new Error("Tipo de lançamento inválido");

  const paymentDate = new Date().toISOString().split("T")[0];
  const v = Number.isFinite(valorOverride) && (valorOverride as number) > 0 ? (valorOverride as number) : Number(row.valor) || 0;
  if (v <= 0) throw new Error("Valor inválido");

  const filhoId = row.filho_id as string;
  const { data: child } = await supabaseAdmin
    .from("filhos_de_santo")
    .select("nome")
    .eq("id", filhoId)
    .maybeSingle();
  const nome = String(child?.nome || "Filho").trim() || "Filho";
  const comp = String(row.data_vencimento || row.data || paymentDate).slice(0, 10);

  const { error: upErr } = await supabaseAdmin
    .from("financeiro")
    .update({
      status: "pago",
      tipo: "entrada",
      valor: v,
      data: paymentDate,
      descricao: `Mensalidade - ${nome} (competência ${comp}) (ID:${filhoId})`,
    })
    .eq("id", financeiroId)
    .eq("status", "pendente");
  if (upErr) throw upErr;
  return { ok: true };
}

async function estornarMensalidadePaga(
  supabaseAdmin: any,
  resolveLeaderId: (id: string) => Promise<string>,
  userId: string,
  tenantId: string,
  financeiroId: string,
  ref: Date = new Date()
): Promise<{ ok: true }> {
  const row = await loadFinanceiroRow(supabaseAdmin, financeiroId);
  if (!row) throw new Error("Lançamento não encontrado");
  const resolved = await resolveLeaderId(tenantId);
  if (!rowTenantMatches(row, tenantId, resolved, userId)) {
    throw new Error("Sem permissão para este lançamento");
  }
  const st = String(row.status || "").toLowerCase();
  if (st !== "pago") throw new Error("Apenas mensalidades marcadas como pagas podem ser estornadas");
  if (String(row.categoria || "") !== "Mensalidade") throw new Error("Tipo de lançamento inválido");

  const y = ref.getFullYear();
  const m0 = ref.getMonth();
  const start = `${y}-${String(m0 + 1).padStart(2, "0")}-01`;
  const last = new Date(y, m0 + 1, 0).getDate();
  const endStr = `${y}-${String(m0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const payDay = String(row.data || "").slice(0, 10);
  if (payDay < start || payDay > endStr) {
    throw new Error("Só é possível estornar pagamentos registrados no mês atual");
  }

  const due = String(row.data_vencimento || row.data || payDay).slice(0, 10);
  const filhoId = row.filho_id as string;
  const { data: child } = await supabaseAdmin
    .from("filhos_de_santo")
    .select("nome")
    .eq("id", filhoId)
    .maybeSingle();
  const nome = String(child?.nome || "Filho").trim() || "Filho";

  const { error: upErr } = await supabaseAdmin
    .from("financeiro")
    .update({
      status: "pendente",
      tipo: "entrada",
      data: due,
      descricao: `Mensalidade - ${nome} (vencimento ${due}) (ID:${filhoId})`,
    })
    .eq("id", financeiroId)
    .eq("status", "pago");
  if (upErr) throw upErr;
  return { ok: true };
}

// --- fim bloco financeiro / mensalidades ---

let supabaseAdmin: any;
let pixSupportsValorMensalidade = true;
let pixSupportsDiaVencimento = true;

function canonicalPlanSlug(plan: string | undefined): string {
  if (!plan) return 'axe';
  const stripped = plan.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const p = stripped.toLowerCase().trim().replace(/\s+/g, ' ');
  const compact = p.replace(/[\s_-]/g, '');

  if (p === 'vita' || p === 'plano vita' || compact === 'planovita') return 'vita';
  if (p === 'premium' || compact === 'premium') return 'premium';
  if (p === 'oro' || compact === 'oro' || compact === 'planoor') return 'oro';
  if (p === 'cortesia' || compact === 'cortesia') return 'cortesia';
  if (p === 'axe' || p === 'free' || compact === 'axe' || compact === 'free') return p === 'free' ? 'free' : 'axe';
  return p;
}

function isLifetimePlan(plan: string | undefined): boolean {
  const c = canonicalPlanSlug(plan);
  return c === 'cortesia' || c === 'vita';
}

function usesDistantSubscriptionExpiry(plan: string | undefined): boolean {
  if (!plan) return false;
  const raw = plan.toLowerCase().trim();
  if (raw === 'premium') return true;
  return isLifetimePlan(plan);
}

function isMissingColumnError(error: any, columnName: string) {
  const message = error?.message || '';
  return message.includes(`column "${columnName}" does not exist`) || error?.code === 'PGRST204';
}

function getPixConfigSelectClause() {
  const baseColumns = ['id', 'terreiro_id', 'chave_pix', 'tipo_chave', 'nome_beneficiario'];
  if (pixSupportsValorMensalidade) baseColumns.push('valor_mensalidade');
  if (pixSupportsDiaVencimento) baseColumns.push('dia_vencimento');
  return baseColumns.join(', ');
}

function sanitizePixConfigData(configData: any) {
  const sanitized = { ...configData };
  if (!pixSupportsValorMensalidade) delete sanitized.valor_mensalidade;
  if (!pixSupportsDiaVencimento) delete sanitized.dia_vencimento;
  return sanitized;
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("CRITICAL: Missing Supabase environment variables. Server will start but database features will fail.");
  console.error("VITE_SUPABASE_URL:", SUPABASE_URL ? "SET" : "MISSING");
  console.error("SUPABASE_SERVICE_ROLE_KEY:", SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING");
  // Create a mock or null client to avoid immediate crashes
  supabaseAdmin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: new Error("Supabase not configured") }),
          single: async () => ({ data: null, error: new Error("Supabase not configured") }),
          limit: () => ({
            maybeSingle: async () => ({ data: null, error: new Error("Supabase not configured") }),
            single: async () => ({ data: null, error: new Error("Supabase not configured") }),
          })
        }),
        limit: () => ({
          maybeSingle: async () => ({ data: null, error: new Error("Supabase not configured") }),
          single: async () => ({ data: null, error: new Error("Supabase not configured") }),
        })
      }),
      storage: {
        getBucket: async () => ({ data: null, error: { message: 'not found' } }),
        createBucket: async () => ({ error: new Error("Supabase not configured") })
      }
    })
  };
} else {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Função para garantir que os buckets de storage existam
async function ensureBucketsExist() {
  const buckets = ['biblioteca_estudos', 'loja_imagens', 'perfil_fotos'];
  console.log("[SERVER] Verificando buckets de storage...");
  
  for (const bucketName of buckets) {
    try {
      const { data: bucket, error } = await supabaseAdmin.storage.getBucket(bucketName);
      
      if (error && error.message.includes('not found')) {
        console.log(`[SERVER] Criando bucket: ${bucketName}`);
        const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: bucketName === 'biblioteca_estudos' ? ['application/pdf'] : ['image/*'],
          fileSizeLimit: 10485760 // 10MB para fotos, 50MB no total era o limite anterior?
        });
        if (createError) console.error(`[SERVER] Erro ao criar bucket ${bucketName}:`, createError);
      } else if (error) {
        console.error(`[SERVER] Erro ao verificar bucket ${bucketName}:`, error);
      } else {
        console.log(`[SERVER] Bucket OK: ${bucketName}`);
      }
    } catch (err) {
      console.error(`[SERVER] Erro inesperado ao verificar bucket ${bucketName}:`, err);
    }
  }
}

// Função para inicializar o esquema do banco (is_admin_global, foto_url)
async function initializeDatabase() {
  console.log("[SERVER] Inicializando esquema do banco...");
  try {
    // 1. Tenta verificar se a coluna is_admin_global existe
    const { error: checkError } = await supabaseAdmin.from('perfil_lider').select('is_admin_global').limit(1);
    
    if (checkError && checkError.message.includes('column "is_admin_global" does not exist')) {
      console.warn("[SERVER] ATENÇÃO: A coluna 'is_admin_global' não existe na tabela 'perfil_lider'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE perfil_lider ADD COLUMN IF NOT EXISTS is_admin_global BOOLEAN DEFAULT false;");
    }

    // 2. Tenta verificar se a coluna foto_url existe
    const { error: checkFotoError } = await supabaseAdmin.from('perfil_lider').select('foto_url').limit(1);
    if (checkFotoError && checkFotoError.message.includes('column "foto_url" does not exist')) {
      console.warn("[SERVER] ATENÇÃO: A coluna 'foto_url' não existe na tabela 'perfil_lider'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE perfil_lider ADD COLUMN IF NOT EXISTS foto_url TEXT;");
    }

    // 3. Tenta verificar se a coluna filho_id existe na tabela financeiro
    const { error: finError } = await supabaseAdmin.from('financeiro').select('filho_id').limit(1);
    if (finError && (finError.message.includes('column "filho_id" does not exist') || finError.code === 'PGRST204')) {
      console.warn("[SERVER] ATENÇÃO: A coluna 'filho_id' não existe na tabela 'financeiro'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE financeiro ADD COLUMN filho_id UUID;");
    }

    // 4. Tenta verificar se a coluna status existe na tabela financeiro
    const { error: finStatusError } = await supabaseAdmin.from('financeiro').select('status').limit(1);
    if (finStatusError && (finStatusError.message.includes('column "status" does not exist') || finStatusError.code === 'PGRST204')) {
      console.warn("[SERVER] ATENÇÃO: A coluna 'status' não existe na tabela 'financeiro'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE financeiro ADD COLUMN status TEXT DEFAULT 'pago';");
    }

    // 5. Tenta verificar se a coluna valor_mensalidade existe na tabela configuracoes_pix
    const { error: pixValError } = await supabaseAdmin.from('configuracoes_pix').select('valor_mensalidade').limit(1);
    if (pixValError && isMissingColumnError(pixValError, 'valor_mensalidade')) {
      pixSupportsValorMensalidade = false;
      console.warn("[SERVER] ATENÇÃO: A coluna 'valor_mensalidade' não existe na tabela 'configuracoes_pix'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE configuracoes_pix ADD COLUMN valor_mensalidade DECIMAL(10,2) DEFAULT 89.90;");
    }

    // 6. Tenta verificar se a coluna dia_vencimento existe na tabela configuracoes_pix
    const { error: pixDueDayError } = await supabaseAdmin.from('configuracoes_pix').select('dia_vencimento').limit(1);
    if (pixDueDayError && isMissingColumnError(pixDueDayError, 'dia_vencimento')) {
      pixSupportsDiaVencimento = false;
      console.warn("[SERVER] ATENÇÃO: A coluna 'dia_vencimento' não existe na tabela 'configuracoes_pix'.");
      console.warn("[SERVER] Por favor, execute o comando: ALTER TABLE configuracoes_pix ADD COLUMN dia_vencimento INTEGER DEFAULT 10;");
    }

    console.log("[SERVER] Verificação de esquema concluída.");

    if (!checkError && !checkFotoError) {
      console.log("[SERVER] Esquema do banco OK.");
      
      // Garante que os super admins tenham a flag
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const { error: updateError } = await supabaseAdmin
        .from('perfil_lider')
        .update({ is_admin_global: true })
        .in('email', superAdmins);
      
      if (updateError) console.error("[SERVER] Erro ao atualizar super admins:", updateError);
      else console.log("[SERVER] Super admins atualizados com sucesso:", superAdmins.join(', '));
    }
  } catch (err) {
    console.error("[SERVER] Erro ao inicializar banco:", err);
  }
}

// Helper para verificar usuário de forma robusta
async function verifyUser(token: string) {
  if (!token || token === "undefined" || token === "null") {
    return { user: null, error: new Error("Token inválido ou ausente") };
  }

  try {
    // 1. Verificação padrão
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (user && !error) return { user, error: null };

    // 2. Fallback: Decodificar JWT e usar admin.getUserById (mais estável com service_role)
    if (token.includes('.')) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload && payload.sub) {
          console.log(`[SERVER] Auth fallback: getUser falhou (${error?.message}), tentando getUserById para ${payload.sub}`);
          const { data: { user: adminUser }, error: adminError } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
          if (adminUser && !adminError) {
            console.log(`[SERVER] Auth fallback sucesso para ${adminUser.email}`);
            return { user: adminUser, error: null };
          }
        }
      } catch (e) {
        console.error("[SERVER] Erro ao decodificar JWT no fallback:", e);
      }
    }
    return { user: null, error: error || new Error("Usuário não encontrado") };
  } catch (err: any) {
    console.error("[SERVER] verifyUser exceção:", err);
    return { user: null, error: err };
  }
}

async function startServer() {
  console.log("[SERVER] Iniciando processo de boot...");
  const app = express();
  const PORT = 3000;

  // Middleware de log global (antes de qualquer rota)
  app.use((req, res, next) => {
    if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src')) {
      console.log(`[SERVER] ${req.method} ${req.url}`);
    }
    next();
  });

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.use(cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (ex.: curl, Postman em dev, webhooks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origem não autorizada — ${origin}`));
    },
    credentials: true,
  }));

  // Limite conservador para rotas comuns; uploads maiores usam limite próprio
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.get("/api/health-check", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Middleware de log para todas as requisições API (sem expor headers com tokens)
  app.use("/api", (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API LOG] ${req.method} ${req.url}`);
    }
    next();
  });

  app.get("/api/ping", (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString() });
  });

  // Rota para capturar atividade e geolocalização
  app.post("/api/metrics/track-activity", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      // Captura de IP
      // Em ambientes de proxy (como Cloud Run/Vercel), o IP real vem no x-forwarded-for
      const forwarded = req.headers['x-forwarded-for'] as string;
      const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
      
      let geoData = null;
      if (ip && ip !== '::1' && ip !== '127.0.0.1') {
        geoData = geoip.lookup(ip);
      }

      // Salva a atividade no banco (usando tabela de logs existente ou criando uma específica)
      await supabaseAdmin.from('access_logs').insert({
        user_id: user.id,
        ip: ip,
        city: geoData?.city || null,
        region: geoData?.region || null,
        country: geoData?.country || null,
        ll: geoData?.ll || null, // [lat, lon]
        user_agent: req.headers['user-agent'],
        created_at: new Date().toISOString()
      });

      res.json({ success: true, geo: geoData });
    } catch (error) {
      console.error("[METRICS] Error tracking activity:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Rota para estatísticas do Master Portal (Acessos e Filhos)
  app.get("/api/admin/system-stats", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user?.email || '');
      
      if (authError || !user || !isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      // 1. Contagem de Filhos por Terreiro
      const { data: childrenStats, error: childrenError } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('tenant_id');

      const childrenPerTenant: Record<string, number> = {};
      childrenStats?.forEach((c: any) => {
        const tid = c.tenant_id;
        childrenPerTenant[tid] = (childrenPerTenant[tid] || 0) + 1;
      });

      // 2. Logs de Atividade (Acessos Diários nos últimos 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: accessLogs, error: accessError } = await supabaseAdmin
        .from('access_logs')
        .select('created_at, city, ll')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // 3. Agrupamento por dia
      const dailyAccess: Record<string, number> = {};
      accessLogs?.forEach((log: any) => {
        const date = log.created_at.split('T')[0];
        dailyAccess[date] = (dailyAccess[date] || 0) + 1;
      });

      res.json({
        childrenPerTenant,
        dailyAccess,
        geoActivity: accessLogs?.filter((l: any) => l.ll).map((l: any) => ({
          city: l.city,
          lat: l.ll[0],
          lon: l.ll[1]
        })) || []
      });
    } catch (error) {
      console.error("[STATS] Error fetching system stats:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Rota para métricas específicas de um terreiro (Uso de Storage, Eventos, etc)
  app.get("/api/admin/tenant-usage/:tenantId", async (req, res) => {
    const { tenantId } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');
      
      if (authError || !user || !isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // 1. Contagem de Eventos (últimos 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { count: eventsCount } = await supabaseAdmin
        .from('convidados_eventos') // Usando convidados_eventos como proxy já que eventos pode ser complexo
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('created_at', thirtyDaysAgo.toISOString());

      // 2. Contagem de Filhos
      const { count: childrenCount } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // 3. Estimativa de Storage (simulada ou baseada em metadados se disponível)
      // Como não temos acesso direto à tabela de sistema do storage via RPC fácil aqui, 
      // vamos retornar uma estimativa baseada no plano ou dados randômicos realistas para a demonstração
      // Em uma implementação real, faríamos um RPC para sum(size) de storage.objects
      const storageEstimate = (Math.random() * 2 + (childrenCount || 0) * 0.1).toFixed(2);

      res.json({
        eventsCreated: eventsCount || 0,
        totalChildren: childrenCount || 0,
        storageUsed: parseFloat(storageEstimate), // em GB
        storageLimit: 10, // limite fixo de 10GB para exemplo
        lastActivity: new Date().toISOString()
      });
    } catch (error) {
      console.error("[USAGE] Error fetching tenant usage:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // API Route: Create Tenant (Admin only)
  app.post("/api/admin/create-tenant", async (req, res) => {
    const { email, password, nome_terreiro, nome_zelador, whatsapp, plan, observacao } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // 1. Verify if the requester is the Super Admin
      const token = authHeader.replace("Bearer ", "");
      if (!token || token === "undefined" || token === "null") {
        console.error("[SERVER] Invalid token in /api/admin/create-tenant:", token);
        return res.status(401).json({ error: "Token inválido ou ausente" });
      }

      const { user, error: authError } = await verifyUser(token);

      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      if (authError || !user || !superAdmins.includes(user.email || '')) {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      // 2. Create or Update User in Supabase Auth
      let targetUser;
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome_terreiro,
          nome_zelador,
          whatsapp,
          plan,
          observacao
        }
      });

      if (createError) {
        if (createError.message.includes('already been registered')) {
          console.log(`[ADMIN] Usuário ${email} já existe. Atualizando...`);
          // Buscar usuário existente
          const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError || !listData) throw listError || new Error("Falha ao listar usuários");
          const existingUser = (listData.users as any[]).find(u => u.email === email);
          
          if (!existingUser) {
            throw new Error("Erro ao recuperar usuário existente.");
          }

          // Atualizar metadados e senha do usuário existente
          const { data: updatedUser, error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
            password,
            user_metadata: {
              nome_terreiro,
              nome_zelador,
              whatsapp,
              plan,
              observacao
            }
          });

          if (updateAuthError) throw updateAuthError;
          targetUser = updatedUser.user;
        } else {
          throw createError;
        }
      } else {
        targetUser = createdUser.user;
      }

      // 3. Update Profile and Subscription
      if (plan && plan !== 'free') {
        const isDemo = plan === 'demo';
        
        let expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        if (usesDistantSubscriptionExpiry(plan)) expiresAt = '2099-12-31T23:59:59Z';
        if (req.body.isDemo) expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 48h for any demo base plan
        
        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert({ 
            id: targetUser.id,
            plan: plan.toLowerCase(),
            status: 'active',
            expires_at: expiresAt
          }, { onConflict: 'id' });
        
        if (subError) console.error("Error updating subscription plan:", subError);
      }

      // Update profile with extra info
      const { error: profileError } = await supabaseAdmin
        .from('perfil_lider')
        .upsert({ 
          id: targetUser.id,
          email: email,
          nome_terreiro,
          cargo: nome_zelador,
          role: 'admin',
          tenant_id: targetUser.id,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (profileError) console.error("Error updating profile info:", profileError);

      res.json({ 
        success: true, 
        user: {
          id: targetUser.id,
          email: targetUser.email,
          password // Returning password for the "Copy" feature
        } 
      });

    } catch (error: any) {
      console.error("Admin Create Tenant Error:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Filho de Santo Login
  app.post("/api/auth/filho-login", async (req, res) => {
    let { childId, cpfPrefix } = req.body;

    if (!childId || !cpfPrefix || cpfPrefix.length < 4) {
      return res.status(400).json({ error: "ID e os 4 primeiros dígitos do CPF são obrigatórios." });
    }

    // Limpa o ID caso o usuário tenha digitado o prefixo AXC-2026-
    if (childId.includes('-')) {
      const parts = childId.split('-');
      childId = parts[parts.length - 1];
    }

    try {
      console.log(`[AUTH] Tentativa de login para Filho ID Limpo: ${childId}`);
      
      // 1. Localiza o filho na tabela
      const { data: allChildren, error: listError } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('id, cpf, user_id, nome');
        
      if (listError) throw listError;
      
      const child = allChildren.find(c => 
        c.id.toLowerCase().startsWith(childId.toLowerCase())
      );

      if (!child) {
        return res.status(404).json({ error: "Filho de santo não encontrado com este ID." });
      }

      if (!child.cpf) {
        return res.status(400).json({ error: "Este filho de santo não possui CPF cadastrado." });
      }

      // 2. Valida o prefixo do CPF
      const cleanCpf = child.cpf.replace(/\D/g, '');
      if (!cleanCpf.startsWith(cpfPrefix)) {
        return res.status(401).json({ error: "CPF incorreto." });
      }

      // 3. Define as credenciais padrão atuais
      const fakeEmail = `f_${child.id}@axecloud.internal`;
      const generatedPassword = `Axe-Cloud-${cpfPrefix}-2024`; // Senha padronizada

      // 4. Busca o usuário no Auth para sincronizar
      let authUser = null;

      // Busca por user_id vinculado
      if (child.user_id) {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(child.user_id);
        if (userData?.user) authUser = userData.user;
      }

      // Busca por e-mail (caso o vínculo no DB esteja quebrado ou seja um usuário antigo)
      if (!authUser) {
        // Aumentamos o perPage para garantir que encontramos o usuário em terreiros grandes
        const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        authUser = (usersData?.users || []).find(u => 
          u.email === fakeEmail || u.email === `filho_${childId}@axecloud.com` || u.email === `filho_${child.id.substring(0, 4)}@axecloud.com`
        );
      }

      if (authUser) {
        console.log(`[AUTH] Sincronizando usuário existente: ${authUser.id}`);
        
        const updateFields: any = { 
          password: generatedPassword,
          email_confirm: true,
          user_metadata: { nome: child.nome, role: 'filho' }
        };

        // Força a atualização do e-mail para o formato NOVO (.internal) se estiver no antigo
        if (authUser.email !== fakeEmail) {
          updateFields.email = fakeEmail;
        }

        await supabaseAdmin.auth.admin.updateUserById(authUser.id, updateFields);

        // Garante o vínculo na tabela
        if (child.user_id !== authUser.id) {
          await supabaseAdmin.from('filhos_de_santo').update({ user_id: authUser.id }).eq('id', child.id);
        }

        return res.json({ email: fakeEmail, password: generatedPassword });
      } else {
        // 5. Cria novo usuário
        console.log(`[AUTH] Criando novo acesso shadow: ${fakeEmail}`);
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: { nome: child.nome, role: 'filho' }
        });

        if (createError) {
          // Fallback final para erro de duplicidade
          if (createError.message.includes('already')) {
             const { data: finalSearch } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
             const found = finalSearch.users.find(u => u.email === fakeEmail);
             if (found) {
                await supabaseAdmin.auth.admin.updateUserById(found.id, { password: generatedPassword });
                await supabaseAdmin.from('filhos_de_santo').update({ user_id: found.id }).eq('id', child.id);
                return res.json({ email: fakeEmail, password: generatedPassword });
             }
          }
          throw createError;
        }

        await supabaseAdmin.from('filhos_de_santo').update({ user_id: newUser.user.id }).eq('id', child.id);
        return res.json({ email: fakeEmail, password: generatedPassword });
      }

    } catch (error: any) {
      console.error("[AUTH] Erro no Login do Filho:", error);
      res.status(500).json({ error: error.message || "Erro ao processar login." });
    }
  });

  // API Route: Upload Profile Photo (Bypasses Storage RLS)
  app.post("/api/v1/profile/upload-photo", async (req, res) => {
    const authHeader = req.headers.authorization;
    const { fileData, fileName, contentType } = req.body;

    if (!authHeader || !fileData) {
      return res.status(400).json({ error: "Unauthorized or missing data" });
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Buffer conversion from base64
      const buffer = Buffer.from(fileData, 'base64');
      
      // Upload using service role key (bypasses RLS)
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('perfil_fotos')
        .upload(fileName, buffer, {
          contentType: contentType || 'image/jpeg',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('perfil_fotos')
        .getPublicUrl(fileName);

      res.json({ publicUrl });
    } catch (error: any) {
      console.error("[SERVER] Erro no upload de foto:", error);
      res.status(500).json({ error: error.message || "Erro interno ao subir foto" });
    }
  });

  // Helper: resolve qualquer tenant_id/userId para o id real em perfil_lider (resolve FK)
  async function resolveLeaderId(idOrTenantId: string): Promise<string> {
    const { data } = await supabaseAdmin
      .from('perfil_lider')
      .select('id')
      .or(`id.eq.${idOrTenantId},tenant_id.eq.${idOrTenantId}`)
      .maybeSingle();
    return data?.id || idOrTenantId;
  }

  /** Web push só para filhos de santo (assinaturas em user_metadata.push_subscriptions). */
  async function sendWebPushToFilhosDoTerreiro(
    tenantId: string,
    payload: { title: string; body: string; url: string }
  ): Promise<number> {
    const resolvedTenant = await resolveLeaderId(tenantId);
    const { data: filhos, error: filhosError } = await supabaseAdmin
      .from('filhos_de_santo')
      .select('user_id')
      .or(`tenant_id.eq.${resolvedTenant},lider_id.eq.${resolvedTenant},tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`);
    if (filhosError) throw filhosError;
    const userIdSet = new Set((filhos || []).map((f: any) => f.user_id).filter(Boolean));
    if (userIdSet.size === 0) return 0;

    const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    let sentCount = 0;
    for (const u of usersData.users) {
      if (!userIdSet.has(u.id)) continue;
      const subs = u.user_metadata?.push_subscriptions || [];
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload));
          sentCount++;
        } catch (e: any) {
          if (e.statusCode === 410 || e.statusCode === 404) {
            console.log('[SERVER] Push subscription expirada (filho):', u.id);
          } else {
            console.error('[SERVER] Push send error:', e);
          }
        }
      }
    }
    return sentCount;
  }

  /** mural_avisos.tenant_id costuma referenciar perfil_lider(id), não auth.users — sem linha em perfil_lider a FK quebra. */
  async function ensurePerfilLiderForMural(user: { id: string; email?: string | null }) {
    if (!user?.id) return;
    const { data: row } = await supabaseAdmin.from('perfil_lider').select('id').eq('id', user.id).maybeSingle();
    if (row) return;
    const email = (user.email || '').toLowerCase().trim() || `u_${user.id.replace(/-/g, '')}@placeholder.axecloud.local`;
    const { error } = await supabaseAdmin.from('perfil_lider').upsert(
      {
        id: user.id,
        email,
        nome_terreiro: 'Meu Terreiro',
        role: 'admin',
        tenant_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) console.error('[SERVER] ensurePerfilLiderForMural:', error.message);
  }

  function authUserIdFromToken(user: { id?: string }, bearerToken: string): string {
    let id = typeof user?.id === 'string' ? user.id.trim() : '';
    if (id.length > 10) return id;
    const raw = bearerToken.replace(/^Bearer\s+/i, '').trim();
    if (!raw.includes('.')) return '';
    const b64 = raw.split('.')[1];
    if (!b64) return '';
    const tryParse = (buf: Buffer) => JSON.parse(buf.toString('utf8')) as { sub?: string };
    try {
      const p = tryParse(Buffer.from(b64, 'base64url'));
      if (typeof p.sub === 'string' && p.sub.length > 10) return p.sub.trim();
    } catch {
      try {
        const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const p = tryParse(Buffer.from(pad, 'base64'));
        if (typeof p.sub === 'string' && p.sub.length > 10) return p.sub.trim();
      } catch {
        /* ignore */
      }
    }
    return '';
  }

  /** Alguns projetos ligam mural_avisos.tenant_id a subscriptions(id) ou colunas semelhantes. */
  async function ensureSubscriptionForMural(zeladorId: string, logicalTenant: string) {
    const { data: row } = await supabaseAdmin.from('subscriptions').select('id').eq('id', zeladorId).maybeSingle();
    if (row) return;
    const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    let payload: Record<string, unknown> = {
      id: zeladorId,
      tenant_id: logicalTenant,
      plan: 'axe',
      status: 'active',
      expires_at: expires,
      updated_at: now,
    };
    let { error } = await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'id' });
    if (error && isMissingColumnError(error, 'tenant_id')) {
      delete payload.tenant_id;
      ({ error } = await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'id' }));
    }
    if (error) console.error('[SERVER] ensureSubscriptionForMural:', error.message);
  }

  // API Route: Pix Config — GET e POST (bypasses RLS, resolve FK automaticamente)
  app.get("/api/v1/financial/pix-config", async (req, res) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    try {
      const resolvedId = await resolveLeaderId(tenantId as string);
      // Tenta pelo id resolvido, depois pelo tenantId original (fallback)
      let { data, error } = await supabaseAdmin
        .from('configuracoes_pix')
        .select(getPixConfigSelectClause())
        .or(`terreiro_id.eq.${resolvedId},terreiro_id.eq.${tenantId}`)
        .maybeSingle();
      if (error) throw error;
      res.json({ data });
    } catch (err: any) {
      console.error("[SERVER] Erro ao buscar pix config:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/v1/financial/pix-config", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });

      const { terreiro_id, chave_pix, tipo_chave, nome_beneficiario, valor_mensalidade, dia_vencimento } = req.body;
      if (!terreiro_id) return res.status(400).json({ error: "terreiro_id required" });

      // Resolve FK: busca o id real do perfil_lider pelo tenant_id ou auth user id
      const resolvedId = await resolveLeaderId(terreiro_id);

      const configData: any = { terreiro_id: resolvedId, chave_pix, tipo_chave, nome_beneficiario };
      if (valor_mensalidade !== undefined) configData.valor_mensalidade = parseFloat(valor_mensalidade) || 0;
      if (dia_vencimento !== undefined) {
        const dia = parseInt(dia_vencimento);
        if (dia >= 1 && dia <= 31) configData.dia_vencimento = dia;
      }
      const sanitizedConfigData = sanitizePixConfigData(configData);

      // Busca existente pelo id resolvido OU pelo id original (compatibilidade)
      const { data: existing } = await supabaseAdmin
        .from('configuracoes_pix')
        .select('id')
        .or(`terreiro_id.eq.${resolvedId},terreiro_id.eq.${terreiro_id}`)
        .maybeSingle();

      let error;
      if (existing) {
        const { error: e } = await supabaseAdmin.from('configuracoes_pix').update(sanitizedConfigData).eq('id', existing.id);
        error = e;
      } else {
        const { error: e } = await supabaseAdmin.from('configuracoes_pix').insert([sanitizedConfigData]);
        error = e;
      }

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] Erro ao salvar pix config:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** Confirma mensalidade: RPC atômica (financeiro + financial_monthly_summary) ou fallback com filho_id. */
  app.post("/api/v1/financial/confirm-mensalidade", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });

      const { filho_id, filho_nome, valor, competencia_date, tenant_id } = req.body || {};
      if (!filho_id || !tenant_id) {
        return res.status(400).json({ error: "filho_id e tenant_id são obrigatórios" });
      }
      const v = Number(valor);
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({ error: "valor inválido" });
      }

      const { data: child, error: childErr } = await supabaseAdmin
        .from("filhos_de_santo")
        .select("id, nome, tenant_id, lider_id")
        .eq("id", filho_id)
        .maybeSingle();
      if (childErr || !child) {
        return res.status(404).json({ error: "Filho não encontrado" });
      }

      const resolvedTenant = await resolveLeaderId(tenant_id as string);
      const sameHouse =
        child.tenant_id === tenant_id ||
        child.tenant_id === resolvedTenant ||
        child.lider_id === user.id ||
        child.lider_id === tenant_id ||
        child.lider_id === resolvedTenant;
      if (!sameHouse) {
        return res.status(403).json({ error: "Sem permissão para confirmar este pagamento" });
      }

      const paymentDate = new Date().toISOString().split("T")[0];
      const compDate = (competencia_date && String(competencia_date).trim()) || paymentDate;
      const nome = (filho_nome && String(filho_nome).trim()) || child.nome || "Filho";

      const rpcArgs = {
        p_filho_id: filho_id,
        p_filho_nome: nome,
        p_valor: v,
        p_competencia_date: compDate,
        p_payment_date: paymentDate,
        p_tenant_id: tenant_id,
        p_lider_id: user.id,
      };

      const { data: rpcId, error: rpcErr } = await supabaseAdmin.rpc("confirm_mensalidade_payment", rpcArgs);
      if (!rpcErr && rpcId) {
        return res.json({ success: true, id: rpcId, via: "rpc" });
      }
      if (rpcErr) {
        console.warn("[SERVER] RPC confirm_mensalidade_payment indisponível ou erro — usando fallback:", rpcErr.message || rpcErr);
      }

      const row: Record<string, unknown> = {
        tipo: "entrada",
        valor: v,
        categoria: "Mensalidade",
        data: paymentDate,
        descricao: `Mensalidade - ${nome} (competência ${compDate}) (ID:${filho_id})`,
        tenant_id,
        lider_id: user.id,
        filho_id,
      };

      const { data: inserted, error: insErr } = await supabaseAdmin.from("financeiro").insert([row]).select("id").single();
      if (insErr) {
        console.error("[SERVER] confirm-mensalidade fallback insert:", insErr);
        return res.status(500).json({ error: insErr.message || "Falha ao registrar pagamento" });
      }
      return res.json({ success: true, id: inserted?.id, via: "insert" });
    } catch (err: any) {
      console.error("[SERVER] confirm-mensalidade:", err?.message || err);
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  });

  app.post("/api/v1/financial/mensalidades/sync-pendentes", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });
      const tenant_id = String((req.body || {}).tenant_id || "").trim();
      if (!tenant_id) return res.status(400).json({ error: "tenant_id obrigatório" });
      const ok = await assertZeladorTenantAccess(supabaseAdmin, resolveLeaderId, user.id, tenant_id);
      if (!ok) return res.status(403).json({ error: "Sem permissão" });
      const { created } = await syncMensalidadesPendentes(supabaseAdmin, resolveLeaderId, user.id, tenant_id);
      res.json({ success: true, created });
    } catch (err: any) {
      console.error("[SERVER] mensalidades/sync-pendentes:", err?.message || err);
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  });

  app.get("/api/v1/financial/mensalidades", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });
      const tenantId = String(req.query.tenantId || "").trim();
      const view = String(req.query.view || "pendentes").toLowerCase();
      if (!tenantId) return res.status(400).json({ error: "tenantId obrigatório" });
      const ok = await assertZeladorTenantAccess(supabaseAdmin, resolveLeaderId, user.id, tenantId);
      if (!ok) return res.status(403).json({ error: "Sem permissão" });
      const data =
        view === "pagas"
          ? await fetchMensalidadesPagasMesAtual(supabaseAdmin, tenantId, new Date())
          : await fetchMensalidadesPendentesList(supabaseAdmin, tenantId);
      res.json({ data });
    } catch (err: any) {
      console.error("[SERVER] mensalidades GET:", err?.message || err);
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  });

  app.post("/api/v1/financial/mensalidades/liquidar", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });
      const { id, tenant_id, valor } = req.body || {};
      if (!id || !tenant_id) return res.status(400).json({ error: "id e tenant_id obrigatórios" });
      const ok = await assertZeladorTenantAccess(supabaseAdmin, resolveLeaderId, user.id, String(tenant_id));
      if (!ok) return res.status(403).json({ error: "Sem permissão" });
      const v = valor !== undefined && valor !== null ? Number(valor) : undefined;
      await liquidarMensalidadePendente(
        supabaseAdmin,
        resolveLeaderId,
        user.id,
        String(tenant_id),
        String(id),
        v
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] mensalidades/liquidar:", err?.message || err);
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  });

  app.post("/api/v1/financial/mensalidades/estornar", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Token inválido" });
      const { id, tenant_id } = req.body || {};
      if (!id || !tenant_id) return res.status(400).json({ error: "id e tenant_id obrigatórios" });
      const ok = await assertZeladorTenantAccess(supabaseAdmin, resolveLeaderId, user.id, String(tenant_id));
      if (!ok) return res.status(403).json({ error: "Sem permissão" });
      await estornarMensalidadePaga(supabaseAdmin, resolveLeaderId, user.id, String(tenant_id), String(id), new Date());
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] mensalidades/estornar:", err?.message || err);
      res.status(500).json({ error: err?.message || "Erro interno" });
    }
  });

  // API Route: Get Library Materials (bypasses RLS — filhos podem ler materiais do zelador)
  app.get("/api/v1/library/materials", async (req, res) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    try {
      const { data, error } = await supabaseAdmin
        .from('biblioteca')
        .select('*')
        .eq('tenant_id', tenantId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (err: any) {
      console.error("[SERVER] Erro ao buscar materiais:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Loja — GET lista (com e sem /v1, para compatível com proxy e com o front)
  const handleStoreProductsGet = async (req: express.Request, res: express.Response) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    try {
      const resolvedId = await resolveLeaderId(tenantId as string);
      const { data, error } = await supabaseAdmin
        .from('produtos')
        .select('*')
        .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`)
        .is('deleted_at', null)
        .order('nome');
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (err: any) {
      console.error("[SERVER] Erro ao buscar produtos:", err.message);
      res.status(500).json({ error: err.message });
    }
  };
  app.get("/api/v1/store/products", handleStoreProductsGet);
  app.get("/api/store/products", handleStoreProductsGet);

  // Loja — POST criar produto
  const handleStoreProductsPost = async (req: express.Request, res: express.Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      const {
        tenantId,
        nome,
        descricao = "",
        preco = 0,
        estoque_atual = 0,
        estoque_minimo = 0,
        categoria = "Velas",
        imagem_url = "",
      } = req.body;

      if (!nome || typeof nome !== "string" || !nome.trim()) {
        return res.status(400).json({ error: "Nome do produto é obrigatório." });
      }
      if (!tenantId || typeof tenantId !== "string") {
        return res.status(400).json({ error: "tenantId é obrigatório." });
      }

      const { data: pl } = await supabaseAdmin
        .from("perfil_lider")
        .select("role, tenant_id, is_admin_global")
        .eq("id", user.id)
        .maybeSingle();

      if (pl?.role === "filho") {
        return res.status(403).json({ error: "Sem permissão para cadastrar produtos." });
      }

      const allowed =
        !!pl?.is_admin_global ||
        user.id === tenantId ||
        (!!pl?.tenant_id && pl.tenant_id === tenantId);

      if (!allowed) {
        return res.status(403).json({ error: "Você não pode cadastrar produtos neste terreiro." });
      }

      const row = {
        nome: nome.trim(),
        descricao: String(descricao ?? "").trim(),
        preco: Number(preco) || 0,
        estoque_atual: Number(estoque_atual) || 0,
        estoque_minimo: Number(estoque_minimo) || 0,
        categoria: categoria || "Velas",
        imagem_url: imagem_url && String(imagem_url).trim() ? String(imagem_url).trim() : null,
        tenant_id: tenantId,
      };

      const { data, error } = await supabaseAdmin.from("produtos").insert([row]).select().single();
      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (err: any) {
      console.error("[SERVER] Erro ao criar produto:", err.message || err);
      res.status(500).json({ error: err.message || "Erro ao salvar produto" });
    }
  };
  app.post("/api/v1/store/products", handleStoreProductsPost);
  app.post("/api/store/products", handleStoreProductsPost);

  /** pt → en leve (MyMemory) + dicionário; depois 1ª foto Pexels (PEXELS_API_KEY no .env). */
  const handleStoreProductImageSuggestion = async (req: express.Request, res: express.Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Sessão inválida" });

      const raw = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (raw.length < 2) return res.json({ url: null });

      const ptEn: Record<string, string> = {
        vela: "candle",
        velas: "candles",
        guia: "prayer ribbon",
        guias: "prayer ribbons",
        erva: "herbs",
        ervas: "herbs",
        incenso: "incense",
        defumacao: "incense smoke cleansing",
        manto: "ceremonial robe",
        roupa: "clothing",
        colar: "necklace",
        livro: "book",
        cruz: "cross",
        copo: "cup",
        prato: "plate",
      };
      const dictBoost = raw
        .split(/\s+/)
        .map((w) => {
          const k = w.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z]/gi, "");
          return ptEn[k] || w;
        })
        .join(" ")
        .trim();

      let searchQuery = dictBoost || raw;
      try {
        const trUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(raw)}&langpair=pt|en`;
        const trRes = await fetch(trUrl);
        if (trRes.ok) {
          const tj = (await trRes.json()) as { responseData?: { translatedText?: string } };
          const tr = (tj?.responseData?.translatedText || "").trim();
          if (tr.length > 1 && !/^MYMEMORY\s+WARNING/i.test(tr) && tr.toLowerCase() !== raw.toLowerCase()) {
            searchQuery = `${tr} ${dictBoost}`.trim();
          }
        }
      } catch {
        /* mantém busca com dicionário / original */
      }

      const pexelsKey = process.env.PEXELS_API_KEY || process.env.PEXELS_ACCESS_KEY;
      if (!pexelsKey) {
        return res.json({ url: null });
      }

      const pxUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(searchQuery.slice(0, 120))}&per_page=1`;
      const pxRes = await fetch(pxUrl, { headers: { Authorization: pexelsKey } });
      if (!pxRes.ok) {
        console.warn("[PEXELS] HTTP", pxRes.status);
        return res.json({ url: null });
      }
      const pj = (await pxRes.json()) as { photos?: Array<{ src?: { large?: string; medium?: string } }> };
      const photo = pj?.photos?.[0];
      const url = photo?.src?.large || photo?.src?.medium || null;
      return res.json({ url });
    } catch (err: any) {
      console.error("[product-image-suggestion]", err?.message || err);
      return res.status(500).json({ error: err?.message || "Erro ao sugerir imagem" });
    }
  };
  app.get("/api/v1/store/product-image-suggestion", handleStoreProductImageSuggestion);
  app.get("/api/store/product-image-suggestion", handleStoreProductImageSuggestion);

  // API Route: PDF Proxy — serve o PDF do Supabase localmente para evitar CORS no PDF.js
  app.get("/api/v1/library/pdf-proxy", async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: "url query param required" });
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).send("Erro ao buscar PDF");
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set({
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(buffer);
    } catch (err: any) {
      console.error("[PDF-PROXY] Erro:", err.message);
      res.status(500).send("Erro interno");
    }
  });

  // API Route: Upload Library Material (Bypasses Storage and DB RLS)
  app.post("/api/v1/library/upload", async (req, res) => {
    const authHeader = req.headers.authorization;
    const { fileData, fileName, contentType, titulo, categoria, tenantId } = req.body;

    if (!authHeader || !fileData) {
      return res.status(400).json({ error: "Unauthorized or missing data" });
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // 1. Upload to Supabase Storage
      const buffer = Buffer.from(fileData, 'base64');

      // Supabase Storage rejeita caracteres especiais/acentuados no path.
      // Normaliza: remove acentos, espaços viram hífens, tudo lowercase.
      const slugifyPath = (str: string) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
           .replace(/[^a-zA-Z0-9_\-]/g, '_')
           .toLowerCase();

      const safeCategoria = slugifyPath(categoria || 'geral');
      const storagePath = `${tenantId}/${safeCategoria}/${fileName}`;
      
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('biblioteca_estudos')
        .upload(storagePath, buffer, {
          contentType: contentType || 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('biblioteca_estudos')
        .getPublicUrl(storagePath);

      // 3. Save Metadata to Database
      const { error: dbError } = await supabaseAdmin
        .from('biblioteca')
        .insert([{
          titulo: titulo,
          categoria: categoria,
          arquivo_url: publicUrl,
          tenant_id: tenantId,
          storage_path: storagePath
        }]);

      if (dbError) throw dbError;

      res.json({ success: true, publicUrl });
    } catch (error: any) {
      console.error("[SERVER] Erro no upload de material:", error);
      res.status(500).json({ error: error.message || "Erro interno ao subir material" });
    }
  });

  // API Route: Save User Settings (Bypasses RLS)
  app.post("/api/v1/settings/save", async (req, res) => {
    console.log(`[SERVER] Recebida requisição em /api/v1/settings/save`);
    const { userId, tenantId, profile } = req.body;
    
    // Verificação de Identidade (MANDATÓRIO: O usuário só pode salvar suas próprias configs)
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Sessão expirada" });
    
    try {
      const token = authHeader.replace("Bearer ", "");
      let user;
      let authError;
      
      const { user: verifiedUser, error: verifiedError } = await verifyUser(token);
      user = verifiedUser;
      authError = verifiedError;
      
      if (authError || !user || user.id !== userId) {
        console.error(`[SECURITY ALERT] Tentativa de Mass Assignment ou Token Inválido.`);
        console.error(`[DEBUG] AuthError:`, authError);
        console.error(`[DEBUG] UserID do Token: ${user?.id}, UserID da Req: ${userId}`);
        return res.status(403).json({ 
          error: "Acesso negado", 
          details: authError ? "Token inválido ou expirado" : "ID do usuário não coincide" 
        });
      }
      console.log(`[SERVER] Tentando salvar configurações para: ${userId}, tenantId: ${tenantId}`);
      
      // Verificação de segurança: A tabela existe?
      const { error: tableCheck } = await supabaseAdmin.from('perfil_lider').select('id').limit(1);
      if (tableCheck && tableCheck.code === '42P01') {
        return res.status(500).json({ error: "A tabela 'perfil_lider' não existe. Você precisa executar o SQL no Supabase Editor." });
      }

      // 1. Save Profile
      const isSuperAdmin = profile?.email === 'lucasilvasiqueira@outlook.com.br';
      const SHARED_TENANT_ID = '6588b6c9-ce84-4140-a69a-f487a0c61dab';

      const profileData: any = {
        id: userId,
        email: profile?.email,
        nome_terreiro: profile?.nome_terreiro || 'Meu Terreiro',
        cargo: profile?.cargo || 'Zelador',
        foto_url: profile?.foto_url || null,
        updated_at: new Date().toISOString()
      };

      if (isSuperAdmin) {
        profileData.tenant_id = SHARED_TENANT_ID;
        profileData.is_admin_global = true;
      } else if (tenantId) {
        profileData.tenant_id = tenantId;
      }

      const { error: profileError } = await supabaseAdmin
        .from('perfil_lider')
        .upsert(profileData, { onConflict: 'id' });

      if (profileError) {
        console.error("[SERVER] Erro no Perfil:", profileError);
        return res.status(500).json({ error: `Erro no Banco (Perfil): ${profileError.message}` });
      }

      console.log(`[SERVER] SUCESSO TOTAL para ${userId}`);
      res.json({ success: true });

    } catch (error: any) {
      console.error("[SERVER] Erro ao salvar configurações:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Get Tenant Info (Bypasses RLS)
  app.get("/api/tenant-info", async (req, res) => {
    const userId = req.query.userId as string;
    const email = (req.query.email as string || '').toLowerCase().trim();
    if (!userId) return res.status(400).json({ error: "UserId is required" });

    try {
      // 1. Prioridade: Verifica se é um Filho de Santo vinculado
      const { data: childData } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('id, nome, lider_id, tenant_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (childData) {
        console.log(`[SERVER] Usuário identificado como FILHO: ${childData.nome}`);
        // lider_id aponta para perfil_lider.id; tenant_id costuma ser o UUID lógico — não usar como .eq('id', …) primeiro.
        const leaderId = childData.lider_id || childData.tenant_id;
        
        let leaderProfileData: any = null;
        let leaderSubData: any = null;

        if (leaderId) {
          // Busca perfil e assinatura em paralelo (DB)
          // Tentamos buscar por ID primeiro (caso padrão para zeladores)
          const dbPromises = [
            supabaseAdmin.from('perfil_lider').select('nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url').eq('id', leaderId).maybeSingle(),
            supabaseAdmin.from('subscriptions').select('plan, status, expires_at').eq('id', leaderId).maybeSingle()
          ];

          const [leaderProfile, leaderSub] = await Promise.all(dbPromises);
          leaderProfileData = leaderProfile.data;
          leaderSubData = leaderSub.data;

          // Se não encontrou por ID, tenta por tenant_id (caso o leaderId seja o ID de um tenant compartilhado)
          if (!leaderProfileData) {
            const { data: altProfile } = await supabaseAdmin
              .from('perfil_lider')
              .select('nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url')
              .eq('tenant_id', leaderId)
              .maybeSingle();
            if (altProfile) leaderProfileData = altProfile;
          }

          // Busca Auth em separado para ser resiliente a falhas na API de Admin
          try {
            const { data: leaderAuth, error: authError } = await supabaseAdmin.auth.admin.getUserById(leaderId);
            if (!authError && leaderAuth?.user) {
              const authNomeTerreiro = leaderAuth.user.user_metadata?.nome_terreiro || leaderAuth.user.user_metadata?.nome || leaderAuth.user.user_metadata?.full_name;
              
              // Priorizamos o nome do terreiro vindo do perfil, mas usamos o Auth como fallback
              if (!leaderProfileData?.nome_terreiro && authNomeTerreiro) {
                if (!leaderProfileData) leaderProfileData = { nome_terreiro: authNomeTerreiro };
                else leaderProfileData.nome_terreiro = authNomeTerreiro;
              }
            }
          } catch (authErr) {
            console.warn("[SERVER] leaderAuth fallback failed (non-critical):", authErr);
          }
        }

        if (leaderProfileData?.deleted_at) return res.status(403).json({ error: "Conta excluída", status: "deleted" });
        if (leaderProfileData?.is_blocked) return res.status(403).json({ error: "Acesso suspenso", status: "blocked" });

        return res.json({
          nome_terreiro: leaderProfileData?.nome_terreiro || 'Meu Terreiro',
          cargo: null,
          role: 'filho',
          is_admin_global: false,
          tenant_id: leaderId || userId,
          plan: (leaderSubData?.plan || 'axe').toLowerCase().trim(),
          status: 'active', // Filho sempre ativo
          expires_at: '2099-12-31T23:59:59Z', // Filho não expira (Acesso Livre)
          foto_url: leaderProfileData?.foto_url || null
        });
      }

      // 2. Se não for filho, busca Perfil de Líder
      let profileRes: any = await supabaseAdmin.from('perfil_lider').select('nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url').eq('id', userId).maybeSingle();
      
      const isSuperAdmin = (profileRes.data?.is_admin_global === true) || 
                          email === 'lucasilvasiqueira@outlook.com.br' ||
                          email === 'vendasmercadolivrev1@gmail.com';

      // 2.5 Auto-create profile for Admins if missing
      if (!profileRes.data) {
        const SHARED_TENANT_ID = isSuperAdmin ? '6588b6c9-ce84-4140-a69a-f487a0c61dab' : userId; 
        const { data: newProfile, error: createError } = await supabaseAdmin
          .from('perfil_lider')
          .upsert({
            id: userId,
            email: email,
            nome_terreiro: 'Meu Terreiro',
            role: 'admin',
            is_admin_global: isSuperAdmin,
            tenant_id: SHARED_TENANT_ID,
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' })
          .select()
          .single();
        
        if (!createError && newProfile) {
          profileRes.data = newProfile;
        }
      }

      // Check if blocked or deleted after possible creation
      if (profileRes.data?.deleted_at) {
        return res.status(403).json({ error: "Conta excluída", status: "deleted" });
      }
      if (profileRes.data?.is_blocked) {
        return res.status(403).json({ error: "Acesso suspenso", status: "blocked" });
      }

      let subRes: any = await supabaseAdmin.from('subscriptions').select('plan, status, expires_at').eq('id', userId).maybeSingle();

      // 3. Determinação do Plano e Módulos
      let plan = (subRes.data?.plan || 'axe').toLowerCase().trim();
      if (isSuperAdmin) plan = 'premium';

      return res.json({
        nome_terreiro: profileRes.data?.nome_terreiro || 'Meu Terreiro',
        cargo: profileRes.data?.cargo?.trim() || null,
        role: isSuperAdmin ? 'admin' : (profileRes.data?.role || 'admin'),
        is_admin_global: !!isSuperAdmin,
        tenant_id: profileRes.data?.tenant_id || profileRes.data?.id || (isSuperAdmin ? userId : null),
        plan: plan,
        status: isSuperAdmin ? 'active' : (subRes.data?.status || 'active'),
        expires_at: isSuperAdmin ? '2099-12-31T23:59:59Z' : (subRes.data?.expires_at || null),
        foto_url: profileRes.data?.foto_url || null
      });
    } catch (error: any) {
      console.error("[SERVER] Erro ao buscar tenant info:", error);
      return res.status(500).json({ error: "Erro ao buscar dados do tenant", details: error.message || String(error) });
    }
  });

  const DEFAULT_PLANS = {
    axe: { name: "Axé", price: 49.90, description: "Ideal para terreiros que estão começando a digitalização." },
    oro: { name: "Orô", price: 89.90, description: "Controle de estoque e biblioteca de estudos para o seu corpo mediúnico." },
    premium: { name: "Premium", price: 149.90, description: "Gestão espiritual e financeira completa para o seu terreiro." }
  };

  // API Route: List Tenants (Admin only)
  app.get("/api/admin/tenants", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      if (!token || token === "undefined" || token === "null") {
        console.error("[SERVER] Invalid token in /api/admin/tenants:", token);
        return res.status(401).json({ error: "Token inválido ou ausente" });
      }

      const { user, error: authError } = await verifyUser(token);
      
      if (authError || !user) {
        console.error("[SERVER] Auth error in /api/admin/tenants:", authError?.message || "No user found", "Token length:", token.length);
        return res.status(401).json({ error: "Sessão inválida: " + (authError?.message || "Usuário não encontrado") });
      }

      // Verificar se é Admin Global
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');

      const { data: adminProfile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global')
        .eq('id', user.id)
        .single();

      if (!adminProfile?.is_admin_global && !isSuperAdmin) {
        return res.status(403).json({ error: "Acesso restrito a administradores globais" });
      }

      // 1. Fetch Profiles
      const { data: profiles, error: pError } = await supabaseAdmin
        .from('perfil_lider')
        .select('id, email, nome_terreiro, cargo, updated_at, is_blocked, deleted_at')
        .is('deleted_at', null);

      if (pError) throw pError;

      // 2. Fetch Subscriptions
      const { data: subs, error: sError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, plan, expires_at');

      if (sError) throw sError;

      // 3. Fetch Children Counts (Batch)
      const { data: childrenRaw, error: cError } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('tenant_id');
        
      if (cError) throw cError;
      
      const childrenCountMap: Record<string, number> = {};
      (childrenRaw || []).forEach(child => {
        childrenCountMap[child.tenant_id] = (childrenCountMap[child.tenant_id] || 0) + 1;
      });

      // 4. Fetch Global Settings
      const { data: settings } = await supabaseAdmin
        .from('global_settings')
        .select('data')
        .eq('id', 'plans')
        .single();

      const plans = settings?.data && Object.keys(settings.data).length > 0 ? settings.data : DEFAULT_PLANS;

      const augmentedProfiles = profiles?.map(p => {
        const sub = subs?.find((s: any) => s.id === p.id);
        return {
          ...p,
          totalChildren: childrenCountMap[p.id] || 0,
          plan: sub?.plan || 'axe'
        };
      }) || [];

      res.json({ profiles: augmentedProfiles, subs, plans });
    } catch (error: any) {
      console.error("[SERVER] Erro ao listar tenants:", error);
      return res.status(500).json({ error: "Erro ao listar tenants", details: error.message || String(error) });
    }
  });

  // API Route: Get Global Plans Config
  app.get("/api/plans", async (req, res) => {
    try {
      const { data: settings } = await supabaseAdmin
        .from('global_settings')
        .select('data')
        .eq('id', 'plans')
        .single();
        
      const plans = settings?.data && Object.keys(settings.data).length > 0 ? settings.data : DEFAULT_PLANS;
      res.json({ success: true, plans });
    } catch (error: any) {
      console.error("[SERVER] Erro ao buscar planos:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Generate Trial Account (Admin only)
  app.post("/api/admin/generate-trial", async (req, res) => {
    const { email, password, nome_terreiro, plan, days } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      if (authError || !user || !superAdmins.includes(user.email || '')) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // 1. Create User in Auth
      const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome_terreiro, plan, is_trial: true }
      });

      if (createError) throw createError;

      const targetUser = createdUser.user;
      const expiresAt = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

      // 2. Setup Subscription
      await supabaseAdmin.from('subscriptions').upsert({
        id: targetUser.id,
        plan: plan.toLowerCase(),
        status: 'active',
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      // 3. Setup Profile
      await supabaseAdmin.from('perfil_lider').upsert({
        id: targetUser.id,
        email: email,
        nome_terreiro,
        tenant_id: targetUser.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      res.json({ success: true, email, password, expiresAt });
    } catch (error: any) {
      console.error("[SERVER] Erro ao gerar trial:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Update Global Plans Config
  app.post("/api/admin/update-plans", async (req, res) => {
    const { plans } = req.body;
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');
      
      if (authError || !user || !isSuperAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { error: saveError } = await supabaseAdmin
        .from('global_settings')
        .upsert({
          id: 'plans',
          data: plans,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });

      if (saveError) throw saveError;

      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] Erro ao salvar planos:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Manage Tenant (Admin only)
  app.post("/api/admin/manage-tenant", async (req, res) => {
    const { targetUserId, action, newPlan } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);

      if (authError || !user) {
        console.error("[SERVER] Auth error in /api/admin/manage-tenant:", authError?.message || "No user found");
        return res.status(401).json({ error: "Sessão inválida: " + (authError?.message || "Usuário não encontrado") });
      }

      // Verificar se é Admin Global
      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');

      const { data: adminProfile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global')
        .eq('id', user.id)
        .single();

      if (!adminProfile?.is_admin_global && !isSuperAdmin) {
        return res.status(403).json({ error: "Acesso restrito a administradores globais" });
      }

      console.log(`[ADMIN COMMAND] Action: ${action} on User: ${targetUserId}`);

      switch (action) {
        case 'block':
          await supabaseAdmin.from('perfil_lider').update({ is_blocked: true }).eq('id', targetUserId);
          break;
        case 'unblock':
          await supabaseAdmin.from('perfil_lider').update({ is_blocked: false }).eq('id', targetUserId);
          break;
        case 'delete':
          await supabaseAdmin.from('perfil_lider').update({ deleted_at: new Date().toISOString() }).eq('id', targetUserId);
          break;
        case 'renew':
          const { amount, unit } = req.body;
          if (!amount || !unit) return res.status(400).json({ error: "Quantidade e unidade são obrigatórios para renovação" });
          
          // Buscar expiração atual
          const { data: currentSub } = await supabaseAdmin
            .from('subscriptions')
            .select('expires_at')
            .eq('id', targetUserId)
            .single();
            
          let baseDate = new Date();
          if (currentSub?.expires_at && new Date(currentSub.expires_at) > new Date()) {
            baseDate = new Date(currentSub.expires_at);
          }
          
          if (unit === 'days') {
            baseDate.setDate(baseDate.getDate() + parseInt(amount));
          } else if (unit === 'months') {
            baseDate.setMonth(baseDate.getMonth() + parseInt(amount));
          }
          
          await supabaseAdmin.from('subscriptions').upsert({
            id: targetUserId,
            expires_at: baseDate.toISOString(),
            status: 'active'
          }, { onConflict: 'id' });
          break;
        case 'change-plan':
          if (!newPlan) return res.status(400).json({ error: "Novo plano é obrigatório" });
          // Atualiza na tabela subscriptions
          await supabaseAdmin.from('subscriptions').upsert({ 
            id: targetUserId, 
            plan: newPlan,
            status: 'active'
          }, { onConflict: 'id' });
          break;
        default:
          return res.status(400).json({ error: "Ação inválida" });
      }

      res.json({ success: true, message: "Comando enviado com sucesso" });
    } catch (error: any) {
      console.error("[SERVER] Erro ao gerenciar tenant:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Update User Plan (Self-service / Payment Simulation)
  app.post("/api/v1/subscription/update-plan", async (req, res) => {
    const { plan } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    if (!plan) return res.status(400).json({ error: "Plano é obrigatório" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);

      if (authError || !user) {
        console.error("[SERVER] Auth error in /api/subscriptions (POST):", authError?.message || "No user found");
        return res.status(401).json({ error: "Sessão inválida: " + (authError?.message || "Usuário não encontrado") });
      }

      console.log(`[SUBSCRIPTION] Updating plan to ${plan} for user ${user.id}`);

      // Atualiza o plano na tabela subscriptions
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .upsert({ 
          id: user.id, 
          plan: plan,
          status: 'active'
        }, { onConflict: 'id' });

      if (updateError) throw updateError;

      res.json({ success: true, plan });
    } catch (error: any) {
      console.error("[SUBSCRIPTION] Erro ao atualizar plano:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Test Supabase Admin — desabilitado em produção
  app.get("/api/test-db", async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const { data, error } = await supabaseAdmin.from('perfil_lider').select('id').limit(1);
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Test DB error:", error);
      res.status(500).json({ error: "Database connection error" });
    }
  });

  // API Route: Get Single Child (Bypasses RLS)
  app.get("/api/children/:id", async (req, res) => {
    const childId = req.params.id;
    const userId = req.query.userId as string;
    const tenantIdFromQuery = req.query.tenantId as string;
    
    console.log(`[SERVER] GET /api/children/${childId} request received. userId:`, userId, "tenantId:", tenantIdFromQuery);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      let tenantId = tenantIdFromQuery;

      // 1. Get user's tenant_id if not provided
      if (!tenantId) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('perfil_lider')
          .select('tenant_id')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error("[SERVER] Error fetching profile for tenant_id:", profileError);
          return res.status(500).json({ error: "Failed to verify user tenant" });
        }
        tenantId = profile?.tenant_id;
      }

      console.log(`[SERVER] Using tenant_id:`, tenantId);

      // 2. Fetch the child, ensuring it belongs to the same tenant_id or lider_id
      let query = supabaseAdmin.from('filhos_de_santo').select('*').eq('id', childId);
      
      if (tenantId) {
         query = query.eq('tenant_id', tenantId);
      } else {
         query = query.eq('lider_id', userId);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error("[SERVER] Error fetching child:", error);
        return res.status(404).json({ error: "Filho não encontrado ou acesso negado" });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Unexpected error in GET /api/children/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Update Single Child (Bypasses RLS)
  app.put("/api/children/:id", async (req, res) => {
    const childId = req.params.id;
    const userId = req.query.userId as string;
    const tenantIdFromQuery = req.query.tenantId as string;
    const updateData = req.body;
    
    console.log(`[SERVER] PUT /api/children/${childId} request received. userId:`, userId, "tenantId:", tenantIdFromQuery);

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      let tenantId = tenantIdFromQuery;

      // 1. Get user's tenant_id if not provided
      if (!tenantId) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('perfil_lider')
          .select('tenant_id')
          .eq('id', userId)
          .single();

        if (profileError) {
          console.error("[SERVER] Error fetching profile for tenant_id:", profileError);
          return res.status(500).json({ error: "Failed to verify user tenant" });
        }
        tenantId = profile?.tenant_id;
      }

      // 2. Verify ownership before update
      let query = supabaseAdmin.from('filhos_de_santo').select('id').eq('id', childId);
      if (tenantId) {
         query = query.eq('tenant_id', tenantId);
      } else {
         query = query.eq('lider_id', userId);
      }
      const { data: existingChild, error: verifyError } = await query.single();

      if (verifyError || !existingChild) {
        return res.status(404).json({ error: "Filho não encontrado ou acesso negado" });
      }

      // 3. Update the child
      const { data, error } = await supabaseAdmin
        .from('filhos_de_santo')
        .update(updateData)
        .eq('id', childId)
        .select()
        .single();

      if (error) {
        console.error("[SERVER] Error updating child:", error);
        return res.status(500).json({ error: "Erro ao atualizar filho de santo" });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Unexpected error in PUT /api/children/:id:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Get Children (Bypasses RLS)
  app.get("/api/children", async (req, res) => {
    console.log(`[SERVER] GET /api/children request received. Query:`, req.query);
    const userId = req.query.userId as string;
    const tenantIdFromQuery = normalizeQueryTenantId(req.query.tenantId);
    const userRoleQ = String(req.query.userRole || "");

    if (!userId) {
      console.log(`[SERVER] GET /api/children - Missing userId`);
      return res.status(400).json({ error: "UserId is required" });
    }

    try {
      const tenantId = await resolveFinanceiroTenantScope(
        supabaseAdmin,
        userId,
        userRoleQ,
        tenantIdFromQuery
      );

      let query = supabaseAdmin.from('filhos_de_santo').select('*').order('nome', { ascending: true });
      
      if (tenantId) {
        console.log(`[SERVER] Fetching children for tenant_id/lider_id: ${tenantId}`);
        query = query.or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`);
      } else {
        console.log(`[SERVER] Fetching children for lider_id: ${userId}`);
        query = query.eq('lider_id', userId);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error(`[SERVER] Query error:`, error);
        throw error;
      }
      
      console.log(`[SERVER] GET /api/children success. Found ${data?.length || 0} children.`);
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Erro ao buscar filhos:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Add Child (Bypasses RLS)
  app.post("/api/children", async (req, res) => {
    const { userId, tenantId: tenantIdFromBody, childData } = req.body;
    
    // Verificação de Token (Isolamento de Tenant)
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      
      if (authError || !user || user.id !== userId) {
        return res.status(403).json({ error: "Operação proibida" });
      }

      // Buscar o tenant_id real do usuário no banco (NUNCA confiar no tenantId do body)
      const { data: userProfile } = await supabaseAdmin
        .from('perfil_lider')
        .select('tenant_id')
        .eq('id', userId)
        .single();
      
      const tenantId = userProfile?.tenant_id;
      if (!tenantId) return res.status(403).json({ error: "Tenant não configurado" });

      // Restituição dos campos conforme planejado originalmente
      const dataToInsert: any = {
        ...childData,
        lider_id: userId,
        tenant_id: tenantId
      };
      
      // Sanitização de dados vazios
      if (dataToInsert.data_nascimento === '') dataToInsert.data_nascimento = null;
      if (dataToInsert.data_entrada === '') dataToInsert.data_entrada = null;
      if (childData.id && childData.id !== '') dataToInsert.id = childData.id;
      
      console.log(`[SERVER] Inserting child data:`, dataToInsert);

      const { data, error } = await supabaseAdmin
        .from('filhos_de_santo')
        .insert([dataToInsert])
        .select()
        .single();

      if (error) {
        console.error(`[SERVER] Insert error:`, error);
        throw error;
      }
      
      console.log(`[SERVER] POST /api/children success. Inserted child ID: ${data.id}`);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Erro ao adicionar filho:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Get Events (Bypasses RLS)
  app.get("/api/events", async (req, res) => {
    const { tenantId, start, end } = req.query;
    // tenantId obrigatório para evitar vazamento de dados entre tenants
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return res.status(400).json({ error: "tenantId é obrigatório" });
    }
    try {
      const resolvedId = await resolveLeaderId(tenantId);
      const ids = Array.from(new Set([tenantId, resolvedId].filter(Boolean)));
      const tenantFilters = ids.flatMap((id) => [`tenant_id.eq.${id}`, `lider_id.eq.${id}`]).join(',');
      let query = supabaseAdmin
        .from('calendario_axe')
        .select('*')
        .or(tenantFilters)
        .order('data', { ascending: true });
      if (start) query = query.gte('data', start as string);
      if (end) query = query.lte('data', end as string);
      
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching events:", error.message || error);
      res.status(500).json({ error: "Erro ao buscar eventos" });
    }
  });

  // API Route: Create Event (Verifies Plan)
  app.post("/api/events", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        console.error("[SERVER] Auth error in /api/events (POST):", authError?.message || "No user found");
        return res.status(401).json({ error: "Sessão inválida: " + (authError?.message || "Usuário não encontrado") });
      }

      // Verificar o plano do usuário
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan')
        .eq('id', user.id)
        .single();
        
      const { data: profile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global, tenant_id')
        .eq('id', user.id)
        .single();

      const plan = sub?.plan?.toLowerCase() || 'axe';
      const isGlobalAdmin = profile?.is_admin_global;

      // Se for plano axe e não for admin global, bloqueia
      if (plan === 'axe' && !isGlobalAdmin) {
        return res.status(403).json({ error: "O plano Axé não permite a criação de eventos. Faça upgrade para o plano Orô." });
      }

      const eventData = {
        ...req.body,
        lider_id: user.id,
        tenant_id: profile?.tenant_id || user.id
      };

      const { data, error } = await supabaseAdmin
        .from('calendario_axe')
        .insert([eventData])
        .select()
        .single();

      if (error) throw error;

      try {
        await sendWebPushToFilhosDoTerreiro(profile?.tenant_id || user.id, {
          title: `Novo evento: ${req.body.titulo}`,
          body: `${req.body.data} às ${req.body.hora}`,
          url: '/calendar',
        });
      } catch (pushErr: any) {
        console.error('[SERVER] Push após criar evento:', pushErr?.message || pushErr);
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Error creating event:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Delete Event (Verifies Plan)
  app.delete("/api/events/:id", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        console.error("[SERVER] Auth error in /api/events (DELETE):", authError?.message || "No user found");
        return res.status(401).json({ error: "Sessão inválida: " + (authError?.message || "Usuário não encontrado") });
      }

      // Verificar o plano do usuário
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan')
        .eq('id', user.id)
        .single();
        
      const { data: profile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global, tenant_id')
        .eq('id', user.id)
        .single();

      const plan = sub?.plan?.toLowerCase() || 'axe';
      const isGlobalAdmin = profile?.is_admin_global;

      if (plan === 'axe' && !isGlobalAdmin) {
        return res.status(403).json({ error: "O plano Axé não permite a exclusão de eventos." });
      }

      const { error } = await supabaseAdmin
        .from('calendario_axe')
        .delete()
        .eq('id', req.params.id);

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] Error deleting event:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Get Notices (Bypasses RLS)
  app.get("/api/notices", async (req, res) => {
    const { tenantId } = req.query;
    // tenantId obrigatório para evitar vazamento de dados entre tenants
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return res.status(400).json({ error: "tenantId é obrigatório" });
    }
    try {
      // Resolve o id real do perfil_lider para garantir compatibilidade com a FK
      const resolvedId = await resolveLeaderId(tenantId);
      const { data, error } = await supabaseAdmin
        .from('mural_avisos')
        .select('*')
        .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`)
        .order('data_publicacao', { ascending: false });
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching notices:", error.message || error);
      res.status(500).json({ error: "Erro ao buscar avisos" });
    }
  });

  // API Route: Create Notice (Bypasses RLS)
  app.post("/api/notices", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      const { titulo, conteudo, categoria, data_publicacao, expiracao } = req.body;

      if (!titulo || !conteudo) {
        return res.status(400).json({ error: "Título e conteúdo são obrigatórios." });
      }

      const zeladorId = authUserIdFromToken(user, token);
      if (!zeladorId) {
        return res.status(401).json({ error: "Sessão inválida (id do usuário ausente)." });
      }

      await ensurePerfilLiderForMural({ id: zeladorId, email: user.email });

      const { data: pl } = await supabaseAdmin
        .from('perfil_lider')
        .select('id, tenant_id')
        .eq('id', zeladorId)
        .maybeSingle();
      if (!pl?.id) {
        return res.status(500).json({
          error: 'Não foi possível garantir perfil_lider para sua conta. Confira colunas obrigatórias da tabela ou execute o SQL de migração.',
        });
      }

      const logicalTenant =
        typeof pl.tenant_id === 'string' && pl.tenant_id.length > 10 ? pl.tenant_id : zeladorId;
      await ensureSubscriptionForMural(zeladorId, logicalTenant);

      let sub: { id?: string; tenant_id?: string | null } | null = null;
      const subRes = await supabaseAdmin.from('subscriptions').select('id, tenant_id').eq('id', zeladorId).maybeSingle();
      if (!subRes.error) sub = subRes.data;

      const resolvedLeader = await resolveLeaderId(zeladorId);
      const tenantCandidates = [zeladorId, resolvedLeader, pl.tenant_id, sub?.tenant_id].filter(
        (v): v is string => typeof v === 'string' && v.length > 10
      );
      const uniqueTenants = [...new Set(tenantCandidates)];

      const baseRow = {
        titulo,
        conteudo,
        categoria: categoria || 'Geral',
        data_publicacao: data_publicacao || new Date().toISOString(),
        expiracao: expiracao || null,
      };

      let inserted: any = null;
      let lastErr: any = null;
      const errLog: string[] = [];
      for (const tid of uniqueTenants) {
        const ins = await supabaseAdmin
          .from('mural_avisos')
          .insert([{ ...baseRow, tenant_id: tid }])
          .select()
          .single();
        if (!ins.error) {
          inserted = ins.data;
          break;
        }
        lastErr = ins.error;
        errLog.push(`${tid}: ${ins.error?.message || ins.error?.code || JSON.stringify(ins.error)}`);
        // Sempre tenta todos: PostgREST nem sempre marca FK com code 23503
      }

      if (!inserted) {
        console.error('[SERVER] mural insert failed; candidatos:', uniqueTenants.join(', '));
        console.error('[SERVER] mural erros por tenant_id:', errLog.join(' | '));
        return res.status(500).json({
          error: lastErr?.message || 'Não foi possível publicar o aviso (FK tenant_id).',
          details: {
            zeladorId,
            candidatos: uniqueTenants,
            perfil_lider_id: pl.id,
            perfil_lider_tenant_id: pl.tenant_id ?? null,
            erros: errLog,
            hint:
              'Confirme que o .env aponta para o mesmo projeto Supabase onde rodou o SQL. Rode scripts/fix_mural_avisos_fk.sql (recria FK) ou scripts/remove_mural_tenant_fk.sql (remove FK).',
          },
        });
      }

      try {
        const pushTenant = inserted?.tenant_id || logicalTenant;
        await sendWebPushToFilhosDoTerreiro(pushTenant, {
          title: `📢 ${titulo}`,
          body: (conteudo || '').substring(0, 120),
          url: '/mural',
        });
      } catch (pushErr: any) {
        console.error('[SERVER] Push após mural:', pushErr?.message || pushErr);
      }

      res.json({ data: inserted });
    } catch (error: any) {
      console.error("[SERVER] Error creating notice:", error.message || error);
      res.status(500).json({ error: error.message || "Erro ao publicar aviso" });
    }
  });

  // API Route: Get Inventory (Bypasses RLS)
  app.get("/api/inventory", async (req, res) => {
    const { tenantId } = req.query;
    try {
      let query = supabaseAdmin.from('almoxarifado').select('*').order('item', { ascending: true });
      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching inventory:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Add Inventory Item (Bypasses RLS)
  app.post("/api/inventory", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }

      const { item, categoria, quantidade_atual, quantidade_minima, tenantId } = req.body;
      console.log("[SERVER] Creating inventory item:", { item, categoria, quantidade_atual, quantidade_minima, tenantId });

      if (!item || !categoria) {
        return res.status(400).json({ error: "Nome do item e categoria são obrigatórios." });
      }

      const insertData = {
        item,
        categoria,
        quantidade_atual: Number(quantidade_atual) || 0,
        quantidade_minima: Number(quantidade_minima) || 0,
        lider_id: user.id,
        tenant_id: tenantId || user.id,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('almoxarifado')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Error creating inventory item:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Get Transactions (Bypasses RLS)
  app.get("/api/transactions", async (req, res) => {
    const { tenantId, userId, userRole, limit } = req.query;
    try {
      const userRoleStr = String(userRole || "").toLowerCase();
      const tenantIdRaw = normalizeQueryTenantId(tenantId);
      let effectiveTenant = "";
      if (userRoleStr !== "filho") {
        effectiveTenant = await resolveFinanceiroTenantScope(
          supabaseAdmin,
          userId as string,
          userRoleStr,
          tenantIdRaw
        );
      }

      let query = supabaseAdmin.from('financeiro').select('*').order('data', { ascending: false });
      
      if (userRoleStr !== "filho" && effectiveTenant) {
        query = query.or(`tenant_id.eq.${effectiveTenant},lider_id.eq.${effectiveTenant}`);
      }
      
      if (userRole === 'filho' && userId) {
        try {
          const { data: childData } = await supabaseAdmin
            .from('filhos_de_santo')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (childData) {
            const fid = childData.id;
            const { error: checkColError } = await supabaseAdmin.from('financeiro').select('filho_id').limit(1);
            if (!checkColError) {
              query = query.or(`filho_id.eq.${fid},and(categoria.eq.Mensalidade,descricao.ilike.%(ID:${fid})%)`);
            } else {
              query = query.ilike('descricao', `% (ID:${fid})%`);
            }
          } else {
            return res.json({ data: [] });
          }
        } catch (e) {
          console.error("[SERVER] Error resolving child ID for financial query:", e);
        }
      }

      if (limit) {
        query = query.limit(Number(limit));
      }

      const { data, error } = await query;
      if (error) throw error;
      const filtered = (data || []).filter(
        (r: any) => String(r?.status || "").toLowerCase() !== "excluido"
      );
      res.json({ data: filtered });
    } catch (error: any) {
      console.error("[SERVER] Error fetching transactions:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  function isFinanceiroFkDeleteError(err: any): boolean {
    const code = String(err?.code || "");
    const msg = String(err?.message || err || "");
    return code === "23503" || /foreign key|violates foreign key constraint/i.test(msg);
  }

  async function userMayDeleteFinanceiroRow(user: { id: string; user_metadata?: Record<string, unknown> }, row: any) {
    const role = String(user.user_metadata?.role || "").toLowerCase();
    if (role === "filho") {
      const { data: child } = await supabaseAdmin
        .from("filhos_de_santo")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!child?.id) return false;
      if (row.filho_id === child.id) return true;
      const m = String(row.descricao || "").match(/\(ID:([^)]+)\)/);
      return !!(m && m[1] === child.id);
    }
    const { data: profile } = await supabaseAdmin
      .from("perfil_lider")
      .select("id, tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return false;
    const house = profile.tenant_id || profile.id;
    const resolvedHouse = await resolveLeaderId(String(house));
    const candidates = new Set(
      [user.id, profile.id, profile.tenant_id, house, resolvedHouse].filter((x) => typeof x === "string" && x.length > 0)
    );
    for (const k of candidates) {
      if (row.lider_id === k || row.tenant_id === k) return true;
    }
    if (row.tenant_id) {
      const r = await resolveLeaderId(String(row.tenant_id));
      if (candidates.has(r)) return true;
    }
    return false;
  }

  app.delete("/api/transactions/:id", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id obrigatório" });
    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Sessão inválida" });
      }
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from("financeiro")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return res.status(404).json({ error: "Lançamento não encontrado" });
      const allowed = await userMayDeleteFinanceiroRow(user, row);
      if (!allowed) return res.status(403).json({ error: "Sem permissão para excluir este lançamento" });

      const { error: delErr } = await supabaseAdmin.from("financeiro").delete().eq("id", id);
      if (!delErr) {
        return res.json({ success: true, mode: "hard" });
      }
      if (isFinanceiroFkDeleteError(delErr)) {
        const { error: softErr } = await supabaseAdmin
          .from("financeiro")
          .update({ status: "excluido" })
          .eq("id", id);
        if (!softErr) {
          return res.json({ success: true, mode: "soft", reason: "foreign_key" });
        }
        console.error("[SERVER] DELETE financeiro FK fallback (status=excluido) falhou:", {
          id,
          deleteError: delErr,
          softStatusError: softErr,
        });
        return res.status(409).json({
          error:
            "Não foi possível excluir por vínculo no banco e o soft delete falhou. Confirme a coluna `status` em `financeiro`.",
          details: String(delErr?.message || delErr),
        });
      }
      console.error("[SERVER] DELETE financeiro:", { id, deleteError: delErr });
      return res.status(500).json({ error: String(delErr?.message || delErr) });
    } catch (error: any) {
      console.error("[SERVER] /api/transactions DELETE:", error?.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Get Library Materials (Bypasses RLS)
  app.get("/api/library", async (req, res) => {
    const { tenantId } = req.query;
    try {
      let query = supabaseAdmin.from('biblioteca').select('*').order('created_at', { ascending: false });
      if (tenantId) {
        // Tentamos buscar por tenant_id ou lider_id (se não existir lider_id, ignora para não dar erro)
        // Como library só usa tenant_id oficialmente, eq direto
        query = query.eq('tenant_id', tenantId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching library:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Get Notifications (Bypasses RLS)
  app.get("/api/notifications", async (req, res) => {
    const { tenantId, tipo, lida, limit } = req.query;
    try {
      let query = supabaseAdmin.from('notificacoes').select('*').order('created_at', { ascending: false });
      
      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (tipo) query = query.eq('tipo', tipo);
      if (lida !== undefined) query = query.eq('lida', lida === 'true');
      if (limit) query = query.limit(Number(limit));
      
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching notifications:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // ==========================================
  // Web Push Notifications
  // ==========================================

  app.post("/api/push-subscribe", async (req, res) => {
    try {
      const { subscription, userId, tenantId } = req.body;
      if (!subscription || !userId) {
        return res.status(400).json({ error: "Missing subscription or userId" });
      }

      // Fetch user metadata first
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError) throw userError;

      const metaRole = String(userData.user.user_metadata?.role || '').toLowerCase();
      const { data: filhoVinculo } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (metaRole !== 'filho' && !filhoVinculo) {
        return res.status(403).json({ error: 'Apenas filhos de santo podem ativar notificações push.' });
      }

      const currentPushSubs = userData.user.user_metadata?.push_subscriptions || [];
      
      // Prevent duplicates by checking if endpoint already exists
      const existingIndex = currentPushSubs.findIndex((sub: any) => sub.endpoint === subscription.endpoint);
      
      if (existingIndex === -1) {
        currentPushSubs.push(subscription);
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            ...userData.user.user_metadata,
            push_subscriptions: currentPushSubs
          }
        });
        if (updateError) throw updateError;
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] Error in push-subscribe:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.post("/api/push-broadcast", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Sessão inválida" });

      const { tenantId, title, body, url } = req.body;
      
      if (!tenantId) {
        return res.status(400).json({ error: "Missing tenantId" });
      }

      const sentCount = await sendWebPushToFilhosDoTerreiro(tenantId, { title, body, url });

      res.json({ success: true, sentCount });
    } catch (error: any) {
      console.error("[SERVER] Error in push-broadcast:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  app.post("/api/push-direct", async (req, res) => {
    try {
      const { childId, title, body, url } = req.body;
      
      if (!childId) {
        return res.status(400).json({ error: "Missing childId" });
      }

      // Find the specific user_id representing this child
      const { data: child, error: childError } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('user_id')
        .eq('id', childId)
        .single();
        
      if (childError) throw childError;
      
      if (!child.user_id) {
        return res.json({ success: false, message: "Filho doesn't have an associated user account" });
      }
      
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(child.user_id);
      if (userError) throw userError;

      const subs = userData.user.user_metadata?.push_subscriptions || [];
      let sentCount = 0;
      
      for (const sub of subs) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title, body, url: url || '/' }));
          sentCount++;
        } catch (e: any) {
          console.error("[SERVER] Direct push send error:", e);
        }
      }

      res.json({ success: true, sentCount });
    } catch (error: any) {
      console.error("[SERVER] Error in push-direct:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // End Web Push Notifications
  // ==========================================

  // API Route: Get Event Guests (Bypasses RLS)
  app.get("/api/event-guests", async (req, res) => {
    const { eventId } = req.query;
    try {
      if (!eventId) return res.status(400).json({ error: "Missing eventId" });
      
      const { data, error } = await supabaseAdmin
        .from('convidados_eventos')
        .select('*')
        .eq('event_id', eventId)
        .order('nome');
        
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching event guests:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API Route: Update Event Guest Status (Bypasses RLS)
  app.post("/api/event-guests/update-status", async (req, res) => {
    const { guestId, status } = req.body;
    try {
      if (!guestId || !status) return res.status(400).json({ error: "Missing guestId or status" });
      
      const { data, error } = await supabaseAdmin
        .from('convidados_eventos')
        .update({ status })
        .eq('id', guestId);
        
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("[SERVER] Error updating event guest status:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // --- Baileys WhatsApp Provider Implementation (Multi-Tenant) ---
  
  type WhatsAppSession = {
    sock: any;
    qr: string | null;
    connectionStatus: 'DISCONNECTED' | 'CONNECTED' | 'QRCODE' | 'LOADING';
  };
  
  const whatsappSessions: Map<string, WhatsAppSession> = new Map();

  function getSession(tenantId: string): WhatsAppSession {
    if (!whatsappSessions.has(tenantId)) {
      whatsappSessions.set(tenantId, {
        sock: null,
        qr: null,
        connectionStatus: 'DISCONNECTED'
      });
    }
    return whatsappSessions.get(tenantId);
  }

  async function connectToWhatsApp(tenantId: string) {
    try {
      const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = await import('@whiskeysockets/baileys');
      const { default: pino } = await import('pino');
      const fs = await import('fs');
      const path = await import('path');
      const QRCode = await import('qrcode');

      const session = getSession(tenantId);

      if (session.connectionStatus === 'CONNECTED' || (session.connectionStatus === 'LOADING' && session.sock)) return;
      
      session.connectionStatus = 'LOADING';

      const { version } = await fetchLatestBaileysVersion();
      
      const authPath = path.resolve(process.cwd(), 'auth_info', tenantId);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);

      session.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        browser: ['AxéCloud', 'Chrome', '1.0.0']
      });

      session.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr: newQr } = update;

        if (newQr) {
          session.qr = await QRCode.toDataURL(newQr);
          session.connectionStatus = 'QRCODE';
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const errorMsg = lastDisconnect?.error?.message || '';
          
          const isConnectionFailure = statusCode === 401 && errorMsg.includes('Connection Failure');
          const isLoggedOut = (statusCode === DisconnectReason.loggedOut || statusCode === 401) && !isConnectionFailure;
          const isConflict = statusCode === DisconnectReason.connectionReplaced;
          
          const shouldReconnect = !isLoggedOut && !isConflict;
          
          console.log(`[WP - ${tenantId}] Conexão fechada. Código: ${statusCode}. Motivo:`, errorMsg || 'Desconhecido', '. Reconectando:', shouldReconnect);
          
          session.connectionStatus = 'DISCONNECTED';
          session.qr = null;
          
          if (shouldReconnect) {
            setTimeout(() => connectToWhatsApp(tenantId), 5000);
          } else {
            console.log(`[WP - ${tenantId}] Reconexão cancelada devido a Logout ou Conflito (Stream Errored). Limpando credenciais...`);
            session.sock = null;
            if (isLoggedOut || isConflict) {
              if (fs.existsSync(authPath)) {
                 fs.rmSync(authPath, { recursive: true, force: true });
                 console.log(`[WP - ${tenantId}] Pasta auth_info removida com sucesso. Requisite um novo QR Code.`);
              }
            }
          }
        } else if (connection === 'open') {
          console.log(`[WP - ${tenantId}] WhatsApp Conectado com Baileys!`);
          session.connectionStatus = 'CONNECTED';
          session.qr = null;
        }
      });

      session.sock.ev.on('messages.upsert', async (m: any) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (!textMessage || !senderJid) return;

        const cleanText = textMessage.trim().toUpperCase();
        
        const isConfirmation = cleanText.startsWith('SIM') || cleanText.startsWith('NAO') || cleanText.startsWith('NÃO');

        if (isConfirmation) {
           const match = cleanText.match(/^(SIM|NAO|NÃO)(?:\s+(\d{8,11}))?\s*$/i);
           
           if (!match) return;

           const action = match[1].toUpperCase();
           const extractedPhoneFromText = match[2];
           
           const isLid = senderJid.includes('@lid');
           const defaultSenderPhone = senderJid.replace(/[^0-9]/g, ''); 
           
           const newStatus = action === 'SIM' ? 'Confirmado' : 'Recusado';
           
           try {
             let searchPhone = extractedPhoneFromText || defaultSenderPhone;
             const last8 = searchPhone.slice(-8);
             
             console.log(`[WP BOT - ${tenantId}] Recebeu '${action}' de jid: ${senderJid} (isLid=${isLid}). Buscando final: ${last8}`);

             const { data: convites, error: queryError } = await supabaseAdmin
               .from('convidados_eventos')
               .select('*')
               .eq('tenant_id', tenantId)
               .ilike('telefone', `%${last8}`);
              
              if (queryError) {
                  console.error(`[WP BOT - ${tenantId}] Erro de DB ao consultar convite:`, queryError.message);
                  return;
              }

              if (convites && convites.length > 0) {
                 const convitesPendentes = convites.filter((c: any) => c.status !== newStatus);
                 
                 for (const convite of convitesPendentes) {
                    await supabaseAdmin
                      .from('convidados_eventos')
                      .update({ status: newStatus })
                      .eq('id', convite.id);
                 }
                 
                 if (convitesPendentes.length > 0) {
                    const confirmMsg = action === 'SIM' 
                      ? "Axé! Sua presença foi confirmada com sucesso. Aguardamos você!"
                      : "Agradecemos o aviso! Sua ausência foi registrada. Pai/Mãe Oxalá abençoe!";
                    await enviarMensagem(tenantId, senderJid, confirmMsg);
                    console.log(`[WP BOT - ${tenantId}] Presença atualizada como ${newStatus} para os eventos atrelados!`);
                 } else {
                     await enviarMensagem(tenantId, senderJid, `Seu status já constava como ${newStatus} em nosso sistema! Axé.`);
                 }
              } else {
                 console.log(`[WP BOT - ${tenantId}] Nenhum convite atrelado a este número (final ${last8}).`);
                 if (isLid && !extractedPhoneFromText) {
                    const fallbackMsg = "Axé! Recebemos sua mensagem, mas por questões de privacidade do WhatsApp Comercial, não conseguimos identificar seu número de telefone original automaticamente.\n\nPara confirmarmos sua presença no sistema, por favor reenvie sua resposta incluindo seu número com DDD.\n\n*Exemplo: SIM 11999999999*";
                    await enviarMensagem(tenantId, senderJid, fallbackMsg);
                 } else {
                    const errorMsg = "Não localizamos nenhum convite pendente para este número de telefone no sistema do Terreiro. Houve alguma alteração de número?";
                    await enviarMensagem(tenantId, senderJid, errorMsg);
                 }
              }
           } catch(e: any) {
             console.error(`[WP BOT - ${tenantId}] Internal Error:`, e);
           }
        }
      });

      session.sock.ev.on('creds.update', saveCreds);

    } catch (err) {
      console.error(`[WP - ${tenantId}] Erro fatal na inicialização do Baileys:`, err);
      const session = getSession(tenantId);
      session.connectionStatus = 'DISCONNECTED';
    }
  }

  const enviarMensagem = async (tenantId: string, numero: string, texto: string) => {
    const session = getSession(tenantId);
    if (!session.sock || session.connectionStatus !== 'CONNECTED') {
      console.error(`[WP - ${tenantId}] Erro: Tentativa de envio sem conexão ativa.`);
      return false;
    }
    try {
      let jid = numero;
      
      if (!numero.includes('@')) {
        let cleanNumber = numero.replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) {
          cleanNumber = `55${cleanNumber}`;
        }
        jid = `${cleanNumber}@s.whatsapp.net`;
      }
      
      console.log(`[WP - ${tenantId}] Tentando enviar mensagem para o JID EXATO: ${jid}`);
      await session.sock.sendMessage(jid, { text: texto });
      console.log(`[WP - ${tenantId}] Mensagem enviada com sucesso para o JID: ${jid}`);
      
      return true;
    } catch (err: any) {
      console.error(`[WP - ${tenantId}] Falha ao enviar mensagem para o JID ${numero}:`, err.message);
      return false;
    }
  };

  // --- WHATSAPP INTEGRATION ENDPOINTS ---

  app.post("/api/whatsapp/config", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const config = req.body;
      const { error } = await supabaseAdmin
        .from('whatsapp_config')
        .upsert({
          ...config,
          id: user.id,
          tenant_id: user.id,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { tipo, filhoId, variables, forcePhone } = req.body;

      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('*')
        .eq('tenant_id', user.id)
        .single();

      const session = getSession(user.id);
      if (session.connectionStatus !== 'CONNECTED') {
         return res.status(400).json({ error: "WhatsApp não configurado ou desconectado no Servidor" });
      }

      let phone = forcePhone;
      if (!phone && filhoId) {
        const { data: filho } = await supabaseAdmin
          .from('filhos_de_santo')
          .select('whatsapp_phone')
          .eq('id', filhoId)
          .single();
        phone = filho?.whatsapp_phone;
      }

      if (!phone) return res.status(400).json({ error: "Telefone não encontrado" });

      phone = phone.replace(/\D/g, '');
      if (!phone.startsWith('55')) phone = '55' + phone;

      let message = config?.templates?.[tipo] || "Mensagem do AxéCloud";
      
      if (tipo === 'cobranca_mensalidade' && !config?.templates?.[tipo]) {
        message = "Olá, {{nome_filho}}! Passando para lembrar da sua mensalidade de {{mes_ano}} no valor de R$ {{valor}} no {{nome_terreiro}}. Sua contribuição é fundamental para o nosso fundamento. Axé!";
      }
      if (tipo === 'financeiro' && !config?.templates?.[tipo]) {
        message = "Olá, {{nome_filho}}! Lembramos do pagamento de sua mensalidade no valor de R$ {{valor_mensalidade}}, com vencimento em {{data_vencimento}}, para o terreiro {{nome_terreiro}}. Axé!";
      }
      if (tipo === 'mural_aviso' && !config?.templates?.[tipo]) {
        message = "Paz e Luz, {{nome_filho}}! Há um novo aviso no Mural do terreiro {{nome_terreiro}}:\n\n*{{titulo_aviso}}*\n\nAcesse o sistema para ver os detalhes. Axé!";
      }
      if (tipo === 'estoque_critico' && !config?.templates?.[tipo]) {
        message = "⚠️ *ALERTA DE ESTOQUE* ⚠️\nOlá! O item *{{item_nome}}* atingiu o nível crítico no {{nome_terreiro}}.\nQuantidade atual: {{quantidade}}\nPor favor, providencie a reposição conforme necessário.";
      }
      if (tipo === 'convite_evento' && !config?.templates?.[tipo]) {
        message = "Paz e Luz, {{nome_convidado}}!\nO terreiro {{nome_terreiro}} tem a honra de te convidar para o nosso próximo encontro:\n\n*{{nome_evento}}*\n📅 Data: {{data_evento}}\n⏰ Horário: {{hora_evento}}\n\n⏳ *Por favor, responda com SIM para confirmar sua presença, ou NÃO caso não possa comparecer.*\n\nAguardamos sua presença! Axé!";
      }
      if (tipo === 'boas_vindas' && !config?.templates?.[tipo]) {
        message = "Seja muito bem-vindo(a), porta de entrada do Axé, {{nome_filho}}! 🙏\n\nÉ uma alegria imensa ter você fazendo parte da família {{nome_terreiro}}. Que sua caminhada seja de muita luz, aprendizado e evolução sob a proteção dos nossos Orixás e Guias.\n\nEste é o nosso canal oficial de comunicação. Por aqui você receberá avisos, calendários e informações importantes do terreiro.\n\nAxé! ✨";
      }

      Object.entries(variables || {}).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      });

      if (message.includes('nota sigilosa') || message.includes('segredo')) {
        message = "Você tem uma nova atualização sigilosa no seu prontuário. Acesse o AxéCloud para conferir.";
      }

      setTimeout(async () => {
        try {
          console.log(`[WHATSAPP - ${user.id}] Dispatching message to ${phone}`);
          let externalId = `msg_${Math.random().toString(36).substr(2, 9)}`;

          if (session.connectionStatus === 'CONNECTED') {
             try {
                const success = await enviarMensagem(user.id, phone, message);
                if (success) console.log(`[WP - ${user.id}] Mensagem disparada com sucesso.`);
             } catch(e: any) {
                console.error(`[WP - ${user.id}] Falha ao enviar:`, e.message);
             }
          }

          await supabaseAdmin.from('whatsapp_logs').insert({
            tenant_id: user.id,
            filho_id: filhoId,
            tipo,
            telefone: phone,
            mensagem: message,
            status: 'sent',
            external_id: externalId
          });

        } catch (err: any) {
          console.error(`[WHATSAPP - ${user.id}] Dispatch Error:`, err.message);
        }
      }, 500);

      res.json({ success: true, message: "Mensagem enfileirada para envio" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    const { instance, data } = req.body;
    const externalId = data?.key?.id;
    const status = data?.status;

    if (externalId) {
      let mappedStatus = 'sent';
      if (status === 'DELIVERY_ACK') mappedStatus = 'delivered';
      if (status === 'READ') mappedStatus = 'read';

      await supabaseAdmin
        .from('whatsapp_logs')
        .update({ status: mappedStatus })
        .eq('external_id', externalId);
    }

    res.status(200).send('OK');
  });

  app.post("/api/whatsapp/start", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      if (session.connectionStatus === 'CONNECTED') {
        return res.json({ message: "WhatsApp já está conectado." });
      }
      
      session.sock = null; 
      connectToWhatsApp(user.id);
      res.json({ message: "Iniciando Baileys..." });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/test-message", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Telefone é obrigatório." });

      const msg = "Axé! Este é um teste de conexão do AxéCloud. Se você recebeu isso, seu terreiro já está automatizado!";
      const success = await enviarMensagem(user.id, phone, msg);

      if (success) {
        return res.json({ success: true, message: "Mensagem enviada com sucesso!" });
      } else {
        return res.status(500).json({ error: "Falha ao enviar." });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/whatsapp/status", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      res.json({
          status: session.connectionStatus,
          qrcode: session.qr
      });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/whatsapp/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const session = getSession(user.id);
      if (session.sock) {
          try {
              await session.sock.logout();
              session.sock = null;
              session.connectionStatus = 'DISCONNECTED';
              session.qr = null;
              
              const fs = await import('fs');
              const path = await import('path');
              const authPath = path.resolve(process.cwd(), 'auth_info', user.id);
              if (fs.existsSync(authPath)) {
                 fs.rmSync(authPath, { recursive: true, force: true });
                 console.log(`[WP - ${user.id}] Pasta auth_info removida após logout.`);
              }
          } catch(e) {
              console.error(`[WP - ${user.id}] Falha ao deslogar:`, e);
          }
      }
      
      res.json({ message: "Sessão Baileys encerrada" });
    } catch(err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  setTimeout(async () => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const authRoot = path.resolve(process.cwd(), 'auth_info');
      
      if (fs.existsSync(authRoot)) {
        const directories = fs.readdirSync(authRoot, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);
        
        for (const tenantId of directories) {
          const credsPath = path.join(authRoot, tenantId, 'creds.json');
          if (fs.existsSync(credsPath)) {
            console.log(`[WP - ${tenantId}] Sessão anterior detectada. Restaurando...`);
            connectToWhatsApp(tenantId);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }
    } catch (e: any) {
      console.error("[WP] Erro no auto-init:", e.message);
    }
  }, 5000);

// --- ADMIN DEMO SEEDING ENDPOINTS ---

  app.post("/api/admin/seed-demo", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');
      
      const { data: adminProfile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global')
        .eq('id', user.id)
        .single();
      
      if (!adminProfile?.is_admin_global && !isSuperAdmin) {
        return res.status(403).json({ error: "Acesso restrito a administradores globais" });
      }

      const { 
        tenantsCount = 5, 
        childrenCount = 10, 
        inventoryCount = 15, 
        storeCount = 10, 
        libraryCount = 8, 
        eventsCount = 5, 
        financialCount = 20,
        plan: receivedPlan = 'axe'
      } = req.body;
      
      const plan = (receivedPlan === 'free' || !receivedPlan) ? 'axe' : receivedPlan;

      console.log(`[DEMO SEED] DEBUG RECEIVED PLAN: '${receivedPlan}'`);
      console.log(`[DEMO SEED] DEBUG SANITIZED PLAN: '${plan}'`);
      console.log(`[DEMO SEED] Starting seeding for ${tenantsCount} tenants with plan ${plan}...`);

      for (let i = 0; i < tenantsCount; i++) {
        const randomSuffix = Math.floor(Math.random() * 100000);
        const tenantName = `Meu Terreiro ${randomSuffix}`;
        const fakeEmail = `demo.terreiro.${randomSuffix}@axecloud.demo`;
        const pass = "123456";

        // 1. Create Auth User
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password: pass,
          email_confirm: true,
          user_metadata: { nome_terreiro: tenantName }
        });

        if (createError) {
            console.error(`[DEMO SEED] Error creating auth user ${fakeEmail}: `, createError.message);
            continue;
        }
        
        const tenantId = newUser.user.id;

        // 2. Create Profile
        await supabaseAdmin.from('perfil_lider').insert({
          id: tenantId,
          email: fakeEmail,
          nome_terreiro: tenantName,
          cargo: `Zelador ${i + 1}`,
          role: 'admin',
          tenant_id: tenantId
        });

        // 3. Create Subscription
        await supabaseAdmin.from('subscriptions').insert({
          id: tenantId,
          plan: 'premium',
          status: 'active',
          tenant_id: tenantId,
          expires_at: '2099-12-31T23:59:59Z'
        });

        // 4. Create Children
        const children = [];
        for (let j = 0; j < childrenCount; j++) {
            children.push({
                tenant_id: tenantId,
                lider_id: tenantId,
                nome: `Filho de Santo ${j + 1} (${tenantName})`,
                data_nascimento: '1990-01-01',
                cargo: j % 5 === 0 ? 'Ekedji' : 'Filho de Santo'
            });
        }
        let childrenData = []; // Inicializar como array vazio
        if (children.length > 0) {
            const { data, error: childrenErr } = await supabaseAdmin.from('filhos_de_santo').insert(children).select();
            if (childrenErr) {
               console.error(`[DEMO SEED] Error inserting children for ${tenantName}:`, childrenErr.message);
            } else {
               childrenData = data || [];
            }
        } else {
             console.log(`[DEMO SEED] No children to insert for ${tenantName}`);
        }

        // 5. Create Inventory
        const inventory = [];
        for (let k = 0; k < inventoryCount; k++) {
            inventory.push({
                tenant_id: tenantId,
                nome: `Item Almoxarifado ${k + 1}`,
                categoria: k % 3 === 0 ? 'Luz' : 'Ritual',
                quantidade: Math.floor(Math.random() * 50) + 1,
                unidade: 'un'
            });
        }
        await supabaseAdmin.from('almoxarifado').insert(inventory);

        // 6. Create Store Products (Comentado pois a tabela não existe)
        /*
        const products = [];
        for (let l = 0; l < storeCount; l++) {
            products.push({
                tenant_id: tenantId,
                nome: `Produto Loja ${l + 1}`,
                descricao: `Descrição do produto ${l + 1}`,
                preco: (Math.random() * 100) + 10,
                estoque: Math.floor(Math.random() * 20)
            });
        }
        const { error: storeErr } = await supabaseAdmin.from('loja_produtos').insert(products);
        if (storeErr) console.error(`[DEMO SEED] Error ins loja_produtos:`, storeErr.message);
        */

        // 7. Create Library
        const library = [];
        for (let m = 0; m < libraryCount; m++) {
            library.push({
                tenant_id: tenantId,
                titulo: `Material de Estudo ${m + 1}`,
                tipo: m % 2 === 0 ? 'pdf' : 'link'
            });
        }
        await supabaseAdmin.from('biblioteca').insert(library);

        // 8. Create Events
        const events = [];
        for (let n = 0; n < eventsCount; n++) {
            events.push({
                tenant_id: tenantId,
                lider_id: tenantId,
                titulo: `Gira de Demo ${n + 1}`,
                data: new Date(Date.now() + (n * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                tipo: 'Gira de Umbanda'
            });
        }
        await supabaseAdmin.from('calendario_axe').insert(events);

        // 9. Create Financial Records
        const financial = [];
        if (childrenData) {
            for (let o = 0; o < financialCount; o++) {
                financial.push({
                    tenant_id: tenantId,
                    lider_id: tenantId,
                    tipo: o % 3 === 0 ? 'despesa' : 'receita',
                    categoria: o % 3 === 0 ? 'Aluguel' : 'Mensalidade',
                    valor: (Math.random() * 200) + 50,
                    data: new Date(Date.now() - (o * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                    status: 'pago',
                    descricao: `Transação Demo ${o + 1}`
                });
            }
            await supabaseAdmin.from('financeiro').insert(financial);
        }
      }

      console.log(`[DEMO SEED] Finished seeding.`);
      res.json({ success: true, message: `Demonstração gerada com sucesso para ${tenantsCount} terreiros!` });
    } catch (err: any) {
      console.error("[DEMO SEED] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/clear-demo", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const superAdmins = ['lucasilvasiqueira@outlook.com.br'];
      const isSuperAdmin = superAdmins.includes(user.email || '');
      
      const { data: adminProfile } = await supabaseAdmin
        .from('perfil_lider')
        .select('is_admin_global')
        .eq('id', user.id)
        .single();
      
      if (!adminProfile?.is_admin_global && !isSuperAdmin) {
        return res.status(403).json({ error: "Acesso restrito a administradores globais" });
      }

      console.log("[DEMO CLEAR] Starting cleanup of all demo data...");

      // 1. Get all demo tenant IDs based on the email domain
      const { data: demoProfiles } = await supabaseAdmin
        .from('perfil_lider')
        .select('id')
        .ilike('email', '%@axecloud.demo%');
      
      const demoIds = (demoProfiles || []).map(p => p.id);

      if (demoIds.length === 0) {
         console.log("[DEMO CLEAR] No demo records found.");
         return res.json({ success: true, message: "Nenhum dado de demonstração encontrado." });
      }

      // 2. Delete from all tables IN REVERSE ORDER to avoid FK Constraints
      const tablesWithTenantId = [
        'notificacoes',
        'financeiro',
        'calendario_axe',
        'biblioteca',
        'almoxarifado',
        'filhos_de_santo'
      ];

      for (const table of tablesWithTenantId) {
          const { error: delErr } = await supabaseAdmin.from(table).delete().in('tenant_id', demoIds);
          if (delErr) {
             console.error(`[DEMO CLEAR] Info: Error deleting from ${table}:`, delErr.message);
          }
      }

      const tablesWithId = [
        'subscriptions',
        'perfil_lider'
      ];
      
      for (const table of tablesWithId) {
          const { error: delErr } = await supabaseAdmin.from(table).delete().in('id', demoIds);
          if (delErr) {
             console.error(`[DEMO CLEAR] Info: Error deleting from ${table}:`, delErr.message);
          }
      }

      if (demoIds.length > 0) {
        // 3. Delete Auth Users (This is slow but necessary for clean state)
        for (const id of demoIds) {
          const { error: authDelErr } = await supabaseAdmin.auth.admin.deleteUser(id);
          if (authDelErr) {
             console.error(`[DEMO CLEAR] Error deleting auth user ${id}:`, authDelErr.message);
          }
        }
      }

      console.log("[DEMO CLEAR] Cleanup finished.");
      res.json({ success: true, message: "Todos os dados de demonstração foram removidos!" });
    } catch (error: any) {
      console.error("[DEMO CLEAR] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Kiwify Webhook
  app.post("/api/webhooks/kiwify", express.json(), async (req, res) => {
    const payload = req.body;
    const { order_status, customer, product_id, subscription_id } = payload;

    console.log(`[KIWIFY WEBHOOK] Received: ${order_status} for ${customer?.email}`);

    // Só processamos se o pagamento for aprovado
    if (order_status === 'paid') {
      try {
        const email = customer?.email;
        if (!email) throw new Error("Email do cliente não encontrado no payload");

        // 1. Encontrar o usuário pelo email
        const { data: userData, error: userError } = await supabaseAdmin
          .from('perfil_lider')
          .select('id, tenant_id')
          .eq('email', email)
          .single();

        if (userError || !userData) {
          console.error(`[KIWIFY WEBHOOK] Usuário não encontrado para o email: ${email}`);
          return res.status(404).json({ error: "Usuário não encontrado" });
        }

        // 2. Mapear o product_id para o plano (Isso deve ser configurado conforme seus produtos no Kiwify)
        // Exemplo de mapeamento:
        let planToSet = 'axe';
        // if (product_id === 'ID_DO_PRODUTO_ORO') planToSet = 'oro';
        // if (product_id === 'ID_DO_PRODUTO_PREMIUM') planToSet = 'premium';

        console.log(`[KIWIFY WEBHOOK] Atualizando plano para ${planToSet} para o tenant ${userData.tenant_id}`);

        // 3. Atualizar a assinatura
        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            plan: planToSet,
            status: 'active',
            updated_at: new Date().toISOString(),
            // Adicionar 30 dias de expiração se não for vitalício
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          })
          .eq('tenant_id', userData.tenant_id);

        if (updateError) throw updateError;

        console.log(`[KIWIFY WEBHOOK] Plano atualizado com sucesso!`);
      } catch (error) {
        console.error(`[KIWIFY WEBHOOK] Erro ao processar:`, error);
        return res.status(500).json({ error: "Erro interno ao processar webhook" });
      }
    }

    res.status(200).send('OK');
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("[SERVER] Carregando middleware do Vite (Desenvolvimento)...");
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      // O Vite em middlewareMode pode responder 404 em /api/* antes do Express em alguns cenários.
      // Rotas /api só passam pelo Vite se NÃO forem API (assets e SPA).
      app.use((req, res, next) => {
        const pathOnly = (req.originalUrl || req.url || "").split("?")[0];
        if (pathOnly.startsWith("/api")) {
          if (!res.headersSent) {
            return res.status(404).json({
              error: "Rota API não encontrada.",
              method: req.method,
              path: req.originalUrl,
            });
          }
          return next();
        }
        return vite.middlewares(req, res, next);
      });
      console.log("[SERVER] Middleware do Vite carregado com sucesso (API isolada do Vite).");
    } catch (e: any) {
      console.error("[SERVER] ERRO CRÍTICO ao carregar Vite:", e);
    }
  } else {
    console.log("[SERVER] Serving static files (Production)...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.VERCEL !== '1') {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
      
      // Garantir buckets e esquema após o início para não bloquear o boot
      ensureBucketsExist().catch(err => console.error("[SERVER] Erro ao garantir buckets:", err));
      initializeDatabase().catch(err => console.error("[SERVER] Erro ao inicializar banco:", err));
    });
  }

  // Global Error Handler — nunca expõe detalhes internos em produção
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[SERVER ERROR]", err);
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: "Internal Server Error",
      ...(isProduction ? {} : { details: err.message }),
    });
  });

  return app;
}

const appPromise = startServer();

// Export for Vercel serverless environment
export default async function handler(req: any, res: any) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("[VERCEL HANDLER ERROR]", err);
    const isProduction = process.env.NODE_ENV === 'production';
    res.status(500).json({
      error: "Internal Server Error during initialization",
      ...(isProduction ? {} : { details: err.message || String(err) }),
    });
  }
}
