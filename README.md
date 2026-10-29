# Trincash

App mobile de gestão financeira pessoal (React Native + Expo + TypeScript + Supabase).
Toda a gestão de contas, cartões, faturas, lançamentos e orçamentos é manual e nativa — sem Open Finance.

## Configuração

1. **Banco de dados:** no painel do Supabase, abra o *SQL Editor* e execute o conteúdo de `supabase_schema.sql`
   (tabelas, triggers de saldo/fatura, funções `pagar_fatura` e `aportar_meta`, e RLS). O script pode ser executado novamente sem problemas.
2. **Variáveis de ambiente:** `cp .env.example .env` e preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings → API).
3. **Rodar:**
   ```bash
   npm install
   npx expo start
   ```

> Para testar sem confirmação de e-mail, desative *Confirm email* em Authentication → Providers → Email.

## Estrutura

```
App.tsx                      Navegação (Stack + Bottom Tabs) e sessão
supabase_schema.sql          Schema completo do banco
src/components/              UI compartilhada (cards, modais, chips, barras)
src/screens/                 Login, Dashboard, Extrato, Novo lançamento, Cartões, Relatórios & Metas
src/services/supabase.ts     Cliente Supabase com sessão persistida em AsyncStorage
src/services/finance.ts      Gastos por categoria e status de orçamentos
src/types/index.ts           Tipos das entidades e da navegação
src/utils/format.ts          Moeda, datas em pt-BR e ciclo de fatura
```

## Regras de negócio

- `transacoes.valor` é **negativo** para despesas e **positivo** para receitas.
- O saldo das contas é mantido por trigger (somente lançamentos `EFETIVADA` com `conta_id`).
- Compras no cartão são vinculadas automaticamente à fatura do ciclo (compras a partir do dia de fechamento vão para a próxima fatura); o `valor_total` da fatura é recalculado por trigger.
- Transferências, pagamentos de fatura e aportes em metas são registrados como `TRANSFERENCIA`, para não duplicar despesas nos relatórios.
- Lançamentos recorrentes geram 12 ocorrências mensais (as futuras ficam `PENDENTE`); parcelamentos no cartão geram de 2 a 12 parcelas.

## Publicação web (Oracle)

O app web fica em **http://147.15.63.192** (Caddy servindo arquivos estáticos; banco e login no Supabase).

- Publicar uma atualização (no Codespace): `bash deploy/04_publicar.sh ubuntu@147.15.63.192`
- Servidor novo: `deploy/00_limpar_servidor.sh` (limpeza + swap) e depois `deploy/03_preparar_servidor.sh [dominio]`
- O acesso SSH usa a chave `~/.ssh/trincash_oracle` do Codespace (não fica no repositório).
