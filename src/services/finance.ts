import type { Categoria, OrcamentoCategoria } from '../types';
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
