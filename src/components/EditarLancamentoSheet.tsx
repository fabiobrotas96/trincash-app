import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { carregarPessoas } from '../services/finance';
import { errorMessage, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import type { CartaoCredito, Categoria, Conta, Pessoa, StatusTransacao, TransacaoDetalhada } from '../types';
import { Alert } from '../utils/alert';
import { maskDateBR, parseDateBR, parseISODate, parseValor, toISODate, toNumber } from '../utils/format';
import { QuemSelector, type Quem } from './Pessoas';
import { BottomSheet, Chip, Input, Loading, PrimaryButton } from './ui';

type Origem = { kind: 'conta' | 'cartao'; id: string };

const TIPO_LABEL = { DESPESA: 'Despesa', RECEITA: 'Receita', TRANSFERENCIA: 'Transferência' } as const;
const TIPO_COR = { DESPESA: colors.danger, RECEITA: colors.success, TRANSFERENCIA: colors.primary } as const;

const isoParaBR = (iso: string) => {
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * Edição de um lançamento existente. Triggers do banco recalculam saldo das
 * contas e valor das faturas, e revinculam a fatura se o cartão ou a data mudar.
 */
export function EditarLancamentoSheet({
  transacao,
  onClose,
  onSaved,
}: {
  transacao: TransacaoDetalhada | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem | null>(null);
  const [data, setData] = useState('');
  const [status, setStatus] = useState<StatusTransacao>('EFETIVADA');
  const [quem, setQuem] = useState<Quem>({ pessoaId: null, dividido: false });

  // Preenche o formulário e carrega opções sempre que abrir com um lançamento.
  useEffect(() => {
    if (!transacao) return;
    const t = transacao;
    setValor(String(Math.abs(toNumber(t.valor))).replace('.', ','));
    setDescricao(t.descricao ?? '');
    setCategoriaId(t.categoria_id);
    setOrigem(t.cartao_id ? { kind: 'cartao', id: t.cartao_id } : t.conta_id ? { kind: 'conta', id: t.conta_id } : null);
    setData(isoParaBR(t.data_transacao));
    setStatus(t.status);
    setQuem({ pessoaId: t.pessoa_id, dividido: t.dividido });

    let ativo = true;
    setLoading(true);
    Promise.all([
      supabase.from('categorias').select('*').order('nome'),
      supabase.from('contas').select('*').order('data_criacao'),
      supabase.from('cartoes_credito').select('*').order('data_criacao'),
      carregarPessoas(),
    ])
      .then(([cat, ct, k, ps]) => {
        if (!ativo) return;
        if (cat.error || ct.error || k.error) throw cat.error ?? ct.error ?? k.error;
        setCategorias((cat.data ?? []) as Categoria[]);
        setContas((ct.data ?? []) as Conta[]);
        setCartoes((k.data ?? []) as CartaoCredito[]);
        setPessoas(ps);
      })
      .catch((err) => Alert.alert('Erro', errorMessage(err)))
      .finally(() => ativo && setLoading(false));
    return () => {
      ativo = false;
    };
  }, [transacao?.id]);

  const tipo = transacao?.tipo ?? 'DESPESA';
  const transferencia = tipo === 'TRANSFERENCIA';
  const categoriasDoTipo = useMemo(() => categorias.filter((c) => c.tipo === tipo), [categorias, tipo]);
  const compartilhada =
    !transferencia &&
    !!origem &&
    (origem.kind === 'conta'
      ? !!contas.find((c) => c.id === origem.id)?.conjunta
      : !!cartoes.find((c) => c.id === origem.id)?.conjunto);

  const salvar = async () => {
    if (!transacao) return;
    const v = parseValor(valor);
    const d = parseDateBR(data);
    if (Number.isNaN(v) || v <= 0) return Alert.alert('Atenção', 'Informe um valor maior que zero.');
    if (!d) return Alert.alert('Atenção', 'Data inválida. Use DD/MM/AAAA.');
    if (!transferencia && !categoriaId) return Alert.alert('Atenção', 'Escolha uma categoria.');
    if (!origem) return Alert.alert('Atenção', 'Escolha a conta ou o cartão.');
    if (compartilhada && pessoas.length > 0 && !quem.pessoaId && !quem.dividido) {
      return Alert.alert('Atenção', 'Indique quem fez este lançamento ou marque como Dividido.');
    }

    // Sinal: despesa negativa, receita positiva; transferência mantém o lado (saída/entrada).
    const sinal = tipo === 'DESPESA' ? -1 : tipo === 'RECEITA' ? 1 : Math.sign(toNumber(transacao.valor)) || -1;
    const noCartao = origem.kind === 'cartao';
    const campos = {
      valor: sinal * v,
      descricao: descricao.trim(),
      categoria_id: transferencia ? null : categoriaId,
      data_transacao: toISODate(d),
      conta_id: noCartao ? null : origem.id,
      cartao_id: noCartao ? origem.id : null,
      // Compras no cartão são sempre efetivadas; a fatura é que fica em aberto.
      status: noCartao ? ('EFETIVADA' as const) : status,
      pessoa_id: !transferencia && !quem.dividido ? quem.pessoaId : null,
      dividido: !transferencia && quem.dividido,
    };

    setSaving(true);
    try {
      const { error } = await supabase.from('transacoes').update(campos).eq('id', transacao.id);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (err) {
      Alert.alert('Erro ao salvar', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluir = () => {
    if (!transacao) return;
    Alert.alert('Excluir lançamento', `Excluir "${transacao.descricao || 'lançamento'}"? Saldos e faturas serão recalculados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('transacoes').delete().eq('id', transacao.id);
          if (error) return Alert.alert('Erro', errorMessage(error));
          onSaved();
          onClose();
        },
      },
    ]);
  };

  return (
    <BottomSheet visible={!!transacao} title="Editar lançamento" onClose={onClose}>
      {!transacao || loading ? (
        <View style={{ height: 160 }}>
          <Loading />
        </View>
      ) : (
        <>
          <View style={styles.topRow}>
            <View style={[styles.badge, { backgroundColor: `${TIPO_COR[tipo]}22` }]}>
              <Text style={{ color: TIPO_COR[tipo], fontWeight: '800', fontSize: 12 }}>{TIPO_LABEL[tipo]}</Text>
            </View>
            {transacao.total_parcelas > 1 ? (
              <Text style={styles.muted}>
                Parcela {transacao.numero_parcela}/{transacao.total_parcelas} — só esta parcela será alterada
              </Text>
            ) : transacao.recorrente ? (
              <Text style={styles.muted}>Lançamento recorrente — só esta ocorrência será alterada</Text>
            ) : null}
          </View>

          <Input
            label="Valor (R$)"
            value={valor}
            onChangeText={(t) => setValor(t.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
          />
          <Input label="Descrição" value={descricao} onChangeText={setDescricao} maxLength={200} placeholder="Do que se trata?" />

          {!transferencia ? (
            <>
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.chips}>
                {categoriasDoTipo.map((c) => (
                  <Chip
                    key={c.id}
                    label={`${c.icone} ${c.nome}`}
                    selected={categoriaId === c.id}
                    onPress={() => setCategoriaId(c.id)}
                    color={TIPO_COR[tipo]}
                  />
                ))}
              </View>

              <Text style={styles.label}>Conta ou cartão</Text>
              <View style={styles.chips}>
                {contas.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.nome}
                    selected={origem?.kind === 'conta' && origem.id === c.id}
                    onPress={() => setOrigem({ kind: 'conta', id: c.id })}
                  />
                ))}
                {tipo === 'DESPESA'
                  ? cartoes.map((k) => (
                      <Chip
                        key={k.id}
                        label={`💳 ${k.nome}`}
                        color={colors.warning}
                        selected={origem?.kind === 'cartao' && origem.id === k.id}
                        onPress={() => setOrigem({ kind: 'cartao', id: k.id })}
                      />
                    ))
                  : null}
              </View>

              {compartilhada || pessoas.length > 0 ? (
                <>
                  <Text style={styles.label}>{tipo === 'RECEITA' ? 'Quem recebeu?' : 'Quem gastou?'}</Text>
                  {pessoas.length ? (
                    <QuemSelector pessoas={pessoas} value={quem} onChange={setQuem} />
                  ) : (
                    <Text style={[styles.muted, { marginBottom: spacing.md }]}>Nenhuma pessoa cadastrada.</Text>
                  )}
                </>
              ) : null}
            </>
          ) : (
            <Text style={[styles.muted, { marginBottom: spacing.md }]}>
              Transferências são dois lançamentos (saída e entrada). Esta edição altera só este lado
              {transacao.contas?.nome ? ` (${transacao.contas.nome})` : ''}; ajuste o outro lado também se mudar o valor.
            </Text>
          )}

          <Input
            label="Data"
            value={data}
            onChangeText={(t) => setData(maskDateBR(t))}
            keyboardType="number-pad"
            maxLength={10}
            placeholder="DD/MM/AAAA"
          />

          {origem?.kind === 'conta' ? (
            <>
              <Text style={styles.label}>Status</Text>
              <View style={styles.chips}>
                <Chip label="Efetivada" selected={status === 'EFETIVADA'} onPress={() => setStatus('EFETIVADA')} color={colors.success} />
                <Chip label="Pendente" selected={status === 'PENDENTE'} onPress={() => setStatus('PENDENTE')} color={colors.warning} />
              </View>
              <Text style={[styles.muted, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>
                Só lançamentos efetivados alteram o saldo da conta.
              </Text>
            </>
          ) : null}

          <PrimaryButton title="Salvar alterações" onPress={salvar} loading={saving} style={{ marginTop: spacing.sm }} />
          <TouchableOpacity onPress={excluir} style={styles.excluir}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir lançamento</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  excluir: { alignSelf: 'center', padding: spacing.md },
});
