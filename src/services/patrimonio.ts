/**
 * Cálculos de patrimônio, objetivos e planejamento de gastos (sem I/O).
 *
 * Regras de divisão: itens sem pessoa (pessoa_id nulo) são do casal e entram
 * em partes iguais para cada pessoa, assim como os gastos divididos. Contas
 * bancárias não têm dono e contam como do casal.
 */
import type { Bem, Conta, Investimento, ObjetivoPatrimonio, Pessoa, Renda } from '../types';
import { aporteNecessario, mesesAte, PERFIS, type Mercado, type PerfilId } from '../utils/investCalc';
import { parseISODate, toNumber } from '../utils/format';

/** 'casal' = itens sem dono; id de pessoa = visão daquela pessoa (próprios + parte do casal). */
export type Escopo = 'todos' | 'casal' | string;

export interface ComposicaoPatrimonio {
  contas: number;
  investimentos: number;
  /** Valor estimado dos bens (bruto). */
  bens: number;
  /** Saldo devedor dos bens (financiamentos). */
  dividas: number;
  total: number;
}

export interface PatrimonioPessoa {
  pessoa: Pick<Pessoa, 'id' | 'nome' | 'cor'>;
  proprio: ComposicaoPatrimonio;
  parteCasal: ComposicaoPatrimonio;
  total: number;
}

export interface DadosPatrimonio {
  pessoas: Pick<Pessoa, 'id' | 'nome' | 'cor'>[];
  contas: Pick<Conta, 'saldo'>[];
  investimentos: Pick<Investimento, 'pessoa_id' | 'valor_atual'>[];
  bens: Pick<Bem, 'pessoa_id' | 'valor_estimado' | 'saldo_devedor'>[];
}

const vazio = (): ComposicaoPatrimonio => ({ contas: 0, investimentos: 0, bens: 0, dividas: 0, total: 0 });

function fechar(c: ComposicaoPatrimonio): ComposicaoPatrimonio {
  c.total = c.contas + c.investimentos + c.bens - c.dividas;
  return c;
}

function escalar(c: ComposicaoPatrimonio, f: number): ComposicaoPatrimonio {
  return fechar({ contas: c.contas * f, investimentos: c.investimentos * f, bens: c.bens * f, dividas: c.dividas * f, total: 0 });
}

function somar(a: ComposicaoPatrimonio, b: ComposicaoPatrimonio): ComposicaoPatrimonio {
  return fechar({
    contas: a.contas + b.contas,
    investimentos: a.investimentos + b.investimentos,
    bens: a.bens + b.bens,
    dividas: a.dividas + b.dividas,
    total: 0,
  });
}

/** Composição dos itens de um dono (pessoaId) ou do casal (null). Contas entram só no casal. */
function composicaoDe(d: DadosPatrimonio, pessoaId: string | null): ComposicaoPatrimonio {
  const valido = (id: string | null) => (id && d.pessoas.some((p) => p.id === id) ? id : null);
  const c = vazio();
  if (pessoaId === null) c.contas = d.contas.reduce((a, x) => a + toNumber(x.saldo), 0);
  for (const i of d.investimentos) if (valido(i.pessoa_id) === pessoaId) c.investimentos += toNumber(i.valor_atual);
  for (const b of d.bens) {
    if (valido(b.pessoa_id) !== pessoaId) continue;
    c.bens += toNumber(b.valor_estimado);
    c.dividas += toNumber(b.saldo_devedor);
  }
  return fechar(c);
}

export function calcularPatrimonio(d: DadosPatrimonio): {
  total: ComposicaoPatrimonio;
  casal: ComposicaoPatrimonio;
  porPessoa: PatrimonioPessoa[];
} {
  const casal = composicaoDe(d, null);
  const n = d.pessoas.length;
  const parte = n ? escalar(casal, 1 / n) : vazio();
  const porPessoa = d.pessoas.map((p) => {
    const proprio = composicaoDe(d, p.id);
    return { pessoa: p, proprio, parteCasal: parte, total: proprio.total + parte.total };
  });
  const total = porPessoa.reduce((acc, p) => somar(acc, p.proprio), casal);
  return { total, casal, porPessoa };
}

/** Patrimônio visto por um escopo: 'todos' (tudo), 'casal' (só itens sem dono) ou uma pessoa (próprio + parte do casal). */
export function patrimonioDoEscopo(d: DadosPatrimonio, escopo: Escopo): ComposicaoPatrimonio {
  const p = calcularPatrimonio(d);
  if (escopo === 'todos') return p.total;
  if (escopo === 'casal') return p.casal;
  const pp = p.porPessoa.find((x) => x.pessoa.id === escopo);
  return pp ? somar(pp.proprio, pp.parteCasal) : vazio();
}

// ---------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------

export interface StatusObjetivo {
  objetivo: ObjetivoPatrimonio;
  /** Patrimônio atual considerado para o objetivo. */
  atual: number;
  progresso: number;
  meses: number;
  /** Aporte mensal necessário em investimentos (já considerando taxas e IR do perfil). */
  aporteMensal: number;
  atingido: boolean;
  /** Investimentos atuais do escopo (base que rende). */
  investimentosAtuais: number;
  /** Quanto os investimentos precisam valer (líquido) para fechar o alvo. */
  alvoInvestimentos: number;
  perfil: PerfilId;
}

/**
 * Objetivo do casal (pessoa_id nulo) usa o patrimônio total; objetivo de uma
 * pessoa usa o patrimônio dela (próprio + parte do casal). Só os
 * investimentos rendem: contas e bens ficam constantes no cálculo.
 */
export function calcularObjetivo(
  objetivo: ObjetivoPatrimonio,
  dados: DadosPatrimonio,
  mercado: Mercado,
  hoje = new Date(),
): StatusObjetivo {
  const escopo: Escopo = objetivo.pessoa_id ?? 'todos';
  const comp = patrimonioDoEscopo(dados, escopo);
  const alvo = toNumber(objetivo.valor_alvo);
  const meses = mesesAte(parseISODate(objetivo.data_alvo), hoje);
  const perfil = (objetivo.perfil in PERFIS ? objetivo.perfil : 'CDB') as PerfilId;
  const naoRentavel = comp.total - comp.investimentos;
  const alvoInvestimentos = alvo - naoRentavel;
  const aporteMensal =
    comp.total >= alvo
      ? 0
      : aporteNecessario(alvoInvestimentos, Math.max(0, comp.investimentos), meses, PERFIS[perfil].padrao, mercado);
  return {
    objetivo,
    atual: comp.total,
    progresso: alvo > 0 ? Math.max(0, comp.total) / alvo : 0,
    meses,
    aporteMensal,
    atingido: comp.total >= alvo,
    investimentosAtuais: Math.max(0, comp.investimentos),
    alvoInvestimentos,
    perfil,
  };
}

// ---------------------------------------------------------------------
// Planejamento: quanto dá para gastar por mês
// ---------------------------------------------------------------------

export interface PlanoPessoa {
  pessoa: Pick<Pessoa, 'id' | 'nome' | 'cor'>;
  renda: number;
  aportes: number;
  podeGastar: number;
  gastoMedio: number;
}

export interface Plano {
  rendaTotal: number;
  aportesTotal: number;
  /** Renda - aportes necessários para os objetivos. */
  podeGastar: number;
  gastoMedio: number;
  /** podeGastar - gastoMedio (negativo = acima do plano). */
  folga: number;
  porPessoa: PlanoPessoa[];
}

/**
 * Renda e aportes do casal entram em partes iguais para cada pessoa.
 * `gastoMedioPorPessoa` vem de resumoPorPessoa (próprios + parte dos divididos).
 */
export function calcularPlano(
  pessoas: Pick<Pessoa, 'id' | 'nome' | 'cor'>[],
  rendas: Pick<Renda, 'pessoa_id' | 'valor_mensal' | 'ativa'>[],
  objetivos: StatusObjetivo[],
  gastoMedioTotal: number,
  gastoMedioPorPessoa: Map<string, number>,
): Plano {
  const n = pessoas.length;
  const ehPessoa = (id: string | null) => !!id && pessoas.some((p) => p.id === id);
  const ativas = rendas.filter((r) => r.ativa);
  const rendaTotal = ativas.reduce((a, r) => a + toNumber(r.valor_mensal), 0);
  const rendaCasal = ativas.filter((r) => !ehPessoa(r.pessoa_id)).reduce((a, r) => a + toNumber(r.valor_mensal), 0);
  const aportesTotal = objetivos.reduce((a, o) => a + o.aporteMensal, 0);
  const aportesCasal = objetivos
    .filter((o) => !ehPessoa(o.objetivo.pessoa_id))
    .reduce((a, o) => a + o.aporteMensal, 0);

  const porPessoa = pessoas.map((p) => {
    const renda =
      ativas.filter((r) => r.pessoa_id === p.id).reduce((a, r) => a + toNumber(r.valor_mensal), 0) +
      (n ? rendaCasal / n : 0);
    const aportes =
      objetivos.filter((o) => o.objetivo.pessoa_id === p.id).reduce((a, o) => a + o.aporteMensal, 0) +
      (n ? aportesCasal / n : 0);
    return { pessoa: p, renda, aportes, podeGastar: renda - aportes, gastoMedio: gastoMedioPorPessoa.get(p.id) ?? 0 };
  });

  const podeGastar = rendaTotal - aportesTotal;
  return { rendaTotal, aportesTotal, podeGastar, gastoMedio: gastoMedioTotal, folga: podeGastar - gastoMedioTotal, porPessoa };
}
