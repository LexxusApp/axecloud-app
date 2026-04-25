/**
 * Rota isolada para Vercel: sem imports de /src, apenas process.env (não import.meta).
 * Planos/constantes usadas na resposta estão inline abaixo.
 */
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// --- Valores alinhados ao app (não importar de src) ---
const SUPER_ADMIN_EMAIL = "lucasilvasiqueira@outlook.com.br";
const SHARED_TENANT_ID_SUPER = "6588b6c9-ce84-4140-a69a-f487a0c61dab";
// Slugs de plano alinhados ao app: axe, oro, premium, vita, cortesia (sem import de src)

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVER_KEY = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;

const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVER_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVER_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

export default async function handler(req: { method?: string; query?: Record<string, string | string[] | undefined> }, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(204).end();
  }
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = req.query || {};
  const userId = typeof q.userId === "string" ? q.userId : Array.isArray(q.userId) ? q.userId[0] : "";
  const emailRaw = typeof q.email === "string" ? q.email : Array.isArray(q.email) ? q.email[0] : "";
  const email = (emailRaw || "").toLowerCase().trim();

  if (!userId) {
    return res.status(400).json({ error: "UserId is required" });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVER_KEY || !supabaseAdmin) {
    return res.status(503).json({
      error: "Supabase não configurado na função da Vercel",
      missing: {
        supabaseUrl: !SUPABASE_URL,
        supabaseKey: !SUPABASE_SERVER_KEY,
      },
    });
  }

  const sb = supabaseAdmin;

  try {
    const { data: childByUser, error: childByUserErr } = await sb
      .from("filhos_de_santo")
      .select("id, nome, lider_id, tenant_id")
      .eq("user_id", userId)
      .limit(1);
    if (childByUserErr) throw childByUserErr;
    let linkedChild = childByUser?.[0] ?? null;

    if (!linkedChild && email) {
      const byEmail = await sb
        .from("filhos_de_santo")
        .select("id, nome, lider_id, tenant_id")
        .eq("email", email)
        .limit(1);
      if (byEmail.error) throw byEmail.error;
      linkedChild = byEmail.data?.[0] ?? null;
    }

    if (linkedChild) {
      const leaderRef = linkedChild.lider_id || linkedChild.tenant_id;
      let leaderProfile: { data: any; error: any } = { data: null, error: null };

      if (leaderRef) {
        leaderProfile = await sb
          .from("perfil_lider")
          .select("id, nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url")
          .eq("id", leaderRef)
          .maybeSingle();
        if (leaderProfile.error) throw leaderProfile.error;
      }

      if (!leaderProfile.data && linkedChild.tenant_id) {
        const alt = await sb
          .from("perfil_lider")
          .select("id, nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url")
          .eq("tenant_id", linkedChild.tenant_id)
          .limit(1);
        if (alt.error) throw alt.error;
        if (alt.data?.[0]) leaderProfile = { data: alt.data[0], error: null };
      }

      if (leaderProfile.data?.deleted_at) {
        return res.status(403).json({ error: "Conta excluída", status: "deleted" });
      }
      if (leaderProfile.data?.is_blocked) {
        return res.status(403).json({ error: "Acesso suspenso", status: "blocked" });
      }

      const leaderAuthId = leaderProfile.data?.id || leaderRef;
      const leaderSub = leaderAuthId
        ? await sb.from("subscriptions").select("plan, status, expires_at").eq("id", leaderAuthId).maybeSingle()
        : { data: null, error: null };
      if (leaderSub.error) throw leaderSub.error;

      return res.json({
        nome_terreiro: leaderProfile.data?.nome_terreiro || "Meu Terreiro",
        cargo: null,
        role: "filho",
        is_admin_global: false,
        tenant_id:
          leaderProfile.data?.tenant_id || linkedChild.tenant_id || leaderProfile.data?.id || leaderRef || userId,
        plan: (leaderSub.data?.plan || "axe").toLowerCase().trim(),
        status: "active",
        expires_at: "2099-12-31T23:59:59Z",
        foto_url: leaderProfile.data?.foto_url || null,
      });
    }

    let profileRes: any = await sb
      .from("perfil_lider")
      .select("nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url")
      .eq("id", userId)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;

    if (profileRes.data?.deleted_at) {
      return res.status(403).json({ error: "Conta excluída", status: "deleted" });
    }
    if (profileRes.data?.is_blocked) {
      return res.status(403).json({ error: "Acesso suspenso", status: "blocked" });
    }

    let subRes: any = await sb.from("subscriptions").select("plan, status, expires_at").eq("id", userId).maybeSingle();
    if (subRes.error) throw subRes.error;

    const isSuperAdmin = profileRes.data?.is_admin_global || email === SUPER_ADMIN_EMAIL;

    if (isSuperAdmin && !profileRes.data) {
      console.log(`[tenant-info] Auto-criando perfil Super Admin: ${email}`);
      const { data: newProfile, error: createError } = await sb
        .from("perfil_lider")
        .upsert(
          {
            id: userId,
            email: email,
            nome_terreiro: "Meu Terreiro",
            role: "admin",
            is_admin_global: true,
            tenant_id: SHARED_TENANT_ID_SUPER,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (!createError && newProfile) {
        profileRes.data = newProfile;
      }
    }

    if (!profileRes.data) {
      const { data: cRows, error: childError } = await sb
        .from("filhos_de_santo")
        .select("lider_id, tenant_id")
        .eq("user_id", userId)
        .limit(1);
      if (childError) throw childError;
      let childData = cRows?.[0] ?? null;
      if (!childData && email) {
        const r2 = await sb
          .from("filhos_de_santo")
          .select("lider_id, tenant_id")
          .eq("email", email)
          .limit(1);
        if (r2.error) throw r2.error;
        childData = r2.data?.[0] ?? null;
      }

      if (childData) {
        const candidateLeaderId = childData.lider_id || childData.tenant_id;
        let leaderProfile: any = await sb
          .from("perfil_lider")
          .select("id, nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url")
          .eq("id", candidateLeaderId)
          .maybeSingle();
        if (leaderProfile.error) throw leaderProfile.error;

        if (!leaderProfile.data && childData.tenant_id) {
          const alt = await sb
            .from("perfil_lider")
            .select("id, nome_terreiro, cargo, role, tenant_id, is_admin_global, is_blocked, deleted_at, foto_url")
            .eq("tenant_id", childData.tenant_id)
            .limit(1);
          if (alt.error) throw alt.error;
          if (alt.data?.[0]) leaderProfile = { data: alt.data[0], error: null };
        }

        const zeladorAuthId = leaderProfile.data?.id || candidateLeaderId;
        const leaderSub = await sb
          .from("subscriptions")
          .select("plan, status, expires_at")
          .eq("id", zeladorAuthId)
          .maybeSingle();
        if (leaderSub.error) throw leaderSub.error;

        if (leaderProfile.data?.deleted_at) {
          return res.status(403).json({ error: "Conta excluída", status: "deleted" });
        }
        if (leaderProfile.data?.is_blocked) {
          return res.status(403).json({ error: "Acesso suspenso", status: "blocked" });
        }

        if (leaderProfile.data) {
          profileRes.data = { ...leaderProfile.data, role: "filho" };
          subRes.data = leaderSub.data;
        }
      }
    }

    let plan = (subRes.data?.plan || "axe").toLowerCase().trim();
    if (isSuperAdmin) plan = "premium";

    const roleOut = isSuperAdmin ? "admin" : profileRes.data?.role || (profileRes.data ? "admin" : null);
    const cargoOut = roleOut === "filho" ? null : profileRes.data?.cargo?.trim() || null;

    return res.json({
      nome_terreiro: profileRes.data?.nome_terreiro || null,
      cargo: cargoOut,
      role: roleOut,
      is_admin_global: !!isSuperAdmin,
      tenant_id: profileRes.data?.tenant_id || profileRes.data?.id || (isSuperAdmin ? userId : null),
      plan: plan,
      status: isSuperAdmin ? "active" : subRes.data?.status || null,
      expires_at: isSuperAdmin ? "2099-12-31T23:59:59Z" : subRes.data?.expires_at || null,
      foto_url: profileRes.data?.foto_url || null,
    });
  } catch (error: any) {
    console.error("[SERVER] Erro ao buscar tenant info:", error);
    return res.status(500).json({ error: "Erro ao buscar dados do tenant", details: error?.message || String(error) });
  }
}
