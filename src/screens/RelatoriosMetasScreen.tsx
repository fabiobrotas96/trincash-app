import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheet,
  Card,
  Chip,
  EmptyState,
  ErrorBanner,
  Input,
  LinkButton,
  Loading,
  PrimaryButton,
  ProgressBar,
  ScreenHeader,
  SectionTitle,
  SegmentedControl,
} from '../components/ui';
import { carregarStatusOrcamentos, gastosPorCategoria, type GastoCategoria, type StatusOrcamento } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { META_ICONES, colors, radius, spacing } from '../theme';
import type { Categoria, Conta, MetaCofrinho, OrcamentoCategoria } from '../types';
import {
  addMonths,
  endOfMonth,
  formatCurrency,
  mesAnoReferencia,
  nomeMes,
  parseValor,
  startOfMonth,
  toNumber,
  today,
} from '../utils/format';

type Periodo = 'atual' | 'anterior' | 'tres';

function intervalo(p: Periodo): { inicio: Date; fim: Date; label: string } {
  const hoje = today();
  if (p === 'atual') return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje), label: nomeMes(hoje) };
  if (p === 'anterior') {
    const ant = addMonths(startOfMonth(hoje), -1);
    return { inicio: ant, fim: endOfMonth(ant), label: nomeMes(ant) };
  }
  const ini = addMonths(startOfMonth(hoje), -2);
  return { inicio: ini, fim: endOfMonth(hoje), label: `${nomeMes(ini)} – ${nomeMes(hoje)}` };
}

const RANK_COLORS = [colors.danger, colors.warning, colors.gold, colors.primary, colors.success];
const ALERTA_OPCOES = [50, 70, 80, 90];

export default function RelatoriosMetasScreen() {
  const isFocused = useIsFocused();

  const [periodo, setPeriodo] = useState<Periodo>('atual');
  const [gastos, setGastos] = useState<GastoCategoria[]>([]);
  const [orcamentos, setOrcamentos] = useState<StatusOrcamento[]>([]);
  const [rollover, setRollover] = useState<{ economia: number; excesso: number; limitesAnteriores: OrcamentoCategoria[] }>({
    economia: 0,
    excesso: 0,
    limitesAnteriores: [],
  });
  const [metas, setMetas] = useState<MetaCofrinho[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGastos, setLoadingGastos] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modais
  const [orcModal, setOrcModal] = useState(false);
  const [orcCategoria, setOrcCategoria] = useState<string | null>(null);
  const [orcLimite, setOrcLimite] = useState('');
  const [orcAlerta, setOrcAlerta] = useState(80);
  const [metaModal, setMetaModal] = useState(false);
  const [metaNome, setMetaNome] = useState('');
  const [metaAlvo, setMetaAlvo] = useState('');
  const [metaIcone, setMetaIcone] = useState(META_ICONES[0]);
  const [aporteMeta, setAporteMeta] = useState<MetaCofrinho | null>(null);
  const [aporteValor, setAporteValor] = useState('');
  const [aporteConta, setAporteConta] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => intervalo(periodo), [periodo]);

  const loadGastos = useCallback(async () => {
    setLoadingGastos(true);
    try {
      setGastos(await gastosPorCategoria(range.inicio, range.fim));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingGastos(false);
    }
  }, [range]);

  const loadResto = useCallback(async () => {
    setError(null);
    try {
      const mesAnterior = addMonths(startOfMonth(today()), -1);
      const [statusAtual, metasRes, catRes, contasRes, orcAntRes, gastosAnt] = await Promise.all([
        carregarStatusOrcamentos(),
        supabase.from('metas_cofrinhos').select('*').order('data_criacao'),
        supabase.from('categorias').select('*').eq('tipo', 'DESPESA').order('nome'),
        supabase.from('contas').select('*').order('data_criacao'),
        supabase.from('orcamentos_categorias').select('*').eq('mes_ano_referencia', mesAnoReferencia(mesAnterior)),
        gastosPorCategoria(mesAnterior, endOfMonth(mesAnterior)),
      ]);
      if (metasRes.error) throw metasRes.error;
      if (catRes.error) throw catRes.error;
      if (contasRes.error) throw contasRes.error;
      if (orcAntRes.error) throw orcAntRes.error;

      setOrcamentos(statusAtual);
      setMetas(
        ((metasRes.data ?? []) as MetaCofrinho[]).map((m) => ({
          ...m,
          valor_alvo: toNumber(m.valor_alvo),
          valor_atual: toNumber(m.valor_atual),
        })),
      );
      setCategorias((catRes.data ?? []) as Categoria[]);
      setContas(((contasRes.data ?? []) as Conta[]).map((c) => ({ ...c, saldo: toNumber(c.saldo) })));

      // Rollover: quanto sobrou (ou estourou) nos limites do mês anterior.
      const anteriores = (orcAntRes.data ?? []) as OrcamentoCategoria[];
      let economia = 0;
      let excesso = 0;
      for (const o of anteriores) {
        const gasto = gastosAnt.find((g) => g.categoriaId === o.categoria_id)?.total ?? 0;
        const diff = toNumber(o.limite_mensal) - gasto;
        if (diff >= 0) economia += diff;
        else excesso += -diff;
      }
      setRollover({ economia, excesso, limitesAnteriores: anteriores });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) loadResto();
  }, [isFocused, loadResto]);

  useEffect(() => {
    if (isFocused) loadGastos();
  }, [isFocused, loadGastos]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadResto(), loadGastos()]);
  };

  const totalGastos = gastos.reduce((a, g) => a + g.total, 0);

  // ---------------- Orçamentos ----------------

  const abrirOrcamento = (s?: StatusOrcamento) => {
    setOrcCategoria(s?.orcamento.categoria_id ?? null);
    setOrcLimite(s ? String(s.orcamento.limite_mensal).replace('.', ',') : '');
    setOrcAlerta(s?.orcamento.porcentagem_alerta ?? 80);
    setOrcModal(true);
  };

  const salvarOrcamento = async () => {
    const limite = parseValor(orcLimite);
    if (!orcCategoria) return Alert.alert('Atenção', 'Escolha uma categoria.');
    if (Number.isNaN(limite) || limite <= 0) return Alert.alert('Atenção', 'Informe um limite mensal válido.');
    setSaving(true);
    try {
      const usuario_id = await getUserId();
      const { error: err } = await supabase.from('orcamentos_categorias').upsert(
        {
          usuario_id,
          categoria_id: orcCategoria,
          limite_mensal: limite,
          porcentagem_alerta: orcAlerta,
          status_alerta_enviado: false,
          mes_ano_referencia: mesAnoReferencia(today()),
        },
        { onConflict: 'usuario_id,categoria_id,mes_ano_referencia' },
      );
      if (err) throw err;
      setOrcModal(false);
      await loadResto();
    } catch (err) {
      Alert.alert('Erro ao salvar limite', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removerOrcamento = (s: StatusOrcamento) => {
    Alert.alert('Remover limite', `Remover o limite de ${s.categoria.nome} deste mês?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('orcamentos_categorias').delete().eq('id', s.orcamento.id);
          if (err) Alert.alert('Erro', errorMessage(err));
          else loadResto();
        },
      },
    ]);
  };

  const copiarLimitesAnteriores = async () => {
    setSaving(true);
    try {
      const usuario_id = await getUserId();
      const ref = mesAnoReferencia(today());
      const rows = rollover.limitesAnteriores.map((o) => ({
        usuario_id,
        categoria_id: o.categoria_id,
        limite_mensal: toNumber(o.limite_mensal),
        porcentagem_alerta: o.porcentagem_alerta,
        status_alerta_enviado: false,
        mes_ano_referencia: ref,
      }));
      const { error: err } = await supabase
        .from('orcamentos_categorias')
        .upsert(rows, { onConflict: 'usuario_id,categoria_id,mes_ano_referencia', ignoreDuplicates: true });
      if (err) throw err;
      await loadResto();
    } catch (err) {
      Alert.alert('Erro', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ---------------- Metas ----------------

  const abrirNovaMeta = () => {
    setMetaNome('');
    setMetaAlvo('');
    setMetaIcone(META_ICONES[0]);
    setMetaModal(true);
  };

  const salvarMeta = async () => {
    const alvo = parseValor(metaAlvo);
    if (!metaNome.trim()) return Alert.alert('Atenção', 'Dê um nome para sua meta.');
    if (Number.isNaN(alvo) || alvo <= 0) return Alert.alert('Atenção', 'Informe o valor alvo.');
    setSaving(true);
    try {
      const usuario_id = await getUserId();
      const { error: err } = await supabase
        .from('metas_cofrinhos')
        .insert({ usuario_id, nome: metaNome.trim(), valor_alvo: alvo, icone: metaIcone });
      if (err) throw err;
      setMetaModal(false);
      await loadResto();
    } catch (err) {
      Alert.alert('Erro ao criar meta', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const abrirAporte = (m: MetaCofrinho) => {
    setAporteMeta(m);
    setAporteValor('');
    setAporteConta(null);
  };

  const guardarDinheiro = async () => {
    if (!aporteMeta) return;
    const valor = parseValor(aporteValor);
    if (Number.isNaN(valor) || valor <= 0) return Alert.alert('Atenção', 'Informe um valor válido.');
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('aportar_meta', {
        p_meta_id: aporteMeta.id,
        p_valor: valor,
        p_conta_id: aporteConta,
      });
      if (err) throw err;
      setAporteMeta(null);
      await loadResto();
    } catch (err) {
      Alert.alert('Erro ao guardar dinheiro', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluirMeta = (m: MetaCofrinho) => {
    Alert.alert('Excluir meta', `Excluir "${m.nome}"? Os aportes já debitados das contas não serão estornados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.from('metas_cofrinhos').delete().eq('id', m.id);
          if (err) Alert.alert('Erro', errorMessage(err));
          else loadResto();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const categoriasSemLimite = categorias.filter(
    (c) => c.id === orcCategoria || !orcamentos.some((o) => o.orcamento.categoria_id === c.id),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Relatórios & Metas" subtitle="Entenda para onde vai seu dinheiro" />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={refreshAll} />}
      >
        {error ? <ErrorBanner message={error} onRetry={refreshAll} /> : null}

        {/* Filtro de período */}
        <SegmentedControl
          options={[
            { label: 'Mês atual', value: 'atual' },
            { label: 'Mês anterior', value: 'anterior' },
            { label: 'Últimos 3 meses', value: 'tres' },
          ]}
          value={periodo}
          onChange={setPeriodo}
        />

        {/* Gastos por categoria */}
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.label}>{range.label}</Text>
          <Text style={styles.total}>{formatCurrency(totalGastos)}</Text>
          <Text style={styles.muted}>Total de despesas no período</Text>
        </Card>

        <SectionTitle title="Gastos por Categoria" />
        {loadingGastos ? (
          <Loading />
        ) : gastos.length === 0 ? (
          <Card>
            <EmptyState icon="pie-chart-outline" title="Sem despesas no período" />
          </Card>
        ) : (
          <Card style={{ gap: spacing.lg }}>
            {gastos.map((g, i) => {
              const pct = totalGastos > 0 ? g.total / totalGastos : 0;
              const cor = RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)];
              return (
                <View key={g.categoriaId ?? 'sem'} style={{ gap: 6 }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.rankName} numberOfLines={1}>
                      <Text style={styles.rankPos}>{i + 1}º </Text>
                      {g.icone} {g.nome}
                    </Text>
                    <Text style={styles.rankValue}>{formatCurrency(g.total)}</Text>
                  </View>
                  <View style={styles.rowBetween}>
                    <View style={{ flex: 1, marginRight: spacing.md }}>
                      <ProgressBar progress={pct} color={cor} height={6} />
                    </View>
                    <Text style={styles.muted}>{(pct * 100).toFixed(1).replace('.', ',')}%</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}

        {/* Orçamentos */}
        <SectionTitle title="Limites do Mês" action={<LinkButton title="+ Definir limite" onPress={() => abrirOrcamento()} />} />
        {rollover.limitesAnteriores.length > 0 ? (
          <Card style={[styles.rolloverCard, { borderColor: rollover.economia >= rollover.excesso ? `${colors.success}55` : `${colors.danger}55` }]}>
            <Ionicons
              name={rollover.economia >= rollover.excesso ? 'trophy-outline' : 'trending-down-outline'}
              size={22}
              color={rollover.economia >= rollover.excesso ? colors.success : colors.danger}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rolloverTitle}>
                {rollover.economia >= rollover.excesso
                  ? `Você economizou ${formatCurrency(rollover.economia - rollover.excesso)} no mês passado`
                  : `Você estourou ${formatCurrency(rollover.excesso - rollover.economia)} no mês passado`}
              </Text>
              <Text style={styles.muted}>
                {rollover.economia >= rollover.excesso
                  ? 'Considere guardar esse valor em uma das suas metas.'
                  : 'Revise os limites das categorias que mais pesaram.'}
              </Text>
            </View>
          </Card>
        ) : null}

        {orcamentos.length === 0 ? (
          <Card style={{ gap: spacing.md }}>
            <Text style={styles.muted}>
              Defina um teto mensal para categorias e receba alertas preventivos ao atingir o percentual de alerta.
            </Text>
            {rollover.limitesAnteriores.length > 0 ? (
              <PrimaryButton title="Copiar limites do mês anterior" variant="outline" onPress={copiarLimitesAnteriores} loading={saving} />
            ) : null}
          </Card>
        ) : (
          orcamentos.map((s) => {
            const cor = s.nivel === 'estourado' ? colors.danger : s.nivel === 'atencao' ? colors.warning : colors.success;
            let mensagem: string;
            if (s.nivel === 'estourado') {
              mensagem = `Limite ultrapassado em ${formatCurrency(s.gasto - s.orcamento.limite_mensal)}. Segure novos gastos.`;
            } else if (s.nivel === 'atencao') {
              mensagem = `Atenção: ${Math.round(s.percentual * 100)}% usado. Restam ${formatCurrency(s.disponivelPorDia)}/dia até o fim do mês.`;
            } else if (s.ritmoAcelerado) {
              mensagem = `No ritmo atual você vai gastar ${formatCurrency(s.projecao)} — acima do limite. Desacelere.`;
            } else {
              mensagem = `Bom ritmo! Projeção de ${formatCurrency(s.projecao)}, economia prevista de ${formatCurrency(s.orcamento.limite_mensal - s.projecao)}.`;
            }
            return (
              <TouchableOpacity
                key={s.orcamento.id}
                activeOpacity={0.8}
                onPress={() => abrirOrcamento(s)}
                onLongPress={() => removerOrcamento(s)}
              >
                <Card style={[styles.budgetCard, s.nivel !== 'ok' && { borderColor: `${cor}66` }]}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.rankName}>
                      {s.categoria.icone} {s.categoria.nome}
                    </Text>
                    <Text style={{ color: cor, fontWeight: '800' }}>{Math.round(s.percentual * 100)}%</Text>
                  </View>
                  <ProgressBar progress={s.percentual} color={cor} />
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>
                      {formatCurrency(s.gasto)} de {formatCurrency(s.orcamento.limite_mensal)}
                    </Text>
                    <Text style={styles.muted}>Alerta em {s.orcamento.porcentagem_alerta}%</Text>
                  </View>
                  <View style={styles.velocity}>
                    <Ionicons
                      name={s.nivel === 'ok' && !s.ritmoAcelerado ? 'speedometer-outline' : 'warning-outline'}
                      size={14}
                      color={s.nivel === 'ok' && !s.ritmoAcelerado ? colors.textSecondary : cor}
                    />
                    <Text style={styles.velocityText}>{mensagem}</Text>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {/* Metas */}
        <SectionTitle title="Metas (Cofrinhos)" action={<LinkButton title="+ Nova meta" onPress={abrirNovaMeta} />} />
        {metas.length === 0 ? (
          <Card>
            <EmptyState icon="flag-outline" title="Nenhuma meta ainda" message="Crie um cofrinho, como uma Reserva de Emergência." />
          </Card>
        ) : (
          metas.map((m) => {
            const pct = m.valor_alvo > 0 ? m.valor_atual / m.valor_alvo : 0;
            const concluida = pct >= 1;
            return (
              <TouchableOpacity key={m.id} activeOpacity={0.9} onLongPress={() => excluirMeta(m)}>
                <Card style={styles.metaCard}>
                  <View style={styles.metaHeader}>
                    <View style={styles.metaIcon}>
                      <Text style={{ fontSize: 22 }}>{m.icone}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metaNome}>{m.nome}</Text>
                      <Text style={styles.muted}>
                        {formatCurrency(m.valor_atual)} / {formatCurrency(m.valor_alvo)} alcançados
                      </Text>
                    </View>
                    <Text style={[styles.metaPct, { color: concluida ? colors.success : colors.gold }]}>{Math.round(pct * 100)}%</Text>
                  </View>
                  <ProgressBar progress={pct} color={concluida ? colors.success : colors.gold} height={10} />
                  <View style={styles.rowBetween}>
                    <Text style={styles.muted}>
                      {concluida ? '🎉 Meta concluída!' : `Faltam ${formatCurrency(m.valor_alvo - m.valor_atual)}`}
                    </Text>
                    <TouchableOpacity style={styles.guardarBtn} onPress={() => abrirAporte(m)}>
                      <Ionicons name="add-circle" size={16} color={colors.text} />
                      <Text style={styles.guardarText}>Guardar Dinheiro</Text>
                    </TouchableOpacity>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Modal: limite de categoria */}
      <BottomSheet visible={orcModal} title="Limite mensal" onClose={() => setOrcModal(false)}>
        <Text style={styles.label}>Categoria</Text>
        <View style={styles.chips}>
          {categoriasSemLimite.map((c) => (
            <Chip key={c.id} label={`${c.icone} ${c.nome}`} selected={orcCategoria === c.id} onPress={() => setOrcCategoria(c.id)} />
          ))}
        </View>
        <Input
          label="Teto mensal (R$)"
          placeholder="800,00"
          value={orcLimite}
          onChangeText={(t) => setOrcLimite(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Alertar quando atingir</Text>
        <View style={styles.chips}>
          {ALERTA_OPCOES.map((p) => (
            <Chip key={p} label={`${p}%`} selected={orcAlerta === p} onPress={() => setOrcAlerta(p)} color={colors.warning} />
          ))}
        </View>
        <PrimaryButton title="Salvar limite" onPress={salvarOrcamento} loading={saving} style={{ marginTop: spacing.md }} />
      </BottomSheet>

      {/* Modal: nova meta */}
      <BottomSheet visible={metaModal} title="Nova meta" onClose={() => setMetaModal(false)}>
        <Input label="Nome" placeholder="Ex: Reserva de Emergência" value={metaNome} onChangeText={setMetaNome} />
        <Input
          label="Valor alvo (R$)"
          placeholder="10.000,00"
          value={metaAlvo}
          onChangeText={(t) => setMetaAlvo(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Ícone</Text>
        <View style={styles.chips}>
          {META_ICONES.map((i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setMetaIcone(i)}
              style={[styles.iconPick, metaIcone === i && { borderColor: colors.gold, backgroundColor: `${colors.gold}22` }]}
            >
              <Text style={{ fontSize: 22 }}>{i}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <PrimaryButton title="Criar meta" onPress={salvarMeta} loading={saving} style={{ marginTop: spacing.md }} />
      </BottomSheet>

      {/* Modal: guardar dinheiro */}
      <BottomSheet visible={!!aporteMeta} title="Guardar Dinheiro" onClose={() => setAporteMeta(null)}>
        <Text style={[styles.muted, { marginBottom: spacing.md }]}>
          {aporteMeta?.icone} {aporteMeta?.nome}
        </Text>
        <Input
          label="Valor do aporte (R$)"
          placeholder="200,00"
          value={aporteValor}
          onChangeText={(t) => setAporteValor(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          autoFocus
        />
        <Text style={styles.label}>Retirar de uma conta?</Text>
        <View style={styles.chips}>
          <Chip label="Não debitar" selected={aporteConta === null} onPress={() => setAporteConta(null)} />
          {contas.map((c) => (
            <Chip key={c.id} label={c.nome} selected={aporteConta === c.id} onPress={() => setAporteConta(c.id)} />
          ))}
        </View>
        <PrimaryButton title="Guardar" onPress={guardarDinheiro} loading={saving} color={colors.gold} style={{ marginTop: spacing.md }} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  total: { color: colors.text, fontSize: 32, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rankName: { color: colors.text, fontSize: 15, fontWeight: '600', flex: 1, marginRight: spacing.sm },
  rankPos: { color: colors.textMuted, fontWeight: '800' },
  rankValue: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rolloverCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  rolloverTitle: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  budgetCard: { gap: spacing.sm, marginBottom: spacing.sm },
  velocity: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  velocityText: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  metaCard: { gap: spacing.md, marginBottom: spacing.sm },
  metaHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(214,158,46,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaNome: { color: colors.text, fontSize: 16, fontWeight: '700' },
  metaPct: { fontSize: 16, fontWeight: '800' },
  guardarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  guardarText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  iconPick: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
