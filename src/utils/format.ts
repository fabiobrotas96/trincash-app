import type { CartaoCredito } from '../types';

const MESES_ABREV = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ---------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------

/** 1234.5 -> "R$ 1.234,50" (sem depender de Intl, que varia entre engines JS). */
export function formatCurrency(value: number, opts: { sign?: boolean } = {}): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const prefix = n < 0 ? '- ' : opts.sign && n > 0 ? '+ ' : '';
  return `${prefix}R$ ${intFmt},${dec}`;
}

/**
 * Converte texto digitado pelo usuário em número. Aceita vírgula ou ponto
 * como separador decimal: "1.234,56", "1234,56", "1234.56", "-50".
 */
export function parseValor(text: string): number {
  const raw = text.trim().replace(/[R$\s]/g, '');
  if (!raw) return NaN;
  let normalized = raw;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    normalized = raw.replace(/\./g, '');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Converte string de dígitos em centavos: "1234" -> 12.34 (máscara de valor). */
export function digitsToAmount(digits: string): number {
  const clean = digits.replace(/\D/g, '').slice(0, 11);
  return clean ? Number(clean) / 100 : 0;
}

export function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------
// Datas (sempre em horário local, formato ISO 'YYYY-MM-DD')
// ---------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function today(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Soma meses mantendo o dia, ajustando para o último dia do mês quando necessário. */
export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const day = Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  return new Date(target.getFullYear(), target.getMonth(), day);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 'MM-AAAA', formato de mes_ano_referencia. */
export function mesAnoReferencia(d: Date): string {
  return `${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** '10-2026' -> 'Out/2026' */
export function formatMesAno(ref: string): string {
  const [m, y] = ref.split('-').map(Number);
  const nome = MESES[(m || 1) - 1] ?? '';
  return `${nome.slice(0, 3)}/${y}`;
}

export function nomeMes(d: Date): string {
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** "06 de out. de 2026" */
export function formatDateLong(iso: string): string {
  const d = parseISODate(iso);
  return `${pad(d.getDate())} de ${MESES_ABREV[d.getMonth()]} de ${d.getFullYear()}`;
}

/** "06/10" */
export function formatDateShort(iso: string): string {
  const d = parseISODate(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** Rótulo de cabeçalho do extrato: "Hoje", "Ontem" ou "06 de out. de 2026". */
export function formatDateLabel(iso: string): string {
  const t = toISODate(today());
  const y = toISODate(addDays(today(), -1));
  if (iso === t) return 'Hoje';
  if (iso === y) return 'Ontem';
  return formatDateLong(iso);
}

/** "DD/MM/AAAA" -> Date (ou null se inválida). */
export function parseDateBR(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m.map(Number);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) return null;
  return d;
}

/** Máscara progressiva para digitação de data: "06102026" -> "06/10/2026". */
export function maskDateBR(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// ---------------------------------------------------------------------
// Ciclo de fatura (espelha fn_obter_ou_criar_fatura no SQL)
// ---------------------------------------------------------------------

function diaAjustado(year: number, monthIndex: number, dia: number): Date {
  return new Date(year, monthIndex, Math.min(dia, daysInMonth(year, monthIndex)));
}

export interface CicloFatura {
  mesAno: string;
  fechamento: Date;
  vencimento: Date;
}

/** Calcula a qual fatura uma compra feita em `data` pertence. */
export function calcularCicloFatura(
  cartao: Pick<CartaoCredito, 'dia_fechamento' | 'dia_vencimento'>,
  data: Date,
): CicloFatura {
  let ref = startOfMonth(data);
  if (data >= diaAjustado(ref.getFullYear(), ref.getMonth(), cartao.dia_fechamento)) {
    ref = addMonths(ref, 1);
  }
  const fechamento = diaAjustado(ref.getFullYear(), ref.getMonth(), cartao.dia_fechamento);
  const vencRef = cartao.dia_vencimento > cartao.dia_fechamento ? ref : addMonths(ref, 1);
  const vencimento = diaAjustado(vencRef.getFullYear(), vencRef.getMonth(), cartao.dia_vencimento);
  return { mesAno: mesAnoReferencia(ref), fechamento, vencimento };
}

/** Converte 'MM-AAAA' em número ordenável (AAAAMM). */
export function mesAnoOrdem(ref: string): number {
  const [m, y] = ref.split('-').map(Number);
  return y * 100 + m;
}
