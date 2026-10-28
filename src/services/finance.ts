import type { Categoria, OrcamentoCategoria, Pessoa, Transacao } from '../types';
import { daysInMonth, endOfMonth, mesAnoReferencia, startOfMonth, toISODate, toNumber, today } from '../utils/format';
import { supabase } from './supabase';

export interface GastoCategoria {
  categoriaId: string | null;
  nome: string;
  icone: string;
  total: number;
}

/** Soma as despesas (valor absoluto) por categoria entre duas datas (inclusive). */
export async function gastosPorCategoria(inicio: Date, fim: Date): Promise<GastoCategoria[]> {
  const { data, error } = await supabase
    .from('transacoes')
    .select('valor, categoria_id, categorias(nome, icone)')
    .eq('tipo', 'DESPESA')
    .gte('data_transacao', toISODate(inicio))
    .lte('data_transacao', toISODate(fim));
  if (error) throw error;

  const map = new Map<string, GastoCategoria>();
  for (const row of (data ?? []) as unknown as {
    valor: number;
    categoria_id: string | null;
    categorias: Pick<Categoria, 'nome' | 'icone'> | null;
  }[]) {
    const key = row.categoria_id ?? 'sem-categoria';
    const atual = map.get(key) ?? {
      categoriaId: row.categoria_id,
      nome: row.categorias?.nome ?? 'Sem categoria',
      icone: row.categorias?.icone ?? '📦',
      total: 0,
    };
    atual.total += Math.abs(toNumber(row.valor));
    map.set(key, atual);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type NivelOrcamento = 'ok' | 'atencao' | 'estourado';

export interface StatusOrcamento {
  orcamento: OrcamentoCategoria;
  categoria: Pick<Categoria, 'nome' | 'icone'>;
  gasto: number;
  /** gasto / limite (0..n) */
  percentual: number;
  /** Gasto projetado para o fim do mês no ritmo atual. */
  projecao: number;
  /** Quanto pode gastar por dia até o fim do mês sem estourar. */
  disponivelPorDia: number;
  nivel: NivelOrcamento;
  /** Indica que o ritmo atual vai estourar o limite antes do fim do mês. */
  ritmoAcelerado: boolean;
}

/** Carrega orçamentos do mês atual com o gasto realizado e a velocidade de gasto. */
export async function carregarStatusOrcamentos(): Promise<StatusOrcamento[]> {
  const hoje = today();
  const inicio = startOfMonth(hoje);
  const fim = endOfMonth(hoje);
  const ref = mesAnoReferencia(hoje);

  const [orcRes, gastos] = await Promise.all([
    supabase
      .from('orcamentos_categorias')
      .select('*, categorias(nome, icone)')
      .eq('mes_ano_referencia', ref),
    gastosPorCategoria(inicio, fim),
  ]);
  if (orcRes.error) throw orcRes.error;

  const diasNoMes = daysInMonth(hoje.getFullYear(), hoje.getMonth());
  const diaAtual = hoje.getDate();
  const diasRestantes = Math.max(1, diasNoMes - diaAtual + 1);

  return ((orcRes.data ?? []) as (OrcamentoCategoria & { categorias: Pick<Categoria, 'nome' | 'icone'> | null })[])
    .map((o) => {
      const limite = toNumber(o.limite_mensal);
      const gasto = gastos.find((g) => g.categoriaId === o.categoria_id)?.total ?? 0;
      const percentual = limite > 0 ? gasto / limite : 0;
      const projecao = (gasto / diaAtual) * diasNoMes;
      const nivel: NivelOrcamento =
        percentual >= 1 ? 'estourado' : percentual * 100 >= o.porcentagem_alerta ? 'atencao' : 'ok';
      return {
        orcamento: { ...o, limite_mensal: limite },
        categoria: o.categorias ?? { nome: 'Categoria', icone: '📦' },
        gasto,
        percentual,
        projecao,
        disponivelPorDia: Math.max(0, (limite - gasto) / diasRestantes),
        nivel,
        ritmoAcelerado: projecao > limite,
      };
    })
    .sort((a, b) => b.percentual - a.percentual);
}

// ---------------------------------------------------------------------
// Gastos compartilhados por pessoa
// ---------------------------------------------------------------------

export interface GastoPessoa {
  pessoa: Pick<Pessoa, 'id' | 'nome' | 'cor'>;
  /** Gastos feitos só por essa pessoa. */
  individual: number;
  /** Parte dela nos gastos divididos (partes iguais). */
  parteDividida: number;
  total: number;
}

export interface ResumoPessoas {
  porPessoa: GastoPessoa[];
  totalDividido: number;
  /** Despesas sem pessoa nem divisão (lançadas antes de a conta virar compartilhada). */
  semPessoa: number;
  total: number;
}

/** Soma as despesas por pessoa; gastos divididos entram em partes iguais para cada uma. */
export function resumoPorPessoa(
  transacoes: Pick<Transacao, 'tipo' | 'valor' | 'pessoa_id' | 'dividido'>[],
  pessoas: Pick<Pessoa, 'id' | 'nome' | 'cor'>[],
): ResumoPessoas {
  const individual = new Map<string, number>();
  let totalDividido = 0;
  let semPessoa = 0;
  for (const t of transacoes) {
    if (t.tipo !== 'DESPESA') continue;
    const v = Math.abs(toNumber(t.valor));
    if (t.dividido) totalDividido += v;
    else if (t.pessoa_id && pessoas.some((p) => p.id === t.pessoa_id))
      individual.set(t.pessoa_id, (individual.get(t.pessoa_id) ?? 0) + v);
    else semPessoa += v;
  }
  const parte = pessoas.length ? totalDividido / pessoas.length : 0;
  const porPessoa = pessoas.map((p) => {
    const ind = individual.get(p.id) ?? 0;
    return { pessoa: p, individual: ind, parteDividida: parte, total: ind + parte };
  });
  // Sem pessoas cadastradas, o dividido não tem para quem ir: conta como sem pessoa.
  if (!pessoas.length) semPessoa += totalDividido;
  return {
    porPessoa,
    totalDividido,
    semPessoa,
    total: porPessoa.reduce((a, p) => a + p.total, 0) + semPessoa,
  };
}

export async function carregarPessoas(): Promise<Pessoa[]> {
  const { data, error } = await supabase.from('pessoas').select('*').order('data_criacao');
  if (error) throw error;
  return (data ?? []) as Pessoa[];
}
