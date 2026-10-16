import type { NavigatorScreenParams } from '@react-navigation/native';

// ---------------------------------------------------------------------
// Entidades do banco (espelham supabase_schema.sql)
// ---------------------------------------------------------------------

export type TipoCategoria = 'DESPESA' | 'RECEITA';
export type TipoTransacao = 'DESPESA' | 'RECEITA' | 'TRANSFERENCIA';
export type TipoConta = 'CORRENTE' | 'POUPANCA' | 'DINHEIRO';
export type StatusFatura = 'ABERTA' | 'FECHADA' | 'PAGA';
export type StatusTransacao = 'EFETIVADA' | 'PENDENTE';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  data_criacao: string;
}

export interface Categoria {
  id: string;
  usuario_id: string;
  nome: string;
  tipo: TipoCategoria;
  icone: string;
  data_criacao: string;
}

export interface Conta {
  id: string;
  usuario_id: string;
  nome: string;
  saldo: number;
  tipo: TipoConta;
  data_criacao: string;
}

export interface CartaoCredito {
  id: string;
  usuario_id: string;
  nome: string;
  bandeira: string;
  ultimos_digitos: string;
  cor_card: string;
  limite_total: number;
  dia_fechamento: number;
  dia_vencimento: number;
  data_criacao: string;
}

export interface FaturaCartao {
  id: string;
  usuario_id: string;
  cartao_id: string;
  /** Formato 'MM-AAAA' */
  mes_ano_referencia: string;
  valor_total: number;
  status: StatusFatura;
  data_fechamento: string;
  data_vencimento: string;
}

export interface Transacao {
  id: string;
  usuario_id: string;
  conta_id: string | null;
  cartao_id: string | null;
  fatura_id: string | null;
  categoria_id: string | null;
  tipo: TipoTransacao;
  /** Negativo para despesas, positivo para receitas */
  valor: number;
  descricao: string;
  /** Formato 'YYYY-MM-DD' */
  data_transacao: string;
  status: StatusTransacao;
  numero_parcela: number;
  total_parcelas: number;
  recorrente: boolean;
  data_criacao: string;
}

/** Transação com os joins usados nas listagens. */
export interface TransacaoDetalhada extends Transacao {
  categorias: Pick<Categoria, 'nome' | 'icone'> | null;
  contas: Pick<Conta, 'nome'> | null;
  cartoes_credito: Pick<CartaoCredito, 'nome'> | null;
}

export type NovaTransacao = Omit<Transacao, 'id' | 'data_criacao' | 'fatura_id'> & {
  fatura_id?: string | null;
};

export interface OrcamentoCategoria {
  id: string;
  usuario_id: string;
  categoria_id: string;
  limite_mensal: number;
  porcentagem_alerta: number;
  status_alerta_enviado: boolean;
  mes_ano_referencia: string;
}

export interface MetaCofrinho {
  id: string;
  usuario_id: string;
  nome: string;
  valor_alvo: number;
  valor_atual: number;
  icone: string;
  data_criacao: string;
}

// ---------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------

export interface ExtratoParams {
  contaId?: string;
  contaNome?: string;
}

export type TabParamList = {
  Inicio: undefined;
  Extrato: ExtratoParams | undefined;
  Novo: { tipo?: TipoTransacao; nonce?: number } | undefined;
  Cartoes: undefined;
  Relatorios: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  ExtratoDetalhe: ExtratoParams | undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
