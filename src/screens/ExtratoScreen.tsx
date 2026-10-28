import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EditarLancamentoSheet } from '../components/EditarLancamentoSheet';
import { GastosPorPessoaCard, PessoasEditor } from '../components/Pessoas';
import { TransactionItem } from '../components/TransactionItem';
import { BottomSheet, Card, Chip, EmptyState, ErrorBanner, Loading, ScreenHeader } from '../components/ui';
import { carregarPessoas, resumoPorPessoa } from '../services/finance';
import { errorMessage, supabase } from '../services/supabase';
import { colors, spacing } from '../theme';
import type { ExtratoParams, Pessoa, TransacaoDetalhada } from '../types';
import { formatCurrency, formatDateLabel, mesAnoReferencia, nomeMes, toISODate, toNumber, today } from '../utils/format';

/** Filtro de pessoa no extrato de conta conjunta: 'todos', 'dividido' ou o id da pessoa. */
type FiltroPessoa = 'todos' | 'dividido' | string;

type ExtratoRoute = RouteProp<{ Extrato: ExtratoParams | undefined }, 'Extrato'>;

interface Secao {
  title: string;
  date: string;
  total: number;
  data: TransacaoDetalhada[];
}

const LIMITE = 500;

export default function ExtratoScreen() {
  const route = useRoute<ExtratoRoute>();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const contaId = route.params?.contaId;
  const contaNome = route.params?.contaNome;

  const [transacoes, setTransacoes] = useState<TransacaoDetalhada[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incluirFuturos, setIncluirFuturos] = useState(false);
  const [conjunta, setConjunta] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [filtroPessoa, setFiltroPessoa] = useState<FiltroPessoa>('todos');
  const [pessoasModal, setPessoasModal] = useState(false);
  const [editando, setEditando] = useState<TransacaoDetalhada | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      let query = supabase
        .from('transacoes')
        .select('*, categorias(nome, icone), contas(nome), cartoes_credito(nome), pessoas(nome, cor)')
        .order('data_transacao', { ascending: false })
        .order('data_criacao', { ascending: false })
        .limit(LIMITE);
      if (contaId) query = query.eq('conta_id', contaId);
      if (!incluirFuturos) query = query.lte('data_transacao', toISODate(today()));

      const [{ data, error: err }, contaRes, pessoasList] = await Promise.all([
        query,
        contaId
          ? supabase.from('contas').select('conjunta').eq('id', contaId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        contaId ? carregarPessoas() : Promise.resolve([] as Pessoa[]),
      ]);
      if (err) throw err;
      if (contaRes.error) throw contaRes.error;
      setConjunta(!!(contaRes.data as { conjunta?: boolean } | null)?.conjunta);
      setPessoas(pessoasList);
      setTransacoes(((data ?? []) as TransacaoDetalhada[]).map((t) => ({ ...t, valor: toNumber(t.valor) })));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contaId, incluirFuturos]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const visiveis = useMemo(() => {
    if (!conjunta || filtroPessoa === 'todos') return transacoes;
    if (filtroPessoa === 'dividido') return transacoes.filter((t) => t.dividido);
    return transacoes.filter((t) => !t.dividido && t.pessoa_id === filtroPessoa);
  }, [transacoes, conjunta, filtroPessoa]);

  // Gastos por pessoa no mês atual (conta conjunta).
  const resumoMes = useMemo(() => {
    const ref = mesAnoReferencia(today());
    const doMes = transacoes.filter((t) => {
      const [y, m] = t.data_transacao.split('-');
      return `${m}-${y}` === ref;
    });
    return resumoPorPessoa(doMes, pessoas);
  }, [transacoes, pessoas]);

  // Agrupa por data (YYYY-MM-DD) preservando a ordem decrescente.
  const sections = useMemo<Secao[]>(() => {
    const map = new Map<string, Secao>();
    for (const t of visiveis) {
      const date = t.data_transacao.slice(0, 10);
      let sec = map.get(date);
      if (!sec) {
        sec = { title: formatDateLabel(date), date, total: 0, data: [] };
        map.set(date, sec);
      }
      sec.data.push(t);
      sec.total += t.valor;
    }
    return [...map.values()];
  }, [visiveis]);

  const resumo = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const t of visiveis) {
      if (t.status !== 'EFETIVADA') continue;
      if (t.valor >= 0) entradas += t.valor;
      else saidas += t.valor;
    }
    return { entradas, saidas };
  }, [visiveis]);

  const excluir = (t: TransacaoDetalhada) => {
    Alert.alert('Excluir lançamento', `Deseja excluir "${t.descricao || 'lançamento'}"? O saldo será recalculado.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('transacoes').delete().eq('id', t.id);
          if (err) Alert.alert('Erro', errorMessage(err));
          else load();
        },
      },
    ]);
  };

  const title = contaNome ?? 'Extrato Consolidado';
  const onBack = navigation.canGoBack() ? () => navigation.goBack() : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={title}
        subtitle={contaId ? (conjunta ? 'Conta conjunta' : 'Extrato da conta') : 'Todas as contas e cartões'}
        onBack={onBack}
      />

      {loading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
          ListHeaderComponent={
            <View>
              {error ? <ErrorBanner message={error} onRetry={load} /> : null}
              {conjunta ? (
                <>
                  <GastosPorPessoaCard
                    resumo={resumoMes}
                    titulo={`Gastos por pessoa • ${nomeMes(today())}`}
                    onGerenciar={() => setPessoasModal(true)}
                  />
                  <View style={[styles.filters, { flexWrap: 'wrap', marginBottom: spacing.md }]}>
                    <Chip label="Todos" selected={filtroPessoa === 'todos'} onPress={() => setFiltroPessoa('todos')} />
                    {pessoas.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.nome}
                        color={p.cor}
                        selected={filtroPessoa === p.id}
                        onPress={() => setFiltroPessoa(p.id)}
                      />
                    ))}
                    <Chip label="Divididos" selected={filtroPessoa === 'dividido'} onPress={() => setFiltroPessoa('dividido')} />
                  </View>
                </>
              ) : null}
              <Card style={styles.summary}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>Entradas</Text>
                  <Text style={[styles.summaryValue, { color: colors.success }]}>{formatCurrency(resumo.entradas)}</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLabel}>Saídas</Text>
                  <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatCurrency(Math.abs(resumo.saidas))}</Text>
                </View>
              </Card>
              <View style={styles.filters}>
                <Chip label="Incluir lançamentos futuros" selected={incluirFuturos} onPress={() => setIncluirFuturos((v) => !v)} />
              </View>
              <Text style={styles.hint}>Toque em um lançamento para editar (ou efetivar) • Segure para excluir</Text>
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={[styles.sectionTotal, { color: section.total < 0 ? colors.danger : colors.success }]}>
                {formatCurrency(section.total, { sign: true })}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TransactionItem
              item={item}
              onPress={() => setEditando(item)}
              onLongPress={() => excluir(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title="Nenhum lançamento"
              message={contaId ? 'Esta conta ainda não tem movimentações.' : 'Registre sua primeira receita ou despesa na aba "Novo".'}
            />
          }
        />
      )}

      <EditarLancamentoSheet transacao={editando} onClose={() => setEditando(null)} onSaved={load} />

      <BottomSheet visible={pessoasModal} title="Pessoas" onClose={() => setPessoasModal(false)}>
        <Text style={styles.hint}>As mesmas pessoas valem para todas as contas e cartões compartilhados e para os investimentos.</Text>
        <View style={{ height: spacing.md }} />
        <PessoasEditor pessoas={pessoas} onChange={load} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  summary: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  summaryLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  summaryValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.lg },
  filters: { flexDirection: 'row', gap: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  sectionTotal: { fontSize: 12, fontWeight: '700' },
});
