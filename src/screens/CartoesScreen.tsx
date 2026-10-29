import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EditarLancamentoSheet } from '../components/EditarLancamentoSheet';
import { BancoLogo, BancoSelector, BandeiraLogo } from '../components/Logos';
import { GastosPorPessoaCard, PessoasEditor } from '../components/Pessoas';
import { bancoDe, detectarBanco } from '../services/bancos';
import { TransactionItem } from '../components/TransactionItem';
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
} from '../components/ui';
import { carregarPessoas, resumoPorPessoa } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { BANDEIRAS, CARD_COLORS, colors, radius, spacing } from '../theme';
import type { CartaoCredito, Conta, FaturaCartao, Pessoa, StatusFatura, Transacao, TransacaoDetalhada } from '../types';

/** Lançamento de fatura em aberto, para calcular quanto cada pessoa deve. */
type LancamentoEmAberto = Pick<Transacao, 'tipo' | 'valor' | 'pessoa_id' | 'dividido' | 'cartao_id'>;
import {
  calcularCicloFatura,
  formatCurrency,
  formatDateLong,
  formatMesAno,
  mesAnoOrdem,
  parseISODate,
  parseValor,
  toISODate,
  toNumber,
  today,
} from '../utils/format';

const STATUS_COR: Record<StatusFatura, string> = {
  ABERTA: colors.primary,
  FECHADA: colors.warning,
  PAGA: colors.success,
};

/** Status exibido: uma fatura ABERTA cuja data de fechamento já passou aparece como FECHADA. */
function statusEfetivo(f: FaturaCartao): StatusFatura {
  if (f.status === 'ABERTA' && parseISODate(f.data_fechamento) <= today()) return 'FECHADA';
  return f.status;
}

export default function CartoesScreen() {
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const cardWidth = width - spacing.lg * 2;

  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [faturas, setFaturas] = useState<FaturaCartao[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [faturaSelId, setFaturaSelId] = useState<string | null>(null);
  const [transacoes, setTransacoes] = useState<TransacaoDetalhada[]>([]);
  const [parcelados, setParcelados] = useState<TransacaoDetalhada[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTx, setLoadingTx] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal novo cartão
  const [cardModal, setCardModal] = useState(false);
  const [fNome, setFNome] = useState('');
  const [fBandeira, setFBandeira] = useState(BANDEIRAS[0]);
  const [fDigitos, setFDigitos] = useState('');
  const [fCor, setFCor] = useState(CARD_COLORS[0]);
  const [fLimite, setFLimite] = useState('');
  const [fFech, setFFech] = useState('');
  const [fVenc, setFVenc] = useState('');
  const [savingCard, setSavingCard] = useState(false);
  const [fConjunto, setFConjunto] = useState(false);
  /** Banco emissor escolhido (null = usar o reconhecido pelo nome). */
  const [fBanco, setFBanco] = useState<string | null>(null);
  const [lancamentoEdit, setLancamentoEdit] = useState<TransacaoDetalhada | null>(null);
  /** Cartão em edição (null = criando um novo). */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pessoasModal, setPessoasModal] = useState(false);
  const [emAberto, setEmAberto] = useState<LancamentoEmAberto[]>([]);

  // Modal pagar fatura
  const [payModal, setPayModal] = useState(false);
  const [payContaId, setPayContaId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const cartao = cartoes[selectedIdx] as CartaoCredito | undefined;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cartoesRes, faturasRes, contasRes, pessoasList] = await Promise.all([
        supabase.from('cartoes_credito').select('*').order('data_criacao'),
        supabase.from('faturas_cartao').select('*').order('data_vencimento'),
        supabase.from('contas').select('*').order('data_criacao'),
        carregarPessoas(),
      ]);
      setPessoas(pessoasList);
      if (cartoesRes.error) throw cartoesRes.error;
      if (faturasRes.error) throw faturasRes.error;
      if (contasRes.error) throw contasRes.error;
      const ks = ((cartoesRes.data ?? []) as CartaoCredito[]).map((k) => ({ ...k, limite_total: toNumber(k.limite_total) }));
      const fs = ((faturasRes.data ?? []) as FaturaCartao[]).map((f) => ({ ...f, valor_total: toNumber(f.valor_total) }));

      // Lançamentos das faturas não pagas (inclui parcelas futuras): base do "quanto cada um deve".
      const idsAbertas = fs.filter((f) => f.status !== 'PAGA').map((f) => f.id);
      if (idsAbertas.length) {
        const { data: abertos, error: errAbertos } = await supabase
          .from('transacoes')
          .select('tipo, valor, pessoa_id, dividido, cartao_id')
          .in('fatura_id', idsAbertas);
        if (errAbertos) throw errAbertos;
        setEmAberto(((abertos ?? []) as LancamentoEmAberto[]).map((t) => ({ ...t, valor: toNumber(t.valor) })));
      } else {
        setEmAberto([]);
      }

      setCartoes(ks);
      setFaturas(fs);
      setContas(((contasRes.data ?? []) as Conta[]).map((c) => ({ ...c, saldo: toNumber(c.saldo) })));
      setSelectedIdx((i) => Math.min(i, Math.max(0, ks.length - 1)));
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

  // Faturas do cartão selecionado + ciclo atual.
  const faturasCartao = useMemo(
    () =>
      faturas
        .filter((f) => f.cartao_id === cartao?.id)
        .sort((a, b) => mesAnoOrdem(a.mes_ano_referencia) - mesAnoOrdem(b.mes_ano_referencia)),
    [faturas, cartao?.id],
  );
  const ciclo = useMemo(() => (cartao ? calcularCicloFatura(cartao, today()) : null), [cartao]);
  const faturaAtual = faturasCartao.find((f) => f.mes_ano_referencia === ciclo?.mesAno) ?? null;
  const proximaRef = ciclo ? mesAnoOrdem(ciclo.mesAno) : 0;
  const proximaFatura = faturasCartao.find((f) => mesAnoOrdem(f.mes_ano_referencia) > proximaRef) ?? null;

  // Fatura anterior em aberto (fechada e ainda não paga) tem prioridade na seleção padrão.
  const faturaPendente = faturasCartao.find(
    (f) => mesAnoOrdem(f.mes_ano_referencia) < proximaRef && f.status !== 'PAGA' && f.valor_total > 0,
  );

  useEffect(() => {
    setFaturaSelId((atual) => {
      if (atual && faturasCartao.some((f) => f.id === atual)) return atual;
      return faturaPendente?.id ?? faturaAtual?.id ?? null;
    });
  }, [faturasCartao, faturaAtual?.id, faturaPendente?.id]);

  const faturaSel = faturasCartao.find((f) => f.id === faturaSelId) ?? null;


  // Somatório de todos os cartões: o limite usado é a soma das faturas não pagas
  // (inclui parcelas futuras, que já comprometem o limite).
  const limiteTotal = cartoes.reduce((a, k) => a + k.limite_total, 0);
  const limiteUsado = faturas.filter((f) => f.status !== 'PAGA').reduce((a, f) => a + Math.max(0, f.valor_total), 0);
  const limiteDisponivel = limiteTotal - limiteUsado;
  const fracaoDisponivel = limiteTotal > 0 ? limiteDisponivel / limiteTotal : 0;

  // Transações da fatura selecionada + parcelamentos futuros do cartão.
  const loadTransacoes = useCallback(async () => {
    if (!cartao) {
      setTransacoes([]);
      setParcelados([]);
      return;
    }
    setLoadingTx(true);
    try {
      const select = '*, categorias(nome, icone), contas(nome), cartoes_credito(nome), pessoas(nome, cor)';
      const [txRes, parcRes] = await Promise.all([
        faturaSelId
          ? supabase.from('transacoes').select(select).eq('fatura_id', faturaSelId).order('data_transacao', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('transacoes')
          .select(`${select}, faturas_cartao(mes_ano_referencia)`)
          .eq('cartao_id', cartao.id)
          .gt('total_parcelas', 1)
          .gte('data_transacao', toISODate(ciclo ? ciclo.fechamento : today())),
      ]);
      if (txRes.error) throw txRes.error;
      if (parcRes.error) throw parcRes.error;
      const norm = (rows: unknown) => ((rows ?? []) as TransacaoDetalhada[]).map((t) => ({ ...t, valor: toNumber(t.valor) }));
      setTransacoes(norm(txRes.data));
      setParcelados(norm(parcRes.data));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingTx(false);
    }
  }, [cartao, faturaSelId, ciclo]);

  useEffect(() => {
    if (isFocused) loadTransacoes();
  }, [isFocused, loadTransacoes]);

  // Agrupa parcelas futuras por mês de fatura.
  const previsao = useMemo(() => {
    const map = new Map<string, { ref: string; total: number; qtd: number }>();
    for (const t of parcelados as (TransacaoDetalhada & { faturas_cartao?: { mes_ano_referencia: string } | null })[]) {
      const ref = t.faturas_cartao?.mes_ano_referencia;
      if (!ref) continue;
      const item = map.get(ref) ?? { ref, total: 0, qtd: 0 };
      item.total += Math.abs(t.valor);
      item.qtd += 1;
      map.set(ref, item);
    }
    return [...map.values()].sort((a, b) => mesAnoOrdem(a.ref) - mesAnoOrdem(b.ref)).slice(0, 6);
  }, [parcelados]);
  const maxPrevisao = Math.max(1, ...previsao.map((p) => p.total));

  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + spacing.md));
    if (idx !== selectedIdx && idx >= 0 && idx < cartoes.length) {
      setSelectedIdx(idx);
      setFaturaSelId(null);
    }
  };

  const abrirNovoCartao = () => {
    setFNome('');
    setFBandeira(BANDEIRAS[0]);
    setFBanco(null);
    setFDigitos('');
    setFCor(CARD_COLORS[0]);
    setFLimite('');
    setFFech('');
    setFVenc('');
    setFConjunto(false);
    setEditandoId(null);
    setCardModal(true);
  };

  const abrirEditarCartao = (k: CartaoCredito) => {
    setFNome(k.nome);
    setFBandeira(k.bandeira);
    setFBanco(k.banco_codigo);
    setFDigitos(k.ultimos_digitos);
    setFCor(k.cor_card);
    setFLimite(String(k.limite_total).replace('.', ','));
    setFFech(String(k.dia_fechamento));
    setFVenc(String(k.dia_vencimento));
    setFConjunto(!!k.conjunto);
    setEditandoId(k.id);
    setCardModal(true);
  };

  const salvarCartao = async () => {
    const limite = parseValor(fLimite);
    const fech = Number(fFech);
    const venc = Number(fVenc);
    if (!fNome.trim()) return Alert.alert('Atenção', 'Informe o nome do cartão.');
    if (!/^\d{4}$/.test(fDigitos)) return Alert.alert('Atenção', 'Informe os 4 últimos dígitos.');
    if (Number.isNaN(limite) || limite <= 0) return Alert.alert('Atenção', 'Informe um limite válido.');
    if (!Number.isInteger(fech) || fech < 1 || fech > 31) return Alert.alert('Atenção', 'Dia de fechamento deve ser entre 1 e 31.');
    if (!Number.isInteger(venc) || venc < 1 || venc > 31) return Alert.alert('Atenção', 'Dia de vencimento deve ser entre 1 e 31.');

    setSavingCard(true);
    try {
      const campos = {
        nome: fNome.trim(),
        bandeira: fBandeira,
        ultimos_digitos: fDigitos,
        cor_card: fCor,
        limite_total: limite,
        dia_fechamento: fech,
        dia_vencimento: venc,
        conjunto: fConjunto,
        banco_codigo: fBanco ?? detectarBanco(fNome),
      };
      const { error: err } = editandoId
        ? await supabase.from('cartoes_credito').update(campos).eq('id', editandoId)
        : await supabase.from('cartoes_credito').insert({ ...campos, usuario_id: await getUserId() });
      if (err) throw err;
      setCardModal(false);
      if (!editandoId) setSelectedIdx(cartoes.length);
      await load();
    } catch (err) {
      Alert.alert('Erro ao salvar cartão', errorMessage(err));
    } finally {
      setSavingCard(false);
    }
  };

  const excluirCartao = () => {
    const k = cartoes.find((c) => c.id === editandoId);
    if (!k) return;
    Alert.alert(
      'Excluir cartão',
      `Excluir o ${k.nome}? Todas as faturas e compras lançadas nele também serão apagadas. Isso não pode ser desfeito.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.from('cartoes_credito').delete().eq('id', k.id);
            if (err) return Alert.alert('Erro ao excluir cartão', errorMessage(err));
            setCardModal(false);
            setSelectedIdx(0);
            setFaturaSelId(null);
            load();
          },
        },
      ],
    );
  };

  const abrirPagamento = () => {
    if (!faturaSel) return;
    if (faturaSel.status === 'PAGA') return Alert.alert('Fatura paga', 'Esta fatura já foi paga.');
    if (faturaSel.valor_total <= 0) return Alert.alert('Nada a pagar', 'Esta fatura não possui valor em aberto.');
    if (contas.length === 0) return Alert.alert('Sem contas', 'Cadastre uma conta no Início para pagar a fatura.');
    setPayContaId(contas[0].id);
    setPayModal(true);
  };

  const pagarFatura = async () => {
    if (!faturaSel || !payContaId) return;
    setPaying(true);
    try {
      const { error: err } = await supabase.rpc('pagar_fatura', { p_fatura_id: faturaSel.id, p_conta_id: payContaId });
      if (err) throw err;
      setPayModal(false);
      Alert.alert('Fatura paga', `${formatCurrency(faturaSel.valor_total)} debitado da conta.`);
      await load();
    } catch (err) {
      Alert.alert('Erro ao pagar fatura', errorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const statusSel = faturaSel ? statusEfetivo(faturaSel) : null;
  const resumoFatura = resumoPorPessoa(transacoes, pessoas);
  // Quanto cada pessoa deve: no cartão selecionado e somando todos os cartões compartilhados.
  const cartoesCompartilhados = new Set(cartoes.filter((k) => k.conjunto).map((k) => k.id));
  const deveNoCartao = resumoPorPessoa(
    emAberto.filter((t) => t.cartao_id === cartao?.id),
    pessoas,
  );
  const deveTotal = resumoPorPessoa(
    emAberto.filter((t) => t.cartao_id && cartoesCompartilhados.has(t.cartao_id)),
    pessoas,
  );

  const alternarConjunto = (k: CartaoCredito) => {
    const virar = !k.conjunto;
    Alert.alert(
      virar ? 'Cartão compartilhado' : 'Cartão individual',
      virar
        ? `Nas compras do ${k.nome}, vocês indicarão quem gastou ou se foi dividido.`
        : `O ${k.nome} deixará de separar gastos por pessoa. Lançamentos já marcados não mudam.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            const { error: err } = await supabase.from('cartoes_credito').update({ conjunto: virar }).eq('id', k.id);
            if (err) Alert.alert('Erro', errorMessage(err));
            else load();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Cartões"
        subtitle="Limites, faturas e parcelamentos"
        right={
          <TouchableOpacity style={styles.addBtn} onPress={abrirNovoCartao} accessibilityLabel="Adicionar cartão">
            <Ionicons name="add" size={22} color={colors.onAccent} />
          </TouchableOpacity>
        }
      />
      <ScrollView
        contentContainerStyle={styles.container}
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

        {cartoes.length === 0 ? (
          <Card>
            <EmptyState icon="card-outline" title="Nenhum cartão cadastrado" message="Adicione seu cartão de crédito para acompanhar faturas e limites." />
            <PrimaryButton title="Adicionar Cartão" icon="add" onPress={abrirNovoCartao} />
          </Card>
        ) : (
          <>
            {/* Resumo dos limites de todos os cartões */}
            <Card style={styles.limitesCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.label}>
                  Limites • {cartoes.length} {cartoes.length === 1 ? 'cartão' : 'cartões'}
                </Text>
                <Text style={[styles.muted, { fontWeight: '700' }]}>{Math.round(fracaoDisponivel * 100)}% disponível</Text>
              </View>
              <View style={styles.limitesLinha}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Disponível</Text>
                  <Text
                    style={[
                      styles.limiteDisp,
                      { color: limiteDisponivel < 0 ? colors.danger : fracaoDisponivel < 0.2 ? colors.warning : colors.success },
                    ]}
                  >
                    {formatCurrency(limiteDisponivel)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.infoLabel}>Limite total</Text>
                  <Text style={styles.infoValue}>{formatCurrency(limiteTotal)}</Text>
                  <Text style={[styles.infoLabel, { marginTop: 4 }]}>Usado {formatCurrency(limiteUsado)}</Text>
                </View>
              </View>
              <ProgressBar
                progress={fracaoDisponivel}
                color={limiteDisponivel < 0 ? colors.danger : fracaoDisponivel < 0.2 ? colors.warning : colors.success}
              />
            </Card>

            {/* Quanto cada pessoa deve, somando todos os cartões compartilhados */}
            {cartoesCompartilhados.size > 0 && pessoas.length > 0 ? (
              <GastosPorPessoaCard
                resumo={deveTotal}
                titulo={`Quanto cada um deve • ${cartoesCompartilhados.size} ${cartoesCompartilhados.size === 1 ? 'cartão compartilhado' : 'cartões compartilhados'}`}
                onGerenciar={() => setPessoasModal(true)}
              />
            ) : null}

            {/* Carrossel de cartões */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + spacing.md}
              decelerationRate="fast"
              onMomentumScrollEnd={onCarouselScroll}
              contentContainerStyle={{ gap: spacing.md }}
            >
              {cartoes.map((k, i) => {
                const fat = faturas.filter((f) => f.cartao_id === k.id && f.status !== 'PAGA');
                const uso = fat.reduce((a, f) => a + Math.max(0, f.valor_total), 0);
                const disp = k.limite_total - uso;
                return (
                  <TouchableOpacity
                    key={k.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      setSelectedIdx(i);
                      setFaturaSelId(null);
                    }}
                    onLongPress={() => abrirEditarCartao(k)}
                    style={[
                      styles.creditCard,
                      { width: cardWidth, backgroundColor: k.cor_card },
                      i === selectedIdx && styles.creditCardSelected,
                    ]}
                  >
                    <View style={styles.rowBetween}>
                      <View style={styles.cardTitulo}>
                        {bancoDe(k) ? <BancoLogo codigo={bancoDe(k)} size={30} /> : null}
                        <Text style={styles.cardName} numberOfLines={1}>
                          {k.nome}
                        </Text>
                      </View>
                      <BandeiraLogo bandeira={k.bandeira} width={52} />
                    </View>
                    <Text style={styles.cardDigits}>•••• •••• •••• {k.ultimos_digitos}</Text>
                    <View style={{ gap: 6 }}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardSmall}>Disponível {formatCurrency(disp)}</Text>
                        <Text style={styles.cardSmall}>Limite {formatCurrency(k.limite_total)}</Text>
                      </View>
                      <ProgressBar
                        progress={k.limite_total > 0 ? disp / k.limite_total : 0}
                        color={disp / Math.max(1, k.limite_total) < 0.2 ? colors.warning : colors.onAccent}
                        height={6}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {cartoes.length > 1 ? (
              <View style={styles.dots}>
                {cartoes.map((k, i) => (
                  <View key={k.id} style={[styles.dot, i === selectedIdx && styles.dotActive]} />
                ))}
              </View>
            ) : null}

            {cartao ? (
              <>
                {/* Seletor de faturas */}
                {faturasCartao.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.faturaChips}>
                    {faturasCartao.map((f) => (
                      <Chip
                        key={f.id}
                        label={`${formatMesAno(f.mes_ano_referencia)}${f.id === faturaAtual?.id ? ' • atual' : ''}`}
                        selected={f.id === faturaSelId}
                        onPress={() => setFaturaSelId(f.id)}
                        color={STATUS_COR[statusEfetivo(f)]}
                      />
                    ))}
                  </ScrollView>
                ) : null}

                <View style={styles.cardActions}>
                  <TouchableOpacity style={[styles.sharedRow, { flex: 1, marginTop: 0 }]} onPress={() => alternarConjunto(cartao)}>
                    <Ionicons
                      name={cartao.conjunto ? 'people' : 'person-outline'}
                      size={16}
                      color={cartao.conjunto ? colors.primary : colors.textMuted}
                    />
                    <Text style={styles.sharedText}>
                      {cartao.conjunto ? 'Cartão compartilhado' : 'Cartão individual'} • toque para alterar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editBtn} onPress={() => abrirEditarCartao(cartao)} accessibilityLabel="Editar cartão">
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={styles.editText}>Editar</Text>
                  </TouchableOpacity>
                </View>

                {/* Status da fatura */}
                <Card style={{ marginTop: spacing.md }}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.label}>
                      {faturaSel ? `Fatura ${formatMesAno(faturaSel.mes_ano_referencia)}` : 'Fatura atual'}
                    </Text>
                    {statusSel ? (
                      <View style={[styles.statusPill, { backgroundColor: `${STATUS_COR[statusSel]}22` }]}>
                        <Text style={{ color: STATUS_COR[statusSel], fontWeight: '700', fontSize: 12 }}>{statusSel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.faturaValor}>{formatCurrency(faturaSel?.valor_total ?? 0)}</Text>
                  <View style={styles.faturaInfo}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Fechamento</Text>
                      <Text style={styles.infoValue}>
                        {faturaSel ? formatDateLong(faturaSel.data_fechamento) : ciclo ? formatDateLong(toISODate(ciclo.fechamento)) : '-'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Vencimento</Text>
                      <Text style={styles.infoValue}>
                        {faturaSel ? formatDateLong(faturaSel.data_vencimento) : ciclo ? formatDateLong(toISODate(ciclo.vencimento)) : '-'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.nextRow}>
                    <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                    <Text style={styles.nextText}>
                      Próxima fatura{proximaFatura ? ` (${formatMesAno(proximaFatura.mes_ano_referencia)})` : ''}:{' '}
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{formatCurrency(proximaFatura?.valor_total ?? 0)}</Text>
                    </Text>
                  </View>
                  <PrimaryButton
                    title={faturaSel?.status === 'PAGA' ? 'Fatura paga' : 'Pagar Fatura'}
                    icon="cash-outline"
                    onPress={abrirPagamento}
                    disabled={!faturaSel || faturaSel.status === 'PAGA' || faturaSel.valor_total <= 0}
                    color={colors.success}
                    style={{ marginTop: spacing.lg }}
                  />
                </Card>

                {/* Previsão de parcelamentos */}
                <SectionTitle title="Previsão de Parcelamentos" />
                <Card>
                  {previsao.length === 0 ? (
                    <Text style={styles.muted}>Nenhuma compra parcelada para os próximos meses.</Text>
                  ) : (
                    previsao.map((p) => (
                      <View key={p.ref} style={styles.prevRow}>
                        <Text style={styles.prevMes}>{formatMesAno(p.ref)}</Text>
                        <View style={{ flex: 1, marginHorizontal: spacing.md }}>
                          <ProgressBar progress={p.total / maxPrevisao} color={colors.warning} height={6} />
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.prevValor}>{formatCurrency(p.total)}</Text>
                          <Text style={styles.muted}>
                            {p.qtd} parcela{p.qtd > 1 ? 's' : ''}
                          </Text>
                        </View>
                      </View>
                    ))
                  )}
                </Card>

                {cartao.conjunto ? (
                  <>
                    <SectionTitle title="Quanto cada um deve neste cartão" />
                    <GastosPorPessoaCard
                      resumo={deveNoCartao}
                      titulo="Todas as faturas em aberto (com parcelas futuras)"
                      onGerenciar={() => setPessoasModal(true)}
                    />
                    <GastosPorPessoaCard
                      resumo={resumoFatura}
                      titulo={faturaSel ? `Só a fatura ${formatMesAno(faturaSel.mes_ano_referencia)}` : 'Fatura selecionada'}
                    />
                  </>
                ) : null}

                {/* Extrato do cartão */}
                <SectionTitle
                  title="Extrato da fatura"
                  action={<LinkButton title="Atualizar" onPress={loadTransacoes} />}
                />
                {loadingTx ? (
                  <Loading />
                ) : transacoes.length === 0 ? (
                  <EmptyState icon="receipt-outline" title="Sem lançamentos" message="Compras no cartão aparecem aqui." />
                ) : (
                  transacoes.map((t) => <TransactionItem key={t.id} item={t} onPress={() => setLancamentoEdit(t)} />)
                )}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Modal: adicionar cartão */}
      <BottomSheet visible={cardModal} title={editandoId ? 'Editar cartão' : 'Adicionar cartão'} onClose={() => setCardModal(false)}>
        <Input label="Nome do cartão" placeholder="Ex: Nubank Platinum" value={fNome} onChangeText={setFNome} />
        <BancoSelector label="Banco emissor" value={fBanco} onChange={setFBanco} reconhecido={detectarBanco(fNome)} />
        <Text style={styles.label}>Bandeira</Text>
        <View style={styles.chips}>
          {BANDEIRAS.map((b) => (
            <TouchableOpacity
              key={b}
              onPress={() => setFBandeira(b)}
              style={[styles.bandeiraOpcao, fBandeira === b && styles.bandeiraOpcaoSel]}
              accessibilityLabel={b}
            >
              <BandeiraLogo bandeira={b} width={44} />
              <Text style={[styles.bandeiraNome, fBandeira === b && { color: colors.text }]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input
          label="Últimos 4 dígitos"
          placeholder="1234"
          value={fDigitos}
          onChangeText={(t) => setFDigitos(t.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
        />
        <Input
          label="Limite total"
          placeholder="5.000,00"
          value={fLimite}
          onChangeText={(t) => setFLimite(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Dia fechamento" placeholder="5" value={fFech} onChangeText={(t) => setFFech(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Dia vencimento" placeholder="12" value={fVenc} onChangeText={(t) => setFVenc(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
          </View>
        </View>
        <Text style={styles.label}>Cor do cartão</Text>
        <View style={styles.chips}>
          {CARD_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => setFCor(c)}
              style={[styles.swatch, { backgroundColor: c }, fCor === c && styles.swatchSelected]}
              accessibilityLabel={`Cor ${c}`}
            />
          ))}
        </View>
        <TouchableOpacity style={[styles.sharedRow, { marginTop: 0 }]} onPress={() => setFConjunto((v) => !v)}>
          <Ionicons name={fConjunto ? 'checkbox' : 'square-outline'} size={22} color={fConjunto ? colors.primary : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Cartão compartilhado</Text>
            <Text style={styles.muted}>Cada compra indica quem gastou ou se foi dividida</Text>
          </View>
        </TouchableOpacity>
        {fConjunto ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.label}>Pessoas que usam o cartão</Text>
            <PessoasEditor pessoas={pessoas} onChange={() => carregarPessoas().then(setPessoas).catch(() => undefined)} />
          </View>
        ) : null}
        {editandoId ? (
          <Text style={[styles.muted, { marginTop: spacing.sm }]}>
            Mudar os dias de fechamento/vencimento vale para as próximas faturas; as já criadas mantêm as datas.
          </Text>
        ) : null}
        <PrimaryButton
          title={editandoId ? 'Salvar alterações' : 'Salvar cartão'}
          onPress={salvarCartao}
          loading={savingCard}
          style={{ marginTop: spacing.md }}
        />
        {editandoId ? (
          <TouchableOpacity onPress={excluirCartao} style={{ alignSelf: 'center', padding: spacing.md }}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir cartão</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>

      <EditarLancamentoSheet
        transacao={lancamentoEdit}
        onClose={() => setLancamentoEdit(null)}
        onSaved={() => {
          load();
          loadTransacoes();
        }}
      />

      {/* Modal: pessoas */}
      <BottomSheet visible={pessoasModal} title="Pessoas" onClose={() => setPessoasModal(false)}>
        <Text style={[styles.muted, { marginBottom: spacing.md }]}>
          As mesmas pessoas valem para todas as contas e cartões compartilhados e para os investimentos.
        </Text>
        <PessoasEditor pessoas={pessoas} onChange={load} />
      </BottomSheet>

      {/* Modal: pagar fatura */}
      <BottomSheet visible={payModal} title="Pagar fatura" onClose={() => setPayModal(false)}>
        <Text style={styles.payValor}>{formatCurrency(faturaSel?.valor_total ?? 0)}</Text>
        <Text style={[styles.muted, { textAlign: 'center', marginBottom: spacing.lg }]}>
          {cartao?.nome} • {faturaSel ? formatMesAno(faturaSel.mes_ano_referencia) : ''}
        </Text>
        <Text style={styles.label}>Debitar da conta</Text>
        {contas.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={[styles.payConta, payContaId === c.id && { borderColor: colors.primary }]}
            onPress={() => setPayContaId(c.id)}
          >
            <Ionicons
              name={payContaId === c.id ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={payContaId === c.id ? colors.primary : colors.textMuted}
            />
            <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>{c.nome}</Text>
            <Text style={{ color: colors.textSecondary }}>{formatCurrency(c.saldo)}</Text>
          </TouchableOpacity>
        ))}
        <PrimaryButton title="Confirmar pagamento" onPress={pagarFatura} loading={paying} color={colors.success} style={{ marginTop: spacing.lg }} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditCard: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    height: 190,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    opacity: 0.75,
  },
  creditCardSelected: { opacity: 1, borderColor: 'rgba(255,255,255,0.3)' },
  limitesCard: { gap: spacing.sm, marginBottom: spacing.lg },
  limitesLinha: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  limiteDisp: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  cardTitulo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, marginRight: spacing.sm },
  bandeiraOpcao: {
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bandeiraOpcaoSel: { borderColor: colors.primary, backgroundColor: 'rgba(49,130,206,0.12)' },
  bandeiraNome: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  cardName: { color: colors.onAccent, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  cardBrand: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '800', fontStyle: 'italic' },
  cardDigits: { color: colors.onAccent, fontSize: 18, letterSpacing: 2, fontWeight: '600' },
  cardSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.input },
  dotActive: { width: 18, backgroundColor: colors.primary },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.input,
  },
  editText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  sharedText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  faturaChips: { gap: spacing.sm, marginTop: spacing.lg },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  faturaValor: { color: colors.text, fontSize: 32, fontWeight: '800', marginTop: spacing.xs },
  faturaInfo: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.md },
  infoLabel: { color: colors.textMuted, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 2 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  nextText: { color: colors.textSecondary, fontSize: 13 },
  muted: { color: colors.textMuted, fontSize: 12 },
  prevRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  prevMes: { color: colors.text, fontWeight: '700', width: 72 },
  prevValor: { color: colors.text, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: colors.text },
  payValor: { color: colors.text, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  payConta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    marginBottom: spacing.sm,
  },
});
