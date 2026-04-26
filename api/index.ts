import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import cors from "cors";
import webpush from "web-push";

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viteEnv = (import.meta as any).env || {};

function getServerEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key] || viteEnv[key];
    if (value) return value;
  }
  return undefined;
}

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

// Configuração Web Push
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || "BE8Nz7rSuhDrvaE7glwae51WL2CRGnqisSUN8VkZvi070qEqIkDfxC2ig8eExWwKRPuG6eUeU2BbjF1Cg_NATqA";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "5iJSYqqeGj3Et2d_hmg9eKoCX06-edBhbIQQMkfsabc";

webpush.setVapidDetails(
  'mailto:lucasilvasiqueira@outlook.com.br',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const SUPABASE_URL = getServerEnv("VITE_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getServerEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_KEY"
);
const SUPABASE_ANON_KEY = getServerEnv("VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SUPABASE_SERVER_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

let supabaseAdmin: any;
let pixSupportsValorMensalidade = true;
let pixSupportsDiaVencimento = true;

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

function slugifyStoragePath(str: string) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .toLowerCase();
}

if (!SUPABASE_URL || !SUPABASE_SERVER_KEY) {
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
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY is missing; using anon key fallback. Some server routes may fail due to RLS.");
  }

  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Função para garantir que os buckets de storage existam
async function ensureBucketsExist() {
  const buckets = ['biblioteca_estudos', 'loja_imagens'];
  console.log("[SERVER] Verificando buckets de storage...");
  
  for (const bucketName of buckets) {
    try {
      const { data: bucket, error } = await supabaseAdmin.storage.getBucket(bucketName);
      
      if (error && error.message.includes('not found')) {
        console.log(`[SERVER] Criando bucket: ${bucketName}`);
        const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
          public: true,
          allowedMimeTypes: bucketName === 'biblioteca_estudos' ? ['application/pdf'] : ['image/*'],
          fileSizeLimit: 52428800 // 50MB
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

// Função para inicializar o esquema do banco (is_admin_global)
async function initializeDatabase() {
  console.log("[SERVER] Inicializando esquema do banco...");
  try {
    // Tenta verificar se a coluna is_admin_global existe
    const { error: checkError } = await supabaseAdmin.from('perfil_lider').select('is_admin_global').limit(1);
    
    if (checkError && checkError.message.includes('column "is_admin_global" does not exist')) {
      console.warn("[SERVER] ATENÇÃO: A coluna 'is_admin_global' não existe na tabela 'perfil_lider'.");
      console.warn("[SERVER] Por favor, execute o conteúdo de 'setup_admin_role.sql' e 'harden_rls.sql' no SQL Editor do Supabase.");
    } else if (!checkError) {
      console.log("[SERVER] Esquema do banco OK (is_admin_global presente).");
      
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

/** Resolve perfil_lider.id a partir do id do zelador ou do tenant_id (ex.: tenant compartilhado). */
async function resolveLeaderId(idOrTenantId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('perfil_lider')
    .select('id')
    .or(`id.eq.${idOrTenantId},tenant_id.eq.${idOrTenantId}`)
    .maybeSingle();
  return data?.id || idOrTenantId;
}

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

function isMissingColumnErr(error: any, columnName: string) {
  const message = error?.message || '';
  return message.includes(`column "${columnName}" does not exist`) || error?.code === 'PGRST204';
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
  if (error && isMissingColumnErr(error, 'tenant_id')) {
    delete payload.tenant_id;
    ({ error } = await supabaseAdmin.from('subscriptions').upsert(payload, { onConflict: 'id' }));
  }
  if (error) console.error('[SERVER] ensureSubscriptionForMural:', error.message);
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

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get("/api/health-check", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Middleware de log para todas as requisições API
  app.use("/api", (req, res, next) => {
    console.log(`[API LOG] ${req.method} ${req.url}`);
    console.log(`[API HEADERS]`, JSON.stringify(req.headers));
    next();
  });

  app.get("/api/ping", (req, res) => {
    res.json({ status: "pong", timestamp: new Date().toISOString() });
  });

  // API Route: Web Push Subscribe
  app.post("/api/push-subscribe", async (req, res) => {
    const { subscription, userId, tenantId } = req.body;
    
    if (!subscription || !userId || !tenantId) {
      return res.status(400).json({ error: "Dados incompletos para inscrição" });
    }

    try {
      const { error } = await supabaseAdmin
        .from('push_subscriptions')
        .upsert({
          user_id: userId,
          tenant_id: tenantId,
          subscription_object: subscription,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,tenant_id' });

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("[PUSH] Erro ao salvar inscrição:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper: Enviar Notificação Push
  async function sendPushNotification(tenantId: string, payload: { title: string, body: string, url: string }) {
    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from('push_subscriptions')
        .select('subscription_object')
        .eq('tenant_id', tenantId);

      if (error) throw error;
      if (!subscriptions || subscriptions.length === 0) return;

      console.log(`[PUSH] Enviando notificação para ${subscriptions.length} inscritos no tenant ${tenantId}`);

      const pushPromises = subscriptions.map((sub: any) => {
        return webpush.sendNotification(
          sub.subscription_object,
          JSON.stringify(payload)
        ).catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Inscrição expirada ou inválida, remover do banco
            console.log("[PUSH] Removendo inscrição inválida");
            return supabaseAdmin
              .from('push_subscriptions')
              .delete()
              .eq('subscription_object->>endpoint', sub.subscription_object.endpoint);
          }
          console.error("[PUSH] Erro ao enviar notificação individual:", err);
        });
      });

      await Promise.all(pushPromises);
    } catch (error) {
      console.error("[PUSH] Erro geral ao enviar notificações:", error);
    }
  }

  // API Route: Create Notice (Mural) and Trigger Push
  app.post("/api/notices", async (req, res) => {
    const { titulo, conteudo, categoria, tenantId: _bodyTenantIgnored, expiracao } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) throw new Error("Sessão inválida");

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
        expiracao: expiracao || null,
        data_publicacao: new Date().toISOString(),
      };

      let notice: any = null;
      let lastErr: any = null;
      const errLog: string[] = [];
      for (const tid of uniqueTenants) {
        const ins = await supabaseAdmin
          .from('mural_avisos')
          .insert({ ...baseRow, tenant_id: tid })
          .select()
          .single();
        if (!ins.error) {
          notice = ins.data;
          break;
        }
        lastErr = ins.error;
        errLog.push(`${tid}: ${ins.error?.message || ins.error?.code || JSON.stringify(ins.error)}`);
      }

      if (!notice) {
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
              'Confirme que o .env aponta para o mesmo projeto Supabase onde rodou o SQL. Rode scripts/fix_mural_avisos_fk.sql ou scripts/remove_mural_tenant_fk.sql.',
          },
        });
      }

      const pushTargetTenant = pl.tenant_id || zeladorId;
      sendPushNotification(pushTargetTenant, {
        title: `Novo Aviso: ${titulo}`,
        body: conteudo.substring(0, 100) + (conteudo.length > 100 ? '...' : ''),
        url: '/mural'
      });

      res.json({ success: true, data: notice });
    } catch (error: any) {
      console.error("[SERVER] Erro ao criar aviso:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Create Inventory Item (Almoxarifado) and Trigger Push
  app.post("/api/inventory", async (req, res) => {
    const { item, quantidade_atual, quantidade_minima, categoria, tenantId, autorId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).json({ error: "Não autorizado" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) throw new Error("Sessão inválida");

      const { data: inventoryItem, error } = await supabaseAdmin
        .from('almoxarifado')
        .insert({
          item,
          quantidade_atual: Number(quantidade_atual) || 0,
          quantidade_minima: Number(quantidade_minima) || 5,
          categoria,
          lider_id: autorId,
          tenant_id: tenantId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      sendPushNotification(tenantId, {
        title: `Novo Item no Almoxarifado`,
        body: `${item}: ${quantidade_atual} unidades`,
        url: '/almoxarifado'
      });

      res.json({ success: true, data: inventoryItem });
    } catch (error: any) {
      console.error("[SERVER] Erro ao criar item no almoxarifado:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const handleStoreProductsGet = async (req: express.Request, res: express.Response) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });
    try {
      const { data, error } = await supabaseAdmin
        .from("produtos")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .is("deleted_at", null)
        .order("nome");
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (err: any) {
      console.error("[SERVER] Erro ao buscar produtos:", err.message);
      res.status(500).json({ error: err.message });
    }
  };
  app.get("/api/v1/store/products", handleStoreProductsGet);
  app.get("/api/store/products", handleStoreProductsGet);

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
        /* ignore */
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

  // API Route: Pix Config — GET e POST (bypasses RLS, resolve FK automaticamente)
  app.get("/api/v1/financial/pix-config", async (req, res) => {
    const { tenantId } = req.query;
    if (!tenantId) return res.status(400).json({ error: "tenantId required" });

    try {
      const resolvedId = await resolveLeaderId(tenantId as string);
      const { data, error } = await supabaseAdmin
        .from('configuracoes_pix')
        .select(getPixConfigSelectClause())
        .or(`terreiro_id.eq.${resolvedId},terreiro_id.eq.${tenantId}`)
        .maybeSingle();

      if (error) throw error;
      res.json({ data });
    } catch (err: any) {
      console.error("[SERVER] Erro ao buscar pix config:", err.message || err);
      res.status(500).json({ error: err.message || "Erro ao buscar configuração PIX" });
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

      const resolvedId = await resolveLeaderId(terreiro_id);
      const configData: any = { terreiro_id: resolvedId, chave_pix, tipo_chave, nome_beneficiario };
      if (valor_mensalidade !== undefined) configData.valor_mensalidade = parseFloat(valor_mensalidade) || 0;
      if (dia_vencimento !== undefined) {
        const dia = parseInt(dia_vencimento);
        if (dia >= 1 && dia <= 31) configData.dia_vencimento = dia;
      }

      const sanitizedConfigData = sanitizePixConfigData(configData);
      const { data: existing } = await supabaseAdmin
        .from('configuracoes_pix')
        .select('id')
        .or(`terreiro_id.eq.${resolvedId},terreiro_id.eq.${terreiro_id}`)
        .maybeSingle();

      const { error } = existing
        ? await supabaseAdmin.from('configuracoes_pix').update(sanitizedConfigData).eq('id', existing.id)
        : await supabaseAdmin.from('configuracoes_pix').insert([sanitizedConfigData]);

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("[SERVER] Erro ao salvar pix config:", err.message || err);
      res.status(500).json({ error: err.message || "Erro ao salvar configuração PIX" });
    }
  });

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
        console.warn("[SERVER] RPC confirm_mensalidade_payment indisponível — fallback:", rpcErr.message || rpcErr);
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
      console.error("[SERVER] Erro ao buscar materiais:", err.message || err);
      res.status(500).json({ error: err.message || "Erro ao buscar materiais" });
    }
  });

  app.post("/api/v1/library/upload-url", async (req, res) => {
    const authHeader = req.headers.authorization;
    const { fileName, contentType, categoria, tenantId } = req.body;
    if (!authHeader || !fileName || !tenantId) {
      return res.status(400).json({ error: "Unauthorized or missing data" });
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const safeCategoria = slugifyStoragePath(categoria || 'geral');
      const safeFileName = slugifyStoragePath(fileName);
      const storagePath = `${tenantId}/${safeCategoria}/${Date.now()}_${safeFileName}`;

      const { data, error } = await supabaseAdmin.storage
        .from('biblioteca_estudos')
        .createSignedUploadUrl(storagePath);

      if (error) throw error;
      res.json({
        path: storagePath,
        token: data.token,
        contentType: contentType || 'application/pdf'
      });
    } catch (error: any) {
      console.error("[SERVER] Erro ao criar URL de upload:", error.message || error);
      res.status(500).json({ error: error.message || "Erro ao preparar upload" });
    }
  });

  app.post("/api/v1/library/complete-upload", async (req, res) => {
    const authHeader = req.headers.authorization;
    const { storagePath, titulo, categoria, tenantId } = req.body;
    if (!authHeader || !storagePath || !titulo || !tenantId) {
      return res.status(400).json({ error: "Unauthorized or missing data" });
    }

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('biblioteca_estudos')
        .getPublicUrl(storagePath);

      const { error: dbError } = await supabaseAdmin
        .from('biblioteca')
        .insert([{
          titulo,
          categoria,
          arquivo_url: publicUrl,
          tenant_id: tenantId,
          storage_path: storagePath
        }]);

      if (dbError) throw dbError;
      res.json({ success: true, publicUrl });
    } catch (error: any) {
      console.error("[SERVER] Erro ao finalizar upload:", error.message || error);
      res.status(500).json({ error: error.message || "Erro interno ao salvar material" });
    }
  });

  // API Route: PDF Proxy — serve o PDF localmente para evitar CORS no PDF.js (Vercel)
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
        'Content-Type': response.headers.get('content-type') || 'application/pdf',
        'Content-Length': String(buffer.length),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      });
      res.send(buffer);
    } catch (err: any) {
      console.error("[PDF-PROXY] Erro:", err.message || err);
      res.status(500).send("Erro interno");
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
        const expiresAt = usesDistantSubscriptionExpiry(plan)
          ? '2099-12-31T23:59:59Z'
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        
        const { error: subError } = await supabaseAdmin
          .from('subscriptions')
          .upsert({ 
            id: targetUser.id,
            plan: plan.toLowerCase(),
            status: 'active',
            expires_at: expiresAt,
            updated_at: new Date().toISOString()
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
    const { childId, cpfPrefix } = req.body;

    if (!childId || !cpfPrefix || cpfPrefix.length < 4) {
      return res.status(400).json({ error: "ID e os 4 primeiros dígitos do CPF são obrigatórios." });
    }

    try {
      // 1. Find the child
      const { data: child, error: childError } = await supabaseAdmin
        .from('filhos_de_santo')
        .select('id, cpf, user_id, nome')
        .eq('id', childId)
        .maybeSingle();

      if (childError || !child) {
        return res.status(404).json({ error: "Filho de santo não encontrado." });
      }

      if (!child.cpf) {
        return res.status(400).json({ error: "Este filho de santo não possui CPF cadastrado. Peça ao zelador para atualizar o cadastro." });
      }

      // 2. Verify CPF prefix
      const cleanCpf = child.cpf.replace(/\D/g, '');
      if (!cleanCpf.startsWith(cpfPrefix)) {
        return res.status(401).json({ error: "CPF incorreto." });
      }

      const fakeEmail = `filho_${childId}@axecloud.com`;
      const generatedPassword = `Axe${cpfPrefix}!2024`;

      // 3. Check if user_id exists
      if (child.user_id) {
        // Fetch user to check email
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(child.user_id);
        
        if (userError || !userData.user) {
          // User not found in auth, might be deleted. Let's recreate.
          const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: fakeEmail,
            password: generatedPassword,
            email_confirm: true,
            user_metadata: { nome: child.nome, role: 'filho' }
          });

          if (createError) throw createError;

          await supabaseAdmin.from('filhos_de_santo').update({ user_id: newUser.user.id }).eq('id', childId);
          return res.json({ email: fakeEmail, password: generatedPassword });
        }

        if (userData.user.email !== fakeEmail) {
          return res.status(400).json({ error: "Este filho de santo já possui um login com e-mail próprio. Faça login na tela inicial." });
        }

        // Ensure password is correct
        await supabaseAdmin.auth.admin.updateUserById(child.user_id, { password: generatedPassword });
        return res.json({ email: fakeEmail, password: generatedPassword });
      } else {
        // Create new shadow user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: fakeEmail,
          password: generatedPassword,
          email_confirm: true,
          user_metadata: { nome: child.nome, role: 'filho' }
        });

        if (createError) throw createError;

        await supabaseAdmin.from('filhos_de_santo').update({ user_id: newUser.user.id }).eq('id', childId);
        return res.json({ email: fakeEmail, password: generatedPassword });
      }

    } catch (error: any) {
      console.error("Filho Login Error:", error);
      res.status(500).json({ error: error.message || "Erro interno do servidor." });
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

  // GET /api/tenant-info: implementado em /api/tenant-info.ts (função serverless isolada; sem /src no bundle da Vercel)

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
        .select('id, plan');

      if (sError) throw sError;

      // 3. Fetch Global Settings
      const { data: settings } = await supabaseAdmin
        .from('global_settings')
        .select('data')
        .eq('id', 'plans')
        .single();

      const plans = settings?.data && Object.keys(settings.data).length > 0 ? settings.data : DEFAULT_PLANS;

      res.json({ profiles, subs, plans });
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
        case 'change-plan':
          if (!newPlan) return res.status(400).json({ error: "Novo plano é obrigatório" });
          // Atualiza na tabela subscriptions
          await supabaseAdmin.from('subscriptions').upsert({ 
            id: targetUserId, 
            plan: newPlan,
            status: 'active',
            updated_at: new Date().toISOString()
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
          tenant_id: user.id, 
          plan: plan,
          status: 'active',
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });

      if (updateError) throw updateError;

      res.json({ success: true, plan });
    } catch (error: any) {
      console.error("[SUBSCRIPTION] Erro ao atualizar plano:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route: Test Supabase Admin
  app.get("/api/test-db", async (req, res) => {
    try {
      console.log("[SERVER] Testing Supabase Admin connection...");
      const { data, error } = await supabaseAdmin.from('perfil_lider').select('id').limit(1);
      if (error) throw error;
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("[SERVER] Test DB error:", error);
      res.status(500).json({ error: error.message });
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
    const tenantIdFromQuery = req.query.tenantId as string;

    if (!userId) {
      console.log(`[SERVER] GET /api/children - Missing userId`);
      return res.status(400).json({ error: "UserId is required" });
    }

    try {
      let tenantId = tenantIdFromQuery;

      // Tenta buscar com tenant_id primeiro, se falhar, busca por lider_id
      if (!tenantId) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('perfil_lider')
          .select('tenant_id')
          .eq('id', userId)
          .single();
          
        if (profileError) {
          console.log(`[SERVER] Profile fetch error:`, profileError);
        }
        tenantId = profile?.tenant_id;
      }

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
    try {
      if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
        return res.status(400).json({ error: "tenantId é obrigatório" });
      }

      const resolvedId = await resolveLeaderId(tenantId);
      const ids = Array.from(new Set([tenantId, resolvedId].filter(Boolean)));
      const tenantFilters = ids.flatMap((id) => [`tenant_id.eq.${id}`, `lider_id.eq.${id}`]).join(',');
      let query = supabaseAdmin.from('calendario_axe').select('*').order('data', { ascending: true });
      query = query.or(tenantFilters);
      if (start) query = query.gte('data', start as string);
      if (end) query = query.lte('data', end as string);
      
      const { data, error } = await query;
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching events:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
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

      // 2. Disparar Push para o Terreiro
      sendPushNotification(profile?.tenant_id || user.id, {
        title: `Novo Evento: ${req.body.titulo}`,
        body: `${req.body.data} às ${req.body.hora}`,
        url: '/calendario'
      });

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
    if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
      return res.status(400).json({ error: "tenantId é obrigatório" });
    }
    try {
      const resolvedId = await resolveLeaderId(tenantId as string);
      const { data, error } = await supabaseAdmin
        .from('mural_avisos')
        .select('*')
        .or(`tenant_id.eq.${resolvedId},tenant_id.eq.${tenantId}`)
        .order('data_publicacao', { ascending: false });
      if (error) throw error;
      res.json({ data });
    } catch (error: any) {
      console.error("[SERVER] Error fetching notices:", error.message || error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
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

  // API Route: Get Transactions (Bypasses RLS)
  app.get("/api/transactions", async (req, res) => {
    const { tenantId, userId, userRole, limit } = req.query;
    try {
      let query = supabaseAdmin.from('financeiro').select('*').order('data', { ascending: false });
      
      if (tenantId) {
        query = query.or(`tenant_id.eq.${tenantId},lider_id.eq.${tenantId}`);
      }
      
      if (userRole === 'filho' && userId) {
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

  /** Líder do terreiro ou filho dono do lançamento (mensalidade / filho_id). */
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

  // API Route: Delete financeiro row (service role — o cliente não tem DELETE via RLS)
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

  // --- WHATSAPP INTEGRATION ENDPOINTS ---

  // 1. Get/Save WhatsApp Config
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
      console.error("[WHATSAPP] Config Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Send WhatsApp Message (With Queue Simulation)
  app.post("/api/whatsapp/send", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

    try {
      const token = authHeader.replace("Bearer ", "");
      const { user, error: authError } = await verifyUser(token);
      if (authError || !user) return res.status(401).json({ error: "Unauthorized" });

      const { tipo, filhoId, variables, forcePhone } = req.body;

      // Fetch Config
      const { data: config } = await supabaseAdmin
        .from('whatsapp_config')
        .select('*')
        .eq('tenant_id', user.id)
        .single();

      if (!config || !config.is_connected || !config.api_url) {
        return res.status(400).json({ error: "WhatsApp não configurado ou desconectado" });
      }

      // Fetch Phone Number if not forced
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

      // Sanitize Phone (Remove non-digits)
      phone = phone.replace(/\D/g, '');
      if (!phone.startsWith('55')) phone = '55' + phone;

      // Prepare Message from Template
      let message = config.templates?.[tipo] || "Mensagem do AxéCloud";
      
      // Default template for cobranca_mensalidade if not set
      if (tipo === 'cobranca_mensalidade' && !config.templates?.[tipo]) {
        message = "Olá, {{nome_filho}}! Passando para lembrar da sua mensalidade de {{mes_ano}} no valor de R$ {{valor}} no {{nome_terreiro}}. Sua contribuição é fundamental para o nosso fundamento. Axé!";
      }

      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value as string);
      });

      // Privacy Check: Ensure no sensitive data is sent
      // (This is a simplified check, in a real app we'd be more rigorous)
      if (message.includes('nota sigilosa') || message.includes('segredo')) {
        message = "Você tem uma nova atualização sigilosa no seu prontuário. Acesse o AxéCloud para conferir.";
      }

      // Async Dispatch (Queue Simulation)
      setTimeout(async () => {
        try {
          console.log(`[WHATSAPP] Dispatching message to ${phone}`);
          
          // Mock API Call (Adapt to real API like Evolution or Z-API)
          // const response = await axios.post(`${config.api_url}/message/sendText/${config.instance_id}`, {
          //   number: phone,
          //   text: message
          // }, { headers: { 'apikey': config.api_key } });

          // For demo purposes, we'll just log it
          const externalId = `msg_${Math.random().toString(36).substr(2, 9)}`;

          // Log the message
          await supabaseAdmin.from('whatsapp_logs').insert({
            tenant_id: user.id,
            filho_id: filhoId,
            tipo,
            telefone: phone,
            mensagem: message,
            status: 'sent',
            external_id: externalId
          });

          console.log(`[WHATSAPP] Message logged successfully: ${externalId}`);
        } catch (err: any) {
          console.error("[WHATSAPP] Dispatch Error:", err.message);
        }
      }, 500); // Small delay to simulate queue

      res.json({ success: true, message: "Mensagem enfileirada para envio" });
    } catch (error: any) {
      console.error("[WHATSAPP] Send Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // 3. Webhook for Status Updates
  app.post("/api/whatsapp/webhook", async (req, res) => {
    const { instance, data } = req.body;
    // This structure depends on the API provider (Evolution API example)
    const externalId = data?.key?.id;
    const status = data?.status; // 'DELIVERY_ACK', 'READ', etc.

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
      app.use(vite.middlewares);
      console.log("[SERVER] Middleware do Vite carregado com sucesso.");
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

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[SERVER ERROR]", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  });

  return app;
}

const appPromise = startServer();

export default async function handler(req: any, res: any) {
  try {
    const app = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("[VERCEL HANDLER ERROR]", err);
    res.status(500).json({ error: "Internal Server Error during initialization", details: err.message || String(err) });
  }
}
