import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BensTab } from '../components/patrimonio/BensTab';
import { InvestimentosTab, type InvestimentoComAportes } from '../components/patrimonio/InvestimentosTab';
import { PlanejamentoTab } from '../components/patrimonio/PlanejamentoTab';
import { SimuladorTab, type PresetSimulador } from '../components/patrimonio/SimuladorTab';
import { PessoasEditor } from '../components/Pessoas';
import { BottomSheet, Card, Chip, ErrorBanner, Loading, ProgressBar, ScreenHeader, SectionTitle } from '../components/ui';
import { carregarPessoas, resumoPorPessoa } from '../services/finance';
import { calcularObjetivo, calcularPatrimonio, calcularPlano, type DadosPatrimonio } from '../services/patrimonio';
import { errorMessage, supabase } from '../services/supabase';
import { colors, spacing } from '../theme';
import type { Bem, Conta, Investimento, ObjetivoPatrimonio, Pessoa, Renda, Transacao } from '../types';
import { addMonths, endOfMonth, formatCurrency, startOfMonth, toISODate, toNumber, today } from '../utils/format';
import { MERCADO_PADRAO, type Mercado, type PerfilId } from '../utils/investCalc';

type Aba = 'geral' | 'planejamento' | 'investimentos' | 'bens' | 'simulador';

const ABAS: { value: Aba; label: string }[] = [
  { value: 'geral', label: 'Visão geral' },
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'investimentos', label: 'Investimentos' },
  { value: 'bens', label: 'Bens' },
  { value: 'simulador', label: 'Simulador' },
];

/** Meses fechados usados na média de gastos. */
const MESES_MEDIA = 3;

export default function PatrimonioScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [aba, setAba] = useState<Aba>('geral');
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [investimentos, setInvestimentos] = useState<InvestimentoComAportes[]>([]);
  const [bens, setBens] = useState<Bem[]>([]);
  const [rendas, setRendas] = useState<Renda[]>([]);
  const [objetivos, setObjetivos] = useState<ObjetivoPatrimonio[]>([]);
  const [gastos, setGastos] = useState<Pick<Transacao, 'tipo' | 'valor' | 'pessoa_id' | 'dividido' | 'data_transacao'>[]>([]);
  const [mercado, setMercado] = useState<Mercado>(MERCADO_PADRAO);
  const [preset, setPreset] = useState<PresetSimulador | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pessoasModal, setPessoasModal] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const hoje = today();
      const inicioMedia = startOfMonth(addMonths(hoje, -MESES_MEDIA));
      const fimMedia = endOfMonth(addMonths(hoje, -1));
      const [pessoasList, contasRes, invRes, movRes, bensRes, rendasRes, objRes, gastosRes] = await Promise.all([
        carregarPessoas(),
        supabase.from('contas').select('*').order('data_criacao'),
        supabase.from('investimentos').select('*').order('data_criacao'),
        supabase.from('movimentacoes_investimento').select('investimento_id, tipo, valor'),
        supabase.from('bens').select('*').order('data_criacao'),
        supabase.from('rendas').select('*').order('data_criacao'),
        supabase.from('objetivos_patrimonio').select('*').order('data_alvo'),
        supabase
          .from('transacoes')
          .select('tipo, valor, pessoa_id, dividido, data_transacao')
          .eq('tipo', 'DESPESA')
          .gte('data_transacao', toISODate(inicioMedia))
          .lte('data_transacao', toISODate(fimMedia)),
      ]);
      for (const r of [contasRes, invRes, movRes, bensRes, rendasRes, objRes, gastosRes]) if (r.error) throw r.error;

      const aportado = new Map<string, number>();
      for (const m of (movRes.data ?? []) as { investimento_id: string; tipo: string; valor: number }[]) {
        const v = toNumber(m.valor) * (m.tipo === 'APORTE' ? 1 : -1);
        aportado.set(m.investimento_id, (aportado.get(m.investimento_id) ?? 0) + v);
      }

      setPessoas(pessoasList);
      setContas(((contasRes.data ?? []) as Conta[]).map((c) => ({ ...c, saldo: toNumber(c.saldo) })));
      setInvestimentos(
        ((invRes.data ?? []) as Investimento[]).map((i) => ({
          ...i,
          valor_atual: toNumber(i.valor_atual),
          aportado: aportado.get(i.id) ?? 0,
        })),
      );
      setBens(
        ((bensRes.data ?? []) as Bem[]).map((b) => ({
          ...b,
          valor_estimado: toNumber(b.valor_estimado),
          saldo_devedor: toNumber(b.saldo_devedor),
        })),
      );
      setRendas(((rendasRes.data ?? []) as Renda[]).map((r) => ({ ...r, valor_mensal: toNumber(r.valor_mensal) })));
      setObjetivos(((objRes.data ?? []) as ObjetivoPatrimonio[]).map((o) => ({ ...o, valor_alvo: toNumber(o.valor_alvo) })));
      setGastos((gastosRes.data ?? []) as typeof gastos);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  const dados: DadosPatrimonio = useMemo(() => ({ pessoas, contas, investimentos, bens }), [pessoas, contas, investimentos, bens]);
  const patrimonio = useMemo(() => calcularPatrimonio(dados), [dados]);
  const statusObjetivos = useMemo(() => objetivos.map((o) => calcularObjetivo(o, dados, mercado)), [objetivos, dados, mercado]);

  // Média mensal de gastos: divide pelos meses que têm lançamentos (até MESES_MEDIA).
  const mediaGastos = useMemo(() => {
    const meses = new Set(gastos.map((g) => g.data_transacao.slice(0, 7))).size;
    const div = Math.max(1, meses);
    const resumo = resumoPorPessoa(gastos, pessoas);
    return {
      meses,
      total: resumo.total / div,
      porPessoa: new Map(resumo.porPessoa.map((p) => [p.pessoa.id, p.total / div])),
    };
  }, [gastos, pessoas]);

  const plano = useMemo(
    () => calcularPlano(pessoas, rendas, statusObjetivos, mediaGastos.total, mediaGastos.porPessoa),
    [pessoas, rendas, statusObjetivos, mediaGastos],
  );

  const irParaSimulador = (p: Omit<PresetSimulador, 'nonce'>) => {
    setPreset({ ...p, nonce: Date.now() });
    setAba('simulador');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const total = patrimonio.total;
  const partes = [
    { label: 'Contas', valor: total.contas, cor: colors.primary, icone: 'wallet-outline' as const },
    { label: 'Investimentos', valor: total.investimentos, cor: colors.gold, icone: 'trending-up-outline' as const },
    { label: 'Bens', valor: total.bens, cor: colors.success, icone: 'home-outline' as const },
  ];
  const maxParte = Math.max(1, ...partes.map((p) => Math.abs(p.valor)));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Patrimônio"
        subtitle="Bens, investimentos e planejamento"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        right={
          <TouchableOpacity style={styles.headerBtn} onPress={() => setPessoasModal(true)} accessibilityLabel="Pessoas">
            <Ionicons name="people-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        }
      />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.abas}>
          {ABAS.map((a) => (
            <Chip key={a.value} label={a.label} selected={aba === a.value} onPress={() => setAba(a.value)} color={colors.gold} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <Loading />
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
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
        >
          {error ? <ErrorBanner message={error} onRetry={load} /> : null}

          {aba === 'geral' ? (
            <View>
              <Card style={{ gap: 4 }}>
                <Text style={styles.label}>Patrimônio líquido total</Text>
                <Text style={styles.big}>{formatCurrency(total.total)}</Text>
                <Text style={styles.muted}>Contas + investimentos + bens − dívidas</Text>
                <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
                  {partes.map((p) => (
                    <View key={p.label} style={{ gap: 4 }}>
                      <View style={styles.rowBetween}>
                        <View style={styles.rowCenter}>
                          <Ionicons name={p.icone} size={16} color={p.cor} />
                          <Text style={styles.parteLabel}>{p.label}</Text>
                        </View>
                        <Text style={styles.parteValor}>{formatCurrency(p.valor)}</Text>
                      </View>
                      <ProgressBar progress={Math.abs(p.valor) / maxParte} color={p.cor} height={6} />
                    </View>
                  ))}
                  {total.dividas > 0 ? (
                    <View style={styles.rowBetween}>
                      <View style={styles.rowCenter}>
                        <Ionicons name="remove-circle-outline" size={16} color={colors.danger} />
                        <Text style={styles.parteLabel}>Dívidas (financiamentos)</Text>
                      </View>
                      <Text style={[styles.parteValor, { color: colors.danger }]}>- {formatCurrency(total.dividas)}</Text>
                    </View>
                  ) : null}
                </View>
              </Card>

              <SectionTitle title="Por pessoa" />
              {pessoas.length === 0 ? (
                <Card style={{ gap: spacing.sm }}>
                  <Text style={styles.muted}>Cadastre as pessoas para separar o patrimônio de cada um.</Text>
                  <Chip label="Cadastrar pessoas" selected onPress={() => setPessoasModal(true)} />
                </Card>
              ) : (
                <>
                  {patrimonio.porPessoa.map((p) => (
                    <Card key={p.pessoa.id} style={styles.pessoaCard}>
                      <View style={styles.rowBetween}>
                        <View style={styles.rowCenter}>
                          <View style={[styles.dot, { backgroundColor: p.pessoa.cor }]} />
                          <Text style={styles.pessoaNome}>{p.pessoa.nome}</Text>
                        </View>
                        <Text style={styles.pessoaTotal}>{formatCurrency(p.total)}</Text>
                      </View>
                      <ProgressBar progress={total.total > 0 ? p.total / total.total : 0} color={p.pessoa.cor} height={6} />
                      <Text style={styles.muted}>
                        Próprio {formatCurrency(p.proprio.total)} (inv. {formatCurrency(p.proprio.investimentos)} • bens{' '}
                        {formatCurrency(p.proprio.bens - p.proprio.dividas)}) + parte do casal {formatCurrency(p.parteCasal.total)}
                      </Text>
                    </Card>
                  ))}
                  <Card style={styles.pessoaCard}>
                    <View style={styles.rowBetween}>
                      <View style={styles.rowCenter}>
                        <Ionicons name="people" size={14} color={colors.primary} />
                        <Text style={styles.pessoaNome}>Do casal</Text>
                      </View>
                      <Text style={styles.pessoaTotal}>{formatCurrency(patrimonio.casal.total)}</Text>
                    </View>
                    <Text style={styles.muted}>
                      Contas {formatCurrency(patrimonio.casal.contas)} • investimentos {formatCurrency(patrimonio.casal.investimentos)} • bens{' '}
                      {formatCurrency(patrimonio.casal.bens - patrimonio.casal.dividas)}. Dividido igualmente no total de cada pessoa.
                    </Text>
                  </Card>
                </>
              )}

              {statusObjetivos.length > 0 ? (
                <>
                  <SectionTitle title="Objetivos" />
                  {statusObjetivos.map((s) => (
                    <TouchableOpacity key={s.objetivo.id} onPress={() => setAba('planejamento')} activeOpacity={0.8}>
                      <Card style={styles.pessoaCard}>
                        <View style={styles.rowBetween}>
                          <Text style={styles.pessoaNome}>{s.objetivo.nome}</Text>
                          <Text style={{ color: s.atingido ? colors.success : colors.gold, fontWeight: '800' }}>
                            {Math.round(s.progresso * 100)}%
                          </Text>
                        </View>
                        <ProgressBar progress={s.progresso} color={s.atingido ? colors.success : colors.gold} />
                        <Text style={styles.muted}>
                          {s.atingido ? 'Atingido!' : `Aporte necessário ${formatCurrency(s.aporteMensal)}/mês`}
                        </Text>
                      </Card>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </View>
          ) : null}

          {aba === 'planejamento' ? (
            <PlanejamentoTab
              pessoas={pessoas}
              rendas={rendas}
              objetivos={statusObjetivos}
              plano={plano}
              mesesGasto={mediaGastos.meses}
              reload={load}
              onSimularObjetivo={(s) =>
                irParaSimulador({
                  perfil: s.perfil,
                  inicial: s.investimentosAtuais,
                  alvo: Math.max(0, s.alvoInvestimentos),
                  meses: s.meses,
                })
              }
            />
          ) : null}

          {aba === 'investimentos' ? (
            <InvestimentosTab
              pessoas={pessoas}
              contas={contas}
              investimentos={investimentos}
              reload={load}
              onSimular={(perfil: PerfilId, inicial: number) => irParaSimulador({ perfil, inicial })}
            />
          ) : null}

          {aba === 'bens' ? <BensTab pessoas={pessoas} bens={bens} reload={load} /> : null}

          {/* Mantido montado para preservar os valores digitados ao trocar de aba */}
          <View style={aba === 'simulador' ? undefined : { display: 'none' }}>
            <SimuladorTab mercado={mercado} onMercado={setMercado} preset={preset} />
          </View>
        </ScrollView>
      )}

      <BottomSheet visible={pessoasModal} title="Pessoas" onClose={() => setPessoasModal(false)}>
        <Text style={[styles.muted, { marginBottom: spacing.md }]}>
          Quem divide as finanças. Valem para contas e cartões compartilhados, investimentos, bens, rendas e objetivos.
        </Text>
        <PessoasEditor pessoas={pessoas} onChange={load} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, paddingTop: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  abas: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  big: { color: colors.text, fontSize: 32, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  parteLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  parteValor: { color: colors.text, fontSize: 14, fontWeight: '700' },
  pessoaCard: { gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pessoaNome: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pessoaTotal: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
