import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const viteEnv = (import.meta as any).env || {};

function getServerEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key] || viteEnv[key];
    if (value) return value;
  }
  return undefined;
}

const SUPABASE_URL = getServerEnv("VITE_SUPABASE_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = getServerEnv(
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "VITE_SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_SERVICE_KEY"
);

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

function sendJson(res: any, status: number, body: Record<string, unknown>) {
  res.status(status).setHeader("Content-Type", "application/json");
  return res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!supabaseAdmin) {
    return sendJson(res, 503, { error: "Supabase não configurado na função da Vercel." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let { childId, cpfPrefix } = body as { childId?: string; cpfPrefix?: string };

    childId = String(childId || "").trim();
    cpfPrefix = String(cpfPrefix || "").replace(/\D/g, "");

    if (!childId || cpfPrefix.length < 4) {
      return sendJson(res, 400, { error: "ID e os 4 primeiros dígitos do CPF são obrigatórios." });
    }

    if (childId.includes("-")) {
      const parts = childId.split("-");
      childId = parts[parts.length - 1];
    }

    const cleanChildId = childId.toLowerCase();
    const { data: allChildren, error: listError } = await supabaseAdmin
      .from("filhos_de_santo")
      .select("id, cpf, user_id, nome");

    if (listError) throw listError;

    const child = (allChildren || []).find((c: any) =>
      String(c.id || "").toLowerCase().startsWith(cleanChildId)
    );

    if (!child) {
      return sendJson(res, 404, { error: "Filho de santo não encontrado com este ID." });
    }

    if (!child.cpf) {
      return sendJson(res, 400, { error: "Este filho de santo não possui CPF cadastrado." });
    }

    const cleanCpf = String(child.cpf).replace(/\D/g, "");
    if (!cleanCpf.startsWith(cpfPrefix)) {
      return sendJson(res, 401, { error: "CPF incorreto." });
    }

    const fakeEmail = `f_${child.id}@axecloud.internal`;
    const generatedPassword = `Axe-Cloud-${cpfPrefix}-2024`;
    let authUser: any = null;

    if (child.user_id) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(child.user_id);
      if (userData?.user) authUser = userData.user;
    }

    if (!authUser) {
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      authUser = (usersData?.users || []).find((u: any) =>
        u.email === fakeEmail ||
        u.email === `filho_${childId}@axecloud.com` ||
        u.email === `filho_${String(child.id).substring(0, 4)}@axecloud.com`
      );
    }

    if (authUser) {
      const updateFields: any = {
        password: generatedPassword,
        email_confirm: true,
        user_metadata: { nome: child.nome, role: "filho" },
      };

      if (authUser.email !== fakeEmail) {
        updateFields.email = fakeEmail;
      }

      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, updateFields);
      if (updateError) throw updateError;

      if (child.user_id !== authUser.id) {
        const { error: linkError } = await supabaseAdmin
          .from("filhos_de_santo")
          .update({ user_id: authUser.id })
          .eq("id", child.id);
        if (linkError) throw linkError;
      }

      return sendJson(res, 200, { email: fakeEmail, password: generatedPassword });
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { nome: child.nome, role: "filho" },
    });

    if (createError) {
      if (createError.message.includes("already")) {
        const { data: finalSearch } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const found = finalSearch.users.find((u: any) => u.email === fakeEmail);
        if (found) {
          const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(found.id, { password: generatedPassword });
          if (updateError) throw updateError;

          const { error: linkError } = await supabaseAdmin
            .from("filhos_de_santo")
            .update({ user_id: found.id })
            .eq("id", child.id);
          if (linkError) throw linkError;

          return sendJson(res, 200, { email: fakeEmail, password: generatedPassword });
        }
      }
      throw createError;
    }

    const { error: linkError } = await supabaseAdmin
      .from("filhos_de_santo")
      .update({ user_id: newUser.user.id })
      .eq("id", child.id);
    if (linkError) throw linkError;

    return sendJson(res, 200, { email: fakeEmail, password: generatedPassword });
  } catch (error: any) {
    console.error("[AUTH] Erro no Login do Filho:", error);
    return sendJson(res, 500, { error: error.message || "Erro ao processar login." });
  }
}
