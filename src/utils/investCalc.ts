/**
 * Simulador de investimentos (cálculo local, sem APIs externas).
 *
 * Modelo, mês a mês:
 *  - Cada aporte vira um "lote" com sua própria data, para que o IR
 *    regressivo use o prazo correto de cada aporte.
 *  - A taxa de entrada (carregamento/corretagem) é descontada no aporte.
 *  - Rentabilidade bruta anual vira fator mensal composto.
 *  - Taxa de administração e custódia (% a.a.) são cobradas mensalmente
 *    sobre o saldo (1/12 da taxa anual).
 *  - IR é cobrado no resgate final, sobre o ganho de cada lote.
 *
 * Simplificações: IOF ignorado (só incide em resgates com menos de 30 dias),
 * come-cotas não modelado, TR da poupança considerada zero, inflação e taxas
 * de mercado constantes durante todo o prazo.
 */

export type PerfilId =
  | 'POUPANCA'
  | 'CDB'
  | 'LCI_LCA'
  | 'TESOURO_SELIC'
  | 'TESOURO_IPCA'
  | 'PREFIXADO'
  | 'ACOES'
  | 'FII'
  | 'CRIPTO'
  | 'PREVIDENCIA';

export type Indexador = 'POUPANCA' | 'CDI' | 'SELIC' | 'IPCA' | 'PREFIXADO';
export type RegraIR = 'REGRESSIVO' | 'PREVIDENCIA' | 'ISENTO' | 'FIXO';

/** Taxas de mercado em % ao ano. */
export interface Mercado {
  selic: number;
  cdi: number;
  ipca: number;
}

export interface ParametrosPerfil {
  indexador: Indexador;
  /**
   * Significado depende do indexador:
   *  CDI → % do CDI (ex: 110); SELIC → spread % a.a. somado à Selic;
   *  IPCA → taxa real % a.a. (IPCA + x); PREFIXADO → % a.a.; POUPANCA → ignorado.
   */
  taxa: number;
  /** Taxa de administração, % a.a. sobre o saldo. */
  taxaAdm: number;
  /** Taxa de custódia, % a.a. sobre o saldo (ex: B3 no Tesouro Direto). */
  custodia: number;
  /** Taxa sobre cada aporte: carregamento (previdência) ou corretagem/spread (%). */
  taxaEntrada: number;
  regraIR: RegraIR;
  /** Alíquota usada quando regraIR = 'FIXO' (%). */
  aliquotaIR: number;
}

export interface PerfilInfo {
  nome: string;
  icone: string;
  descricao: string;
  /** Rótulo do campo `taxa` na tela. */
  labelTaxa: string;
  padrao: ParametrosPerfil;
}

// Taxas de referência editáveis na tela. Atualize com os valores do momento.
export const MERCADO_PADRAO: Mercado = { selic: 15, cdi: 14.9, ipca: 4.5 };

const base = { taxaAdm: 0, custodia: 0, taxaEntrada: 0, aliquotaIR: 15 };

export const PERFIS: Record<PerfilId, PerfilInfo> = {
  POUPANCA: {
    nome: 'Poupança',
    icone: '🐷',
    descricao: '0,5% a.m. com Selic acima de 8,5% (senão 70% da Selic). Isenta de IR.',
    labelTaxa: '—',
    padrao: { ...base, indexador: 'POUPANCA', taxa: 0, regraIR: 'ISENTO' },
  },
  CDB: {
    nome: 'CDB / LC',
    icone: '🏦',
    descricao: 'Pós-fixado em % do CDI. IR regressivo de 22,5% a 15%. Garantia do FGC.',
    labelTaxa: '% do CDI',
    padrao: { ...base, indexador: 'CDI', taxa: 100, regraIR: 'REGRESSIVO' },
  },
  LCI_LCA: {
    nome: 'LCI / LCA',
    icone: '🏡',
    descricao: 'Pós-fixado em % do CDI, isento de IR para pessoa física. Garantia do FGC.',
    labelTaxa: '% do CDI',
    padrao: { ...base, indexador: 'CDI', taxa: 90, regraIR: 'ISENTO' },
  },
  TESOURO_SELIC: {
    nome: 'Tesouro Selic',
    icone: '🇧🇷',
    descricao: 'Selic + spread. Custódia B3 de 0,20% a.a. IR regressivo.',
    labelTaxa: 'Spread sobre a Selic (% a.a.)',
    padrao: { ...base, indexador: 'SELIC', taxa: 0.08, custodia: 0.2, regraIR: 'REGRESSIVO' },
  },
  TESOURO_IPCA: {
    nome: 'Tesouro IPCA+',
    icone: '📈',
    descricao: 'IPCA + taxa real, levado ao vencimento. Custódia B3 de 0,20% a.a. IR regressivo.',
    labelTaxa: 'Taxa real (IPCA + % a.a.)',
    padrao: { ...base, indexador: 'IPCA', taxa: 7, custodia: 0.2, regraIR: 'REGRESSIVO' },
  },
  PREFIXADO: {
    nome: 'Prefixado',
    icone: '📌',
    descricao: 'Taxa fixa ao ano (CDB ou Tesouro Prefixado). IR regressivo.',
    labelTaxa: 'Taxa (% a.a.)',
    padrao: { ...base, indexador: 'PREFIXADO', taxa: 13.5, regraIR: 'REGRESSIVO' },
  },
  ACOES: {
    nome: 'Ações / ETFs',
    icone: '📊',
    descricao: 'Retorno esperado (não garantido). ETFs cobram taxa de administração. IR de 15% sobre o ganho.',
    labelTaxa: 'Retorno esperado (% a.a.)',
    padrao: { ...base, indexador: 'PREFIXADO', taxa: 12, taxaAdm: 0.3, regraIR: 'FIXO', aliquotaIR: 15 },
  },
  FII: {
    nome: 'Fundos Imobiliários',
    icone: '🏢',
    descricao: 'Retorno esperado com dividendos reinvestidos (isentos). Ganho de capital na venda não considerado.',
    labelTaxa: 'Retorno esperado (% a.a.)',
    padrao: { ...base, indexador: 'PREFIXADO', taxa: 11, regraIR: 'ISENTO' },
  },
  CRIPTO: {
    nome: 'Criptomoedas',
    icone: '🪙',
    descricao: 'Alta volatilidade; retorno esperado hipotético. Spread da corretora por aporte. IR de 15% sobre o ganho.',
    labelTaxa: 'Retorno esperado (% a.a.)',
    padrao: { ...base, indexador: 'PREFIXADO', taxa: 15, taxaEntrada: 0.5, regraIR: 'FIXO', aliquotaIR: 15 },
  },
  PREVIDENCIA: {
    nome: 'Previdência (VGBL)',
    icone: '🛟',
    descricao: 'Taxa de administração e carregamento. Tabela regressiva de 35% a 10% sobre o ganho (VGBL).',
    labelTaxa: '% do CDI',
    padrao: { ...base, indexador: 'CDI', taxa: 100, taxaAdm: 1, taxaEntrada: 0, regraIR: 'PREVIDENCIA' },
  },
};

export const PERFIL_IDS = Object.keys(PERFIS) as PerfilId[];

/** Tipos de investimento da carteira → perfil padrão do simulador. */
export const PERFIL_POR_TIPO: Record<string, PerfilId> = {
  RENDA_FIXA: 'CDB',
  TESOURO: 'TESOURO_SELIC',
  ACOES: 'ACOES',
  FII: 'FII',
  CRIPTO: 'CRIPTO',
  PREVIDENCIA: 'PREVIDENCIA',
  OUTRO: 'CDB',
};

// ---------------------------------------------------------------------

/** Rentabilidade bruta anual (fração, ex: 0.149) para o perfil. */
export function taxaBrutaAnual(p: ParametrosPerfil, m: Mercado): number {
  switch (p.indexador) {
    case 'POUPANCA':
      return m.selic > 8.5 ? Math.pow(1.005, 12) - 1 : (0.7 * m.selic) / 100;
    case 'CDI':
      return ((m.cdi / 100) * p.taxa) / 100;
    case 'SELIC':
      return (m.selic + p.taxa) / 100;
    case 'IPCA':
      return (1 + m.ipca / 100) * (1 + p.taxa / 100) - 1;
    case 'PREFIXADO':
      return p.taxa / 100;
  }
}

/** Alíquota de IR (fração) para um lote mantido por `meses`. */
export function aliquotaIR(p: ParametrosPerfil, meses: number): number {
  const dias = meses * 30;
  switch (p.regraIR) {
    case 'ISENTO':
      return 0;
    case 'FIXO':
      return p.aliquotaIR / 100;
    case 'REGRESSIVO':
      if (dias <= 180) return 0.225;
      if (dias <= 360) return 0.2;
      if (dias <= 720) return 0.175;
      return 0.15;
    case 'PREVIDENCIA': {
      const anos = meses / 12;
      if (anos <= 2) return 0.35;
      if (anos <= 4) return 0.3;
      if (anos <= 6) return 0.25;
      if (anos <= 8) return 0.2;
      if (anos <= 10) return 0.15;
      return 0.1;
    }
  }
}

export interface Entrada {
  inicial: number;
  aporteMensal: number;
  meses: number;
  params: ParametrosPerfil;
  mercado: Mercado;
}

export interface PontoEvolucao {
  mes: number;
  investido: number;
  /** Saldo após taxas, antes do IR. */
  saldo: number;
}

export interface Resultado {
  totalInvestido: number;
  /** Saldo final após taxas, antes do IR. */
  saldoBruto: number;
  rendimentoBruto: number;
  taxaAnualBruta: number;
  taxasAdmCustodia: number;
  taxasEntrada: number;
  ir: number;
  saldoLiquido: number;
  rendimentoLiquido: number;
  /** Ganho líquido / total investido. */
  rentabilidadeLiquida: number;
  /** Taxa anual equivalente líquida (TIR anualizada dos fluxos). */
  taxaAnualLiquida: number;
  /** Saldo líquido em valores de hoje (descontado o IPCA). */
  valorReal: number;
  evolucao: PontoEvolucao[];
}

interface Lote {
  mesInicio: number;
  aplicado: number; // valor efetivamente aplicado (após taxa de entrada)
  valor: number;
}

export function simular({ inicial, aporteMensal, meses, params, mercado }: Entrada): Resultado {
  const n = Math.max(1, Math.round(meses));
  const anual = taxaBrutaAnual(params, mercado);
  const fatorMensal = Math.pow(1 + anual, 1 / 12);
  const taxaMensalSaldo = (params.taxaAdm + params.custodia) / 100 / 12;
  const entrada = params.taxaEntrada / 100;

  const lotes: Lote[] = [];
  let totalInvestido = 0;
  let taxasAdmCustodia = 0;
  let taxasEntrada = 0;
  const evolucao: PontoEvolucao[] = [];

  const aportar = (valor: number, mes: number) => {
    if (valor <= 0) return;
    totalInvestido += valor;
    const taxa = valor * entrada;
    taxasEntrada += taxa;
    lotes.push({ mesInicio: mes, aplicado: valor - taxa, valor: valor - taxa });
  };

  for (let mes = 0; mes < n; mes++) {
    // Aportes no início do mês: inicial no mês 0 e o mensal em todos os meses.
    if (mes === 0) aportar(inicial, 0);
    aportar(aporteMensal, mes);

    for (const l of lotes) {
      l.valor *= fatorMensal;
      const taxa = l.valor * taxaMensalSaldo;
      l.valor -= taxa;
      taxasAdmCustodia += taxa;
    }

    const fimDoMes = mes + 1;
    if (fimDoMes % 12 === 0 || fimDoMes === n) {
      evolucao.push({ mes: fimDoMes, investido: totalInvestido, saldo: lotes.reduce((a, l) => a + l.valor, 0) });
    }
  }

  let ir = 0;
  for (const l of lotes) {
    const ganho = l.valor - l.aplicado;
    if (ganho > 0) ir += ganho * aliquotaIR(params, n - l.mesInicio);
  }

  const saldoBruto = lotes.reduce((a, l) => a + l.valor, 0);
  const saldoLiquido = saldoBruto - ir;
  const rendimentoLiquido = saldoLiquido - totalInvestido;

  return {
    totalInvestido,
    saldoBruto,
    rendimentoBruto: saldoBruto - totalInvestido,
    taxaAnualBruta: anual,
    taxasAdmCustodia,
    taxasEntrada,
    ir,
    saldoLiquido,
    rendimentoLiquido,
    rentabilidadeLiquida: totalInvestido > 0 ? rendimentoLiquido / totalInvestido : 0,
    taxaAnualLiquida: taxaAnualEquivalente(inicial, aporteMensal, n, saldoLiquido),
    valorReal: saldoLiquido / Math.pow(1 + mercado.ipca / 100, n / 12),
    evolucao,
  };
}

/** TIR mensal (bisseção) dos fluxos: aportes no início de cada mês, resgate no fim. */
function taxaAnualEquivalente(inicial: number, aporte: number, n: number, final: number): number {
  const vf = (i: number) => {
    let s = 0;
    for (let mes = 0; mes < n; mes++) {
      const v = (mes === 0 ? inicial : 0) + aporte;
      s += v * Math.pow(1 + i, n - mes);
    }
    return s;
  };
  if (final <= 0 || vf(0) <= 0) return 0;
  let lo = -0.99;
  let hi = 1;
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    if (vf(mid) > final) hi = mid;
    else lo = mid;
  }
  return Math.pow(1 + (lo + hi) / 2, 12) - 1;
}

/**
 * Aporte mensal necessário para chegar a `alvoLiquido` (já descontados
 * taxas e IR) em `meses`, partindo de `inicial`. Retorna 0 se o valor
 * inicial sozinho já atinge o alvo.
 */
export function aporteNecessario(
  alvoLiquido: number,
  inicial: number,
  meses: number,
  params: ParametrosPerfil,
  mercado: Mercado,
): number {
  const liquido = (aporte: number) => simular({ inicial, aporteMensal: aporte, meses, params, mercado }).saldoLiquido;
  if (alvoLiquido <= 0 || liquido(0) >= alvoLiquido) return 0;
  let lo = 0;
  let hi = Math.max(alvoLiquido, 1);
  while (liquido(hi) < alvoLiquido) hi *= 2;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (liquido(mid) >= alvoLiquido) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 100) / 100;
}

/** Meses entre hoje e uma data (mínimo 1). */
export function mesesAte(data: Date, hoje = new Date()): number {
  const m = (data.getFullYear() - hoje.getFullYear()) * 12 + (data.getMonth() - hoje.getMonth());
  return Math.max(1, m);
}
