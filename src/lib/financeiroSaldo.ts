/**
 * Regras compartilhadas entre Dashboard e Financeiro para saldo e datas de lançamento.
 */

export function parseFinanceiroDataRef(t: {
  data?: string | null;
  created_at?: string | null;
}): Date | null {
  const raw = t.data;
  const s = raw != null ? String(raw).trim() : '';
  if (!s) {
    if (!t.created_at) return null;
    const d = new Date(t.created_at);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const mo = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    const d = new Date(y, mo, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) {
    const day = Number(dmy[1]);
    const mo = Number(dmy[2]) - 1;
    const y = Number(dmy[3]);
    const d = new Date(y, mo, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeMovimentoTipo(tipo: string | undefined | null): 'entrada' | 'saida' | 'outro' {
  const t = (tipo || '').toLowerCase();
  if (t === 'entrada' || t === 'receita' || t === 'credit' || t === 'income') return 'entrada';
  if (t === 'saida' || t === 'saída' || t === 'despesa' || t === 'debit' || t === 'expense') return 'saida';
  return 'outro';
}

/** Inclui no saldo exibido: sem coluna status (legado) ou valores tratados como confirmados/pagos. */
export function countsTowardSaldo(t: { status?: string | null }): boolean {
  const s = (t.status || '').toLowerCase().trim();
  if (!s) return true;
  if (s === 'confirmado' || s === 'confirmada' || s === 'pago' || s === 'paid') return true;
  if (
    s === 'pendente' ||
    s === 'cancelado' ||
    s === 'cancelada' ||
    s === 'rejeitado' ||
    s === 'rejeitada' ||
    s === 'excluido' ||
    s === 'excluído'
  ) {
    return false;
  }
  return true;
}

export function isLancamentoNoMesRef(
  t: { data?: string | null; created_at?: string | null },
  ref: Date
): boolean {
  const d = parseFinanceiroDataRef(t);
  if (!d) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}
