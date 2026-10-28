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
  /** Conta compartilhada: lançamentos indicam a pessoa ou se foram divididos. */
  conjunta: boolean;
  /** Código COMPE (4 dígitos) do banco, para o logo. */
  banco_codigo: string | null;
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
  /** Cartão compartilhado: lançamentos indicam a pessoa ou se foram divididos. */
  conjunto: boolean;
  /** Código COMPE (4 dígitos) do banco emissor, para o logo. */
  banco_codigo: string | null;
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
  /** Pessoa que fez o gasto (contas/cartões compartilhados). */
  pessoa_id: string | null;
  /** Dividido igualmente entre todas as pessoas. */
  dividido: boolean;
  data_criacao: string;
}

/** Transação com os joins usados nas listagens. */
export interface TransacaoDetalhada extends Transacao {
  categorias: Pick<Categoria, 'nome' | 'icone'> | null;
  contas: Pick<Conta, 'nome'> | null;
  cartoes_credito: Pick<CartaoCredito, 'nome'> | null;
  pessoas?: Pick<Pessoa, 'nome' | 'cor'> | null;
}

export type NovaTransacao = Omit<Transacao, 'id' | 'data_criacao' | 'fatura_id' | 'pessoa_id' | 'dividido'> & {
  fatura_id?: string | null;
  pessoa_id?: string | null;
  dividido?: boolean;
};

/** Pessoa que divide contas/cartões e investe (ex: Fábio, Ana). */
export interface Pessoa {
  id: string;
  usuario_id: string;
  nome: string;
  cor: string;
  data_criacao: string;
}

export type TipoInvestimento = 'RENDA_FIXA' | 'TESOURO' | 'ACOES' | 'FII' | 'CRIPTO' | 'PREVIDENCIA' | 'OUTRO';

export interface Investimento {
  id: string;
  usuario_id: string;
  /** null = do casal/conjunto */
  pessoa_id: string | null;
  nome: string;
  tipo: TipoInvestimento;
  instituicao: string;
  valor_atual: number;
  data_atualizacao: string;
  data_criacao: string;
}

export interface MovimentacaoInvestimento {
  id: string;
  usuario_id: string;
  investimento_id: string;
  tipo: 'APORTE' | 'RESGATE';
  valor: number;
  data: string;
  conta_id: string | null;
  data_criacao: string;
}

export type TipoBem = 'IMOVEL' | 'VEICULO' | 'TERRENO' | 'EMPRESA' | 'ELETRONICO' | 'OUTRO';

export interface Bem {
  id: string;
  usuario_id: string;
  /** null = do casal/conjunto */
  pessoa_id: string | null;
  nome: string;
  tipo: TipoBem;
  valor_estimado: number;
  /** Ex: saldo de financiamento; o bem entra no patrimônio pelo valor líquido. */
  saldo_devedor: number;
  data_atualizacao: string;
  data_criacao: string;
}

export type TipoRenda = 'SALARIO' | 'PRO_LABORE' | 'FREELANCE' | 'ALUGUEL' | 'BENEFICIO' | 'OUTRO';

export interface Renda {
  id: string;
  usuario_id: string;
  /** null = renda do casal */
  pessoa_id: string | null;
  descricao: string;
  tipo: TipoRenda;
  valor_mensal: number;
  ativa: boolean;
  data_criacao: string;
}

export interface ObjetivoPatrimonio {
  id: string;
  usuario_id: string;
  /** null = do casal/conjunto */
  pessoa_id: string | null;
  nome: string;
  valor_alvo: number;
  data_alvo: string;
  /** PerfilId do simulador usado no cálculo do aporte necessário. */
  perfil: string;
  data_criacao: string;
}

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
  Patrimonio: undefined;
  Configuracoes: undefined;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
