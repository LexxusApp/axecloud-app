import { z } from 'zod';

// 1. Admin: Create Tenant Schema
export const CreateTenantSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
  nome_terreiro: z.string().min(3, "Nome do terreiro muito curto"),
  nome_zelador: z.string().min(3, "Nome do zelador muito curto"),
  whatsapp: z.string().optional(),
  plan: z.enum(['axe', 'oro', 'free', 'premium', 'cortesia', 'vita']).default('axe'),
  observacao: z.string().optional(),
});

// 2. User: Save Settings Schema
export const SaveSettingsSchema = z.object({
  userId: z.string().uuid("ID de usuário inválido"),
  tenantId: z.string().uuid("ID de tenant inválido").optional(),
  profile: z.object({
    email: z.string().email("E-mail inválido").optional(),
    nome_terreiro: z.string().min(3).optional(),
    cargo: z.string().optional(),
  }).optional(),
  preferences: z.object({
    show_financeiro: z.boolean().optional(),
    show_arrecadacao: z.boolean().optional(),
    show_obrigacoes: z.boolean().optional(),
    show_prontuario: z.boolean().optional(),
    show_eventos: z.boolean().optional(),
    show_biblioteca: z.boolean().optional(),
    show_loja: z.boolean().optional(),
    show_almoxarifado: z.boolean().optional(),
  }).optional(),
});

// 3. Child: Create/Update Schema
export const ChildSchema = z.object({
  nome: z.string().min(2, "Nome muito curto"),
  foto_url: z.string().url().optional().or(z.literal('')),
  orixa_frente: z.string().optional(),
  cargo: z.string().optional(),
  data_nascimento: z.string().optional().nullable(),
  data_entrada: z.string().optional().nullable(),
  status: z.enum(['Ativo', 'Pendente', 'Inativo']).default('Ativo'),
  cpf: z.string().optional(),
  endereco: z.string().optional(),
  contato: z.string().optional(),
  adjunto: z.string().optional(),
  data_feitura: z.string().optional().nullable(),
});

export const AddChildRequestSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  childData: ChildSchema,
});
