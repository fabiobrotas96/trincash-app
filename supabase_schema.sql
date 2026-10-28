-- =====================================================================
-- TRINCASH — Schema completo do banco de dados (Supabase / PostgreSQL)
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- O script é idempotente: pode ser executado mais de uma vez.
--
-- Convenções:
--   * valor em transacoes: NEGATIVO para despesas/saídas, POSITIVO para
--     receitas/entradas.
--   * mes_ano_referencia: formato 'MM-AAAA' (ex: '10-2026').
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

create table if not exists public.usuarios (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          varchar(120) not null default '',
  email         varchar(255) not null default '',
  data_criacao  timestamptz not null default now()
);

create table if not exists public.categorias (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  nome          varchar(60) not null,
  tipo          varchar(10) not null check (tipo in ('DESPESA', 'RECEITA')),
  icone         varchar(16) not null default '📦',
  data_criacao  timestamptz not null default now()
);

create table if not exists public.contas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  nome          varchar(80) not null,
  saldo         decimal(12, 2) not null default 0,
  tipo          varchar(10) not null default 'CORRENTE'
                check (tipo in ('CORRENTE', 'POUPANCA', 'DINHEIRO')),
  data_criacao  timestamptz not null default now()
);

create table if not exists public.cartoes_credito (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.usuarios (id) on delete cascade,
  nome             varchar(80) not null,
  bandeira         varchar(30) not null default 'Visa',
  ultimos_digitos  varchar(4) not null default '0000'
                   check (ultimos_digitos ~ '^[0-9]{4}$'),
  cor_card         varchar(9) not null default '#3182CE',
  limite_total     decimal(12, 2) not null default 0 check (limite_total >= 0),
  dia_fechamento   integer not null check (dia_fechamento between 1 and 31),
  dia_vencimento   integer not null check (dia_vencimento between 1 and 31),
  data_criacao     timestamptz not null default now()
);

create table if not exists public.faturas_cartao (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null references public.usuarios (id) on delete cascade,
  cartao_id           uuid not null references public.cartoes_credito (id) on delete cascade,
  mes_ano_referencia  varchar(7) not null check (mes_ano_referencia ~ '^[0-9]{2}-[0-9]{4}$'),
  valor_total         decimal(12, 2) not null default 0,
  status              varchar(10) not null default 'ABERTA'
                      check (status in ('ABERTA', 'FECHADA', 'PAGA')),
  data_fechamento     date not null,
  data_vencimento     date not null,
  unique (cartao_id, mes_ano_referencia)
);

create table if not exists public.transacoes (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios (id) on delete cascade,
  conta_id        uuid references public.contas (id) on delete cascade,
  cartao_id       uuid references public.cartoes_credito (id) on delete cascade,
  fatura_id       uuid references public.faturas_cartao (id) on delete set null,
  categoria_id    uuid references public.categorias (id) on delete set null,
  tipo            varchar(13) not null check (tipo in ('DESPESA', 'RECEITA', 'TRANSFERENCIA')),
  valor           decimal(12, 2) not null,
  descricao       varchar(200) not null default '',
  data_transacao  date not null default current_date,
  status          varchar(10) not null default 'EFETIVADA'
                  check (status in ('EFETIVADA', 'PENDENTE')),
  numero_parcela  integer not null default 1 check (numero_parcela >= 1),
  total_parcelas  integer not null default 1 check (total_parcelas >= 1),
  recorrente      boolean not null default false,
  data_criacao    timestamptz not null default now(),
  constraint transacoes_origem_chk check (conta_id is not null or cartao_id is not null),
  constraint transacoes_parcela_chk check (numero_parcela <= total_parcelas),
  constraint transacoes_sinal_chk check (
    (tipo = 'DESPESA' and valor <= 0) or
    (tipo = 'RECEITA' and valor >= 0) or
    (tipo = 'TRANSFERENCIA')
  )
);

create table if not exists public.orcamentos_categorias (
  id                     uuid primary key default gen_random_uuid(),
  usuario_id             uuid not null references public.usuarios (id) on delete cascade,
  categoria_id           uuid not null references public.categorias (id) on delete cascade,
  limite_mensal          decimal(12, 2) not null check (limite_mensal > 0),
  porcentagem_alerta     integer not null default 80 check (porcentagem_alerta between 1 and 100),
  status_alerta_enviado  boolean not null default false,
  mes_ano_referencia     varchar(7) not null check (mes_ano_referencia ~ '^[0-9]{2}-[0-9]{4}$'),
  unique (usuario_id, categoria_id, mes_ano_referencia)
);

create table if not exists public.metas_cofrinhos (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  nome          varchar(80) not null,
  valor_alvo    decimal(12, 2) not null check (valor_alvo > 0),
  valor_atual   decimal(12, 2) not null default 0 check (valor_atual >= 0),
  icone         varchar(16) not null default '🎯',
  data_criacao  timestamptz not null default now()
);

-- Contas e cartões compartilhados: o usuário cadastra as pessoas que
-- dividem os gastos e marca cada lançamento como de UMA pessoa
-- (pessoa_id) ou DIVIDIDO entre todas (dividido = true, em partes iguais).
alter table public.contas          add column if not exists conjunta boolean not null default false;
-- Banco da conta / emissor do cartão (código COMPE com 4 dígitos, ex: '0260'),
-- usado para exibir o logo da instituição.
alter table public.contas          add column if not exists banco_codigo varchar(8);
alter table public.cartoes_credito add column if not exists banco_codigo varchar(8);
alter table public.cartoes_credito add column if not exists conjunto boolean not null default false;

create table if not exists public.pessoas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  nome          varchar(60) not null,
  cor           varchar(9) not null default '#3182CE',
  data_criacao  timestamptz not null default now()
);

alter table public.transacoes
  add column if not exists pessoa_id uuid references public.pessoas (id) on delete set null;
alter table public.transacoes
  add column if not exists dividido boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transacoes_divisao_chk') then
    alter table public.transacoes add constraint transacoes_divisao_chk
      check (not (dividido and pessoa_id is not null));
  end if;
end;
$$;

-- Investimentos: cada um pertence a uma pessoa (pessoa_id) ou ao casal
-- (pessoa_id nulo). valor_atual é o saldo de mercado informado pelo
-- usuário; aportes/resgates ficam em movimentacoes_investimento.
create table if not exists public.investimentos (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references public.usuarios (id) on delete cascade,
  pessoa_id         uuid references public.pessoas (id) on delete set null,
  nome              varchar(80) not null,
  tipo              varchar(20) not null default 'RENDA_FIXA'
                    check (tipo in ('RENDA_FIXA', 'TESOURO', 'ACOES', 'FII', 'CRIPTO', 'PREVIDENCIA', 'OUTRO')),
  instituicao       varchar(80) not null default '',
  valor_atual       decimal(14, 2) not null default 0 check (valor_atual >= 0),
  data_atualizacao  date not null default current_date,
  data_criacao      timestamptz not null default now()
);

create table if not exists public.movimentacoes_investimento (
  id               uuid primary key default gen_random_uuid(),
  usuario_id       uuid not null references public.usuarios (id) on delete cascade,
  investimento_id  uuid not null references public.investimentos (id) on delete cascade,
  tipo             varchar(10) not null check (tipo in ('APORTE', 'RESGATE')),
  valor            decimal(14, 2) not null check (valor > 0),
  data             date not null default current_date,
  conta_id         uuid references public.contas (id) on delete set null,
  data_criacao     timestamptz not null default now()
);

-- Bens (imóveis, veículos...) de uma pessoa ou do casal. O valor líquido
-- no patrimônio é valor_estimado - saldo_devedor (ex: financiamento).
create table if not exists public.bens (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references public.usuarios (id) on delete cascade,
  pessoa_id       uuid references public.pessoas (id) on delete set null,
  nome            varchar(80) not null,
  tipo            varchar(20) not null default 'OUTRO'
                  check (tipo in ('IMOVEL', 'VEICULO', 'TERRENO', 'EMPRESA', 'ELETRONICO', 'OUTRO')),
  valor_estimado  decimal(14, 2) not null default 0 check (valor_estimado >= 0),
  saldo_devedor   decimal(14, 2) not null default 0 check (saldo_devedor >= 0),
  data_atualizacao date not null default current_date,
  data_criacao    timestamptz not null default now()
);

-- Rendas mensais recorrentes de cada pessoa (ou do casal, pessoa_id nulo),
-- usadas no planejamento de quanto é possível gastar por mês.
create table if not exists public.rendas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  pessoa_id     uuid references public.pessoas (id) on delete set null,
  descricao     varchar(80) not null,
  tipo          varchar(20) not null default 'SALARIO'
                check (tipo in ('SALARIO', 'PRO_LABORE', 'FREELANCE', 'ALUGUEL', 'BENEFICIO', 'OUTRO')),
  valor_mensal  decimal(14, 2) not null check (valor_mensal > 0),
  ativa         boolean not null default true,
  data_criacao  timestamptz not null default now()
);

-- Objetivo de patrimônio de uma pessoa (ou do casal, pessoa_id nulo).
-- perfil indica o tipo de investimento usado para calcular o aporte necessário.
create table if not exists public.objetivos_patrimonio (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  pessoa_id     uuid references public.pessoas (id) on delete cascade,
  nome          varchar(80) not null,
  valor_alvo    decimal(14, 2) not null check (valor_alvo > 0),
  data_alvo     date not null,
  perfil        varchar(20) not null default 'CDB',
  data_criacao  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. ÍNDICES
-- ---------------------------------------------------------------------

create index if not exists idx_categorias_usuario  on public.categorias (usuario_id);
create index if not exists idx_contas_usuario      on public.contas (usuario_id);
create index if not exists idx_cartoes_usuario     on public.cartoes_credito (usuario_id);
create index if not exists idx_faturas_cartao      on public.faturas_cartao (cartao_id, data_vencimento);
create index if not exists idx_transacoes_usuario_data on public.transacoes (usuario_id, data_transacao desc);
create index if not exists idx_transacoes_conta    on public.transacoes (conta_id);
create index if not exists idx_transacoes_cartao   on public.transacoes (cartao_id);
create index if not exists idx_transacoes_fatura   on public.transacoes (fatura_id);
create index if not exists idx_transacoes_categoria on public.transacoes (categoria_id);
create index if not exists idx_orcamentos_usuario_mes on public.orcamentos_categorias (usuario_id, mes_ano_referencia);
create index if not exists idx_metas_usuario       on public.metas_cofrinhos (usuario_id);
create index if not exists idx_pessoas_usuario     on public.pessoas (usuario_id);
create index if not exists idx_investimentos_usuario on public.investimentos (usuario_id);
create index if not exists idx_mov_investimento    on public.movimentacoes_investimento (investimento_id, data);
create index if not exists idx_objetivos_usuario   on public.objetivos_patrimonio (usuario_id);
create index if not exists idx_bens_usuario        on public.bens (usuario_id);
create index if not exists idx_rendas_usuario      on public.rendas (usuario_id);
create index if not exists idx_transacoes_pessoa   on public.transacoes (pessoa_id);

-- ---------------------------------------------------------------------
-- 3. PERFIL AUTOMÁTICO + CATEGORIAS PADRÃO APÓS SIGNUP
-- ---------------------------------------------------------------------

-- Categorias padrão de um usuário (usada pela trigger e pela correção abaixo).
create or replace function public.fn_criar_categorias_padrao(p_usuario_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categorias (usuario_id, nome, tipo, icone) values
    (p_usuario_id, 'Alimentação',     'DESPESA', '🍽️'),
    (p_usuario_id, 'Transporte',      'DESPESA', '🚌'),
    (p_usuario_id, 'Moradia',         'DESPESA', '🏠'),
    (p_usuario_id, 'Lazer',           'DESPESA', '🎮'),
    (p_usuario_id, 'Saúde',           'DESPESA', '🏥'),
    (p_usuario_id, 'Compras',         'DESPESA', '🛒'),
    (p_usuario_id, 'Educação',        'DESPESA', '📚'),
    (p_usuario_id, 'Assinaturas',     'DESPESA', '📺'),
    (p_usuario_id, 'Outros',          'DESPESA', '📦'),
    (p_usuario_id, 'Salário',         'RECEITA', '💰'),
    (p_usuario_id, 'Freelance',       'RECEITA', '💻'),
    (p_usuario_id, 'Investimentos',   'RECEITA', '📈'),
    (p_usuario_id, 'Outras receitas', 'RECEITA', '💵');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nome', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  if not exists (select 1 from public.categorias where usuario_id = new.id) then
    perform public.fn_criar_categorias_padrao(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. FATURAS: cálculo do ciclo e criação automática
-- ---------------------------------------------------------------------
-- Regra do ciclo: compras feitas ATÉ o dia anterior ao fechamento entram
-- na fatura que fecha naquele mês; compras a partir do dia de fechamento
-- entram na fatura do mês seguinte. Se dia_vencimento > dia_fechamento o
-- vencimento ocorre no mesmo mês do fechamento; caso contrário, no mês
-- seguinte. Dias inexistentes (ex: 31/02) são ajustados para o último dia.

create or replace function public.fn_dia_ajustado(p_mes date, p_dia integer)
returns date
language sql
immutable
as $$
  select make_date(
    extract(year from p_mes)::int,
    extract(month from p_mes)::int,
    least(
      p_dia,
      extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'))::int
    )
  );
$$;

create or replace function public.fn_obter_ou_criar_fatura(p_cartao_id uuid, p_data date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cartao   public.cartoes_credito%rowtype;
  v_mes_ref  date;
  v_fech     date;
  v_venc     date;
  v_mes_ano  varchar(7);
  v_id       uuid;
begin
  select * into v_cartao from public.cartoes_credito where id = p_cartao_id;
  if not found then
    raise exception 'Cartão % não encontrado', p_cartao_id;
  end if;

  -- Quando chamada diretamente via RPC, garante que o cartão é do usuário.
  if auth.uid() is not null and v_cartao.usuario_id <> auth.uid() then
    raise exception 'Acesso negado ao cartão';
  end if;

  v_mes_ref := date_trunc('month', p_data)::date;
  if p_data >= public.fn_dia_ajustado(v_mes_ref, v_cartao.dia_fechamento) then
    v_mes_ref := (v_mes_ref + interval '1 month')::date;
  end if;

  v_fech := public.fn_dia_ajustado(v_mes_ref, v_cartao.dia_fechamento);
  if v_cartao.dia_vencimento > v_cartao.dia_fechamento then
    v_venc := public.fn_dia_ajustado(v_mes_ref, v_cartao.dia_vencimento);
  else
    v_venc := public.fn_dia_ajustado((v_mes_ref + interval '1 month')::date, v_cartao.dia_vencimento);
  end if;
  v_mes_ano := to_char(v_mes_ref, 'MM-YYYY');

  select id into v_id
    from public.faturas_cartao
   where cartao_id = p_cartao_id and mes_ano_referencia = v_mes_ano;

  if v_id is null then
    insert into public.faturas_cartao
      (usuario_id, cartao_id, mes_ano_referencia, valor_total, status, data_fechamento, data_vencimento)
    values
      (v_cartao.usuario_id, p_cartao_id, v_mes_ano, 0, 'ABERTA', v_fech, v_venc)
    on conflict (cartao_id, mes_ano_referencia) do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id
        from public.faturas_cartao
       where cartao_id = p_cartao_id and mes_ano_referencia = v_mes_ano;
    end if;
  end if;

  return v_id;
end;
$$;

-- BEFORE INSERT/UPDATE: vincula automaticamente a transação de cartão à fatura correta.
create or replace function public.fn_vincular_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cartao_id is null then
    new.fatura_id := null;
  elsif tg_op = 'INSERT' and new.fatura_id is null then
    new.fatura_id := public.fn_obter_ou_criar_fatura(new.cartao_id, new.data_transacao);
  elsif tg_op = 'UPDATE' and (
        new.cartao_id is distinct from old.cartao_id
     or new.data_transacao is distinct from old.data_transacao
     or new.fatura_id is null) then
    new.fatura_id := public.fn_obter_ou_criar_fatura(new.cartao_id, new.data_transacao);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transacoes_vincular_fatura on public.transacoes;
create trigger trg_transacoes_vincular_fatura
  before insert or update on public.transacoes
  for each row execute function public.fn_vincular_fatura();

-- ---------------------------------------------------------------------
-- 5. TRIGGER: saldo das contas
-- ---------------------------------------------------------------------
-- Atualiza contas.saldo sempre que uma transação EFETIVADA com conta_id
-- é inserida, alterada ou removida. Em UPDATE, o efeito antigo é
-- revertido e o novo é aplicado (cobre troca de conta, valor e status).

create or replace function public.fn_atualizar_saldo_conta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.conta_id is not null and old.status = 'EFETIVADA' then
      update public.contas set saldo = saldo - old.valor where id = old.conta_id;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.conta_id is not null and new.status = 'EFETIVADA' then
      update public.contas set saldo = saldo + new.valor where id = new.conta_id;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_transacoes_saldo_conta on public.transacoes;
create trigger trg_transacoes_saldo_conta
  after insert or update or delete on public.transacoes
  for each row execute function public.fn_atualizar_saldo_conta();

-- ---------------------------------------------------------------------
-- 6. TRIGGER: valor_total das faturas
-- ---------------------------------------------------------------------
-- valor_total = soma (positiva) dos lançamentos da fatura. Despesas
-- (negativas) aumentam a fatura; estornos (positivos) reduzem.

create or replace function public.fn_recalcular_fatura(p_fatura_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.faturas_cartao f
     set valor_total = coalesce((
           select -sum(t.valor) from public.transacoes t where t.fatura_id = p_fatura_id
         ), 0)
   where f.id = p_fatura_id;
$$;

create or replace function public.fn_atualizar_valor_fatura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.fatura_id is not null then
    perform public.fn_recalcular_fatura(old.fatura_id);
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.fatura_id is not null
     and (tg_op = 'INSERT' or new.fatura_id is distinct from old.fatura_id
          or new.valor is distinct from old.valor) then
    perform public.fn_recalcular_fatura(new.fatura_id);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_transacoes_valor_fatura on public.transacoes;
create trigger trg_transacoes_valor_fatura
  after insert or update or delete on public.transacoes
  for each row execute function public.fn_atualizar_valor_fatura();

-- ---------------------------------------------------------------------
-- 7. FUNÇÕES RPC chamadas pelo app (security invoker => RLS se aplica)
-- ---------------------------------------------------------------------

-- Paga uma fatura debitando o valor de uma conta. O pagamento é registrado
-- como TRANSFERENCIA para não duplicar as despesas nos relatórios (as
-- compras já foram contabilizadas individualmente no cartão).
create or replace function public.pagar_fatura(p_fatura_id uuid, p_conta_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_fatura public.faturas_cartao%rowtype;
  v_cartao_nome text;
begin
  select * into v_fatura from public.faturas_cartao
   where id = p_fatura_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Fatura não encontrada';
  end if;
  if v_fatura.status = 'PAGA' then
    raise exception 'Esta fatura já foi paga';
  end if;
  if not exists (select 1 from public.contas where id = p_conta_id and usuario_id = auth.uid()) then
    raise exception 'Conta não encontrada';
  end if;

  select nome into v_cartao_nome from public.cartoes_credito where id = v_fatura.cartao_id;

  if v_fatura.valor_total > 0 then
    insert into public.transacoes
      (usuario_id, conta_id, tipo, valor, descricao, data_transacao, status)
    values
      (auth.uid(), p_conta_id, 'TRANSFERENCIA', -v_fatura.valor_total,
       'Pagamento fatura ' || coalesce(v_cartao_nome, 'cartão') || ' ' || v_fatura.mes_ano_referencia,
       current_date, 'EFETIVADA');
  end if;

  update public.faturas_cartao set status = 'PAGA' where id = p_fatura_id;
end;
$$;

-- Adiciona um aporte a uma meta. Se p_conta_id for informado, o valor
-- também sai da conta (registrado como TRANSFERENCIA).
create or replace function public.aportar_meta(p_meta_id uuid, p_valor numeric, p_conta_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nome text;
begin
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor do aporte deve ser positivo';
  end if;

  update public.metas_cofrinhos
     set valor_atual = valor_atual + p_valor
   where id = p_meta_id and usuario_id = auth.uid()
  returning nome into v_nome;

  if v_nome is null then
    raise exception 'Meta não encontrada';
  end if;

  if p_conta_id is not null then
    insert into public.transacoes
      (usuario_id, conta_id, tipo, valor, descricao, data_transacao, status)
    values
      (auth.uid(), p_conta_id, 'TRANSFERENCIA', -p_valor, 'Aporte na meta ' || v_nome,
       current_date, 'EFETIVADA');
  end if;
end;
$$;

-- Aporte ou resgate em um investimento. Atualiza valor_atual e, se
-- p_conta_id for informado, registra a saída/entrada na conta como
-- TRANSFERENCIA (atribuída à pessoa do investimento quando a conta é conjunta).
create or replace function public.movimentar_investimento(
  p_investimento_id uuid, p_tipo text, p_valor numeric, p_conta_id uuid default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.investimentos%rowtype;
  v_conjunta boolean;
begin
  if p_tipo not in ('APORTE', 'RESGATE') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'O valor deve ser positivo';
  end if;

  select * into v_inv from public.investimentos
   where id = p_investimento_id and usuario_id = auth.uid();
  if not found then
    raise exception 'Investimento não encontrado';
  end if;
  if p_tipo = 'RESGATE' and p_valor > v_inv.valor_atual then
    raise exception 'Resgate maior que o saldo do investimento';
  end if;

  insert into public.movimentacoes_investimento (usuario_id, investimento_id, tipo, valor, conta_id)
  values (auth.uid(), p_investimento_id, p_tipo, p_valor, p_conta_id);

  update public.investimentos
     set valor_atual = valor_atual + case when p_tipo = 'APORTE' then p_valor else -p_valor end,
         data_atualizacao = current_date
   where id = p_investimento_id;

  if p_conta_id is not null then
    select conjunta into v_conjunta from public.contas where id = p_conta_id and usuario_id = auth.uid();
    if v_conjunta is null then
      raise exception 'Conta não encontrada';
    end if;
    insert into public.transacoes
      (usuario_id, conta_id, pessoa_id, dividido, tipo, valor, descricao, data_transacao, status)
    values
      (auth.uid(), p_conta_id,
       case when v_conjunta then v_inv.pessoa_id end,
       v_conjunta and v_inv.pessoa_id is null,
       'TRANSFERENCIA',
       case when p_tipo = 'APORTE' then -p_valor else p_valor end,
       case when p_tipo = 'APORTE' then 'Aporte em ' else 'Resgate de ' end || v_inv.nome,
       current_date, 'EFETIVADA');
  end if;
end;
$$;

-- Exclui a conta do usuário logado (e, em cascata, todos os dados dele).
-- security definer: auth.users só pode ser alterada pelo dono do banco, mas
-- a função só apaga a linha de auth.uid(), nunca a de outro usuário.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.usuarios              enable row level security;
alter table public.categorias            enable row level security;
alter table public.contas                enable row level security;
alter table public.cartoes_credito       enable row level security;
alter table public.faturas_cartao        enable row level security;
alter table public.transacoes            enable row level security;
alter table public.orcamentos_categorias enable row level security;
alter table public.metas_cofrinhos       enable row level security;
alter table public.pessoas               enable row level security;
alter table public.investimentos         enable row level security;
alter table public.movimentacoes_investimento enable row level security;
alter table public.objetivos_patrimonio  enable row level security;
alter table public.bens                  enable row level security;
alter table public.rendas                enable row level security;

-- usuarios (a PK é o próprio auth.uid())
drop policy if exists "usuarios_select_own" on public.usuarios;
drop policy if exists "usuarios_update_own" on public.usuarios;
drop policy if exists "usuarios_insert_own" on public.usuarios;
create policy "usuarios_select_own" on public.usuarios
  for select using (auth.uid() = id);
create policy "usuarios_insert_own" on public.usuarios
  for insert with check (auth.uid() = id);
create policy "usuarios_update_own" on public.usuarios
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Política padrão "dono da linha" para as tabelas com usuario_id
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'contas', 'cartoes_credito', 'faturas_cartao',
    'orcamentos_categorias', 'metas_cofrinhos', 'pessoas'
  ] loop
    execute format('drop policy if exists "%1$s_owner_all" on public.%1$I', t);
    execute format(
      'create policy "%1$s_owner_all" on public.%1$I for all
         using (auth.uid() = usuario_id)
         with check (auth.uid() = usuario_id)', t);
  end loop;
end;
$$;

-- transacoes: além do dono, garante que conta/cartão/categoria referenciados
-- também pertencem ao usuário.
drop policy if exists "investimentos_owner_all" on public.investimentos;
create policy "investimentos_owner_all" on public.investimentos
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and (pessoa_id is null or exists (
          select 1 from public.pessoas p where p.id = pessoa_id and p.usuario_id = auth.uid()))
  );

drop policy if exists "mov_investimento_owner_all" on public.movimentacoes_investimento;
create policy "mov_investimento_owner_all" on public.movimentacoes_investimento
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and exists (select 1 from public.investimentos i where i.id = investimento_id and i.usuario_id = auth.uid())
    and (conta_id is null or exists (
          select 1 from public.contas c where c.id = conta_id and c.usuario_id = auth.uid()))
  );

drop policy if exists "rendas_owner_all" on public.rendas;
create policy "rendas_owner_all" on public.rendas
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and (pessoa_id is null or exists (
          select 1 from public.pessoas p where p.id = pessoa_id and p.usuario_id = auth.uid()))
  );

drop policy if exists "bens_owner_all" on public.bens;
create policy "bens_owner_all" on public.bens
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and (pessoa_id is null or exists (
          select 1 from public.pessoas p where p.id = pessoa_id and p.usuario_id = auth.uid()))
  );

drop policy if exists "objetivos_owner_all" on public.objetivos_patrimonio;
create policy "objetivos_owner_all" on public.objetivos_patrimonio
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and (pessoa_id is null or exists (
          select 1 from public.pessoas p where p.id = pessoa_id and p.usuario_id = auth.uid()))
  );

drop policy if exists "transacoes_owner_all" on public.transacoes;
create policy "transacoes_owner_all" on public.transacoes
  for all
  using (auth.uid() = usuario_id)
  with check (
    auth.uid() = usuario_id
    and (conta_id is null or exists (
          select 1 from public.contas c where c.id = conta_id and c.usuario_id = auth.uid()))
    and (cartao_id is null or exists (
          select 1 from public.cartoes_credito k where k.id = cartao_id and k.usuario_id = auth.uid()))
    and (categoria_id is null or exists (
          select 1 from public.categorias g where g.id = categoria_id and g.usuario_id = auth.uid()))
    and (pessoa_id is null or exists (
          select 1 from public.pessoas p where p.id = pessoa_id and p.usuario_id = auth.uid()))
  );

-- ---------------------------------------------------------------------
-- 9. PERMISSÕES DAS FUNÇÕES
-- ---------------------------------------------------------------------

revoke execute on function public.fn_recalcular_fatura(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.fn_criar_categorias_padrao(uuid) from public, anon, authenticated;
grant execute on function public.fn_obter_ou_criar_fatura(uuid, date) to authenticated;
grant execute on function public.pagar_fatura(uuid, uuid) to authenticated;
grant execute on function public.aportar_meta(uuid, numeric, uuid) to authenticated;
grant execute on function public.movimentar_investimento(uuid, text, numeric, uuid) to authenticated;
revoke execute on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;

-- ---------------------------------------------------------------------
-- 10. CORREÇÃO DE CONTAS EXISTENTES
-- ---------------------------------------------------------------------
-- A trigger só roda em cadastros novos. Usuários criados no Auth antes
-- deste script ganham aqui o perfil e as categorias padrão que faltam
-- (sem perfil, qualquer insert em contas falha com contas_usuario_id_fkey).

insert into public.usuarios (id, nome, email)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'nome', ''),
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  coalesce(u.email, '')
from auth.users u
where not exists (select 1 from public.usuarios p where p.id = u.id);

select public.fn_criar_categorias_padrao(p.id)
from public.usuarios p
where not exists (select 1 from public.categorias c where c.usuario_id = p.id);

-- Fim do schema Trincash
