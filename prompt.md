Atue como um Engenheiro de Software Sênior especialista em React Native (Expo), TypeScript e Supabase (PostgreSQL). Quero que você crie do zero o projeto completo do aplicativo mobile de gestão financeira pessoal chamado **Trincash**.

IMPORTANTE: Este projeto NÃO utiliza integrações com APIs de Open Finance (como Pluggy ou Belvo). Toda a gestão de contas, cartões, faturas, lançamentos e orçamentos deve ser 100% nativa, manual e gerenciada diretamente no Supabase.

---

### 1. STACK TECNOLÓGICO E ESTRUTURA DE PASTAS
- **Framework:** React Native com Expo (TypeScript).
- **Navegação:** `@react-navigation/native`, `@react-navigation/native-stack` e `@react-navigation/bottom-tabs`.
- **Backend & Auth:** `@supabase/supabase-js` com persistência de sessão via `@react-native-async-storage/async-storage`.
- **Ícones e UI:** `@expo/vector-icons` (Ionicons), `react-native-safe-area-context`.
- **Estrutura de diretórios desejada:**
  ```text
  /src
    /components
    /screens
      LoginScreen.tsx
      DashboardScreen.tsx
      ExtratoScreen.tsx
      NewTransactionScreen.tsx
      CartoesScreen.tsx
      RelatoriosMetasScreen.tsx
    /services
      supabase.ts
    /types
      index.ts
  App.tsx
  supabase_schema.sql
  .env.example

2. DESIGN SYSTEM E IDENTIDADE VISUAL (DARK MODE PREMIUM)

O design deve ser moderno, minimalista e em Dark Mode absoluto:

    Fundo Principal (Background): #0A0A0A

    Fundo de Cards / Containers: #141414

    Bordas Sutis e Inputs Secundários: #1E1E1E e #2A2A2A

    Texto Primário: #FFFFFF (tipografia forte, pesos 600 a 800 para saldos e títulos)

    Texto Secundário / Labels: #A0A0A0 e #718096

    Cor de Destaque (Primary Accent): #3182CE (Azul)

    Receitas / Positivo: #38A169 (Verde)

    Despesas / Alertas Críticos: #E53E3E (Vermelho)

    Avisos / Atenção: #DD6B20 (Laranja)

3. BANCO DE DADOS SUPABASE (supabase_schema.sql)

Gere um arquivo supabase_schema.sql completo e pronto para execução no SQL Editor do Supabase, contendo:

    usuarios: id (UUID PK referenciando auth.users), nome, email, data_criacao. (Incluir trigger para criar perfil automaticamente após signup no auth.users e popular categorias padrão).

    categorias: id (UUID PK), usuario_id (UUID FK), nome (VARCHAR), tipo ('DESPESA' | 'RECEITA'), icone (VARCHAR emoji), data_criacao.

    contas: id (UUID PK), usuario_id (UUID FK), nome (VARCHAR), saldo (DECIMAL(12,2) DEFAULT 0), tipo ('CORRENTE' | 'POUPANCA' | 'DINHEIRO'), data_criacao.

    cartoes_credito: id (UUID PK), usuario_id (UUID FK), nome (VARCHAR), bandeira (VARCHAR), ultimos_digitos (VARCHAR(4)), cor_card (VARCHAR), limite_total (DECIMAL(12,2)), dia_fechamento (INTEGER), dia_vencimento (INTEGER), data_criacao.

    faturas_cartao: id (UUID PK), usuario_id (UUID FK), cartao_id (UUID FK), mes_ano_referencia (VARCHAR(7), ex: '10-2026'), valor_total (DECIMAL(12,2) DEFAULT 0), status ('ABERTA' | 'FECHADA' | 'PAGA'), data_fechamento (DATE), data_vencimento (DATE).

    transacoes: id (UUID PK), usuario_id (UUID FK), conta_id (UUID FK NULLABLE), cartao_id (UUID FK NULLABLE), fatura_id (UUID FK NULLABLE), categoria_id (UUID FK), tipo ('DESPESA' | 'RECEITA' | 'TRANSFERENCIA'), valor (DECIMAL(12,2) — negativo para despesas, positivo para receitas), descricao (VARCHAR), data_transacao (DATE), status ('EFETIVADA' | 'PENDENTE'), numero_parcela (INTEGER DEFAULT 1), total_parcelas (INTEGER DEFAULT 1), recorrente (BOOLEAN DEFAULT FALSE), data_criacao.

    orcamentos_categorias: id (UUID PK), usuario_id (UUID FK), categoria_id (UUID FK), limite_mensal (DECIMAL(12,2)), porcentagem_alerta (INTEGER DEFAULT 80), status_alerta_enviado (BOOLEAN DEFAULT FALSE), mes_ano_referencia (VARCHAR(7)), UNIQUE(usuario_id, categoria_id, mes_ano_referencia).

    metas_cofrinhos: id (UUID PK), usuario_id (UUID FK), nome (VARCHAR), valor_alvo (DECIMAL(12,2)), valor_atual (DECIMAL(12,2) DEFAULT 0), icone (VARCHAR), data_criacao.

    Triggers e Funções SQL:

        Trigger em transacoes (AFTER INSERT, UPDATE, DELETE) que atualiza automaticamente o saldo da tabela contas quando conta_id estiver preenchido e status = 'EFETIVADA'.

        Trigger em transacoes que atualiza o valor_total em faturas_cartao quando fatura_id estiver preenchido.

    Row Level Security (RLS): Ativar RLS em todas as tabelas com políticas garantindo que auth.uid() = usuario_id.

4. ESPECIFICAÇÃO DETALHADA DAS TELAS
A. LoginScreen.tsx (Onboarding e Autenticação)

    Carrossel superior de boas-vindas com 3 slides curtos:

        "Organize suas finanças em segundos" (Registre gastos e receitas rapidamente).

        "Acompanhe seus cartões e não perca vencimentos" (Alertas inteligentes e controle de limites).

        "Sua IA e métricas pessoais para entender seus gastos" (Resumos e insights para melhores decisões).

    Formulário de autenticação por E-mail e Senha (Login e Cadastro alternáveis) integrado ao supabase.auth.

    Botões visuais para "Entrar com Apple" e "Entrar com Google".

    Rodapé com aviso de Termos e Política de Privacidade.

B. DashboardScreen.tsx (Tela Inicial)

    Header: Saudação personalizada ("Olá, [Nome]!") e ícone de perfil/logout.

    Card de Saldo Consolidado: Soma do saldo de todas as contas cadastradas, indicador de status ("No verde" se positivo) e botão interno "Ver extrato consolidado →" que navega para ExtratoScreen sem filtro de conta.

    Ações Rápidas: Botões de acesso rápido para registrar Receita, Despesa, Transferência (levando para NewTransactionScreen com o tipo pré-selecionado) e Cartões.

    Seção "Minhas Contas":

        Botão "+ Adicionar" que abre um Modal para criar nova conta (nome, saldo inicial numérico aceitando vírgula/ponto, e abas seletoras para CORRENTE, POUPANCA ou DINHEIRO).

        Lista de contas cadastradas. Regra obrigatória: Cada card de conta deve ser um TouchableOpacity que, ao ser clicado, navega para ExtratoScreen passando { contaId: conta.id, contaNome: conta.nome } via parâmetros de rota.

    Alertas de Orçamento (Módulo Comportamental): Cards de aviso caso alguma categoria no mês atual tenha atingido ou ultrapassado a porcentagem_alerta (ex: 80%) definida em orcamentos_categorias.

    Regra Restrita: NÃO adicione botão flutuante (FAB "+") no Dashboard e NÃO faça chamadas para funções de Open Finance.

C. ExtratoScreen.tsx (Histórico Agrupado por Data)

    Lê os parâmetros opcionais { contaId, contaNome } via useRoute().

    Header dinâmico: Exibe contaNome se filtrado por uma conta específica, ou "Extrato Consolidado" caso contrário, com botão de voltar.

    Consulta no Supabase: Busca as transações do usuário ordenadas por data_transacao decrescente, fazendo join com categorias (nome, icone) e contas (nome). Se contaId existir, filtra com .eq('conta_id', contaId).

    Agrupamento por Data (SectionList):

        Transações da mesma data (YYYY-MM-DD) devem ficar agrupadas na mesma seção sob um único cabeçalho.

        O rótulo do cabeçalho deve exibir "Hoje", "Ontem" ou a data formatada em português (ex: 06 de out. de 2026).

        Cada item exibe o ícone da categoria, descrição, subtexto (Categoria • Nome da Conta) e valor formatado em R$ (vermelho com - para despesas, verde com + para receitas).

D. NewTransactionScreen.tsx (Novo Lançamento Rápido)

    Seletor superior de tipo: Despesa, Receita, Transferência.

    Campo de valor em destaque (R$ 0,00).

    Atalhos Rápidos de Categoria: Grid com as categorias do usuário (ex: Alimentação 🍽️, Transporte 🚌, Moradia 🏠, Lazer 🎮, Saúde 🏥, Compras 🛒) para seleção com 1 toque.

    Campo de descrição leve ("Do que se trata? Ex: Almoço").

    Botão expansível "Mais Detalhes" que revela:

        Seletor de Conta Bancária ou Cartão de Crédito.

        Seletor rápido de Data (Hoje, Ontem, ou digitar data).

        Opções de Repetição / Parcelamento (Não repetir, Repetir mensalmente, ou Parcelar de 2x a 12x caso seja no cartão de crédito, gerando as parcelas correspondentes).

    Botão fixo inferior "Salvar Lançamento".

E. CartoesScreen.tsx (Gestão de Cartões e Faturas)

    Carrossel horizontal ou lista destacada de cartões de crédito com design minimalista, mostrando nome do cartão, últimos 4 dígitos, limite total e barra de progresso do limite disponível.

    Painel de Status da Fatura do cartão selecionado: Valor da fatura atual, data de fechamento, data de vencimento e previsão da próxima fatura.

    Seção "Previsão de Parcelamentos": Resumo dos próximos meses somando compras parceladas.

    Extrato específico do cartão selecionado e botões para "Adicionar Cartão" (via Modal) e "Pagar Fatura".

F. RelatoriosMetasScreen.tsx (Relatórios, Metas e Orçamentos)

    Filtro de Período: Mês atual, Mês anterior, Últimos 3 meses.

    Gastos por Categoria (Ranqueado): Lista ordenada das categorias que mais consumiram dinheiro no período, com barra percentual visual e valor em R$.

    Módulo de Limites e Perfil Comportamental (orcamentos_categorias):

        Permite definir um teto mensal (limite_mensal) para categorias específicas.

        Calcula a velocidade de gasto e exibe alertas visuais preventivos quando o gasto atinge 80% do limite estipulado, sugerindo contenção ou destacando economia (rollover).

    Metas (Cofrinhos):

        Lista de objetivos financeiros (ex: "Reserva de Emergência — R$ 5.000 / R$ 10.000 alcançados") com barra de progresso dourada/azul.

        Modal para criar nova meta e botão "Guardar Dinheiro" para adicionar aportes à meta.

5. INSTRUÇÕES DE EXECUÇÃO PARA O CLAUDE CODE

    Inicialize o projeto Expo com TypeScript na raiz do repositório (ou configure o package.json e instale todas as dependências necessárias).

    Crie o arquivo supabase_schema.sql completo com todas as tabelas, triggers e políticas RLS.

    Crie o arquivo .env.example com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY, e configure o cliente em src/services/supabase.ts.

    Implemente todas as telas solicitadas em src/screens/ garantindo tipagem correta, tratamento de erros, indicadores de carregamento (ActivityIndicator) e atualização automática ao focar na tela (useIsFocused).

    Configure a navegação completa em App.tsx combinando Bottom Tabs (Início, Extrato, Novo +, Cartões, Relatórios & Metas) e Stack Navigation para fluxos internos.

    Verifique se não há erros de compilação TypeScript (npx tsc --noEmit) e me avise quando toda a estrutura estiver pronta.