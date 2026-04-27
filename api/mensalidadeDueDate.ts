import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isBefore,
  isValid,
  parseISO,
  startOfDay,
} from 'date-fns';

function clampDayInMonth(year: number, monthIndex0: number, dayWanted: number): Date {
  const last = endOfMonth(new Date(year, monthIndex0, 1)).getDate();
  const d = Math.min(Math.max(1, dayWanted), last);
  return new Date(year, monthIndex0, d);
}

/** Primeiro vencimento (dia fixo) do mês da inclusão que não seja antes da data de entrada. */
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

/**
 * Próxima data de vencimento da mensalidade para exibir na grade do zelador.
 * Usa `data_entrada` ou `created_at` como referência de inclusão e o dia fixo das configurações.
 * Regra extra: na véspera (falta 1 dia para o vencimento no mesmo mês), já exibe o vencimento do mês seguinte.
 */
export function computeProximaDataMensalidadePrevisao(
  dataInclusaoIso: string | null | undefined,
  diaVencimento: number,
  referencia: Date = new Date()
): string {
  const hoje = startOfDay(referencia);
  let inclusao = hoje;
  if (dataInclusaoIso && String(dataInclusaoIso).trim() !== '') {
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

  return format(cursor, 'yyyy-MM-dd');
}
