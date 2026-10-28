import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QuemSelector, type Quem } from '../components/Pessoas';
import { Chip, ErrorBanner, Input, Loading, PrimaryButton, SegmentedControl } from '../components/ui';
import { carregarPessoas } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import type { CartaoCredito, Categoria, Conta, NovaTransacao, Pessoa, TabParamList, TipoTransacao } from '../types';
import {
  addDays,
  addMonths,
  digitsToAmount,
  formatCurrency,
  maskDateBR,
  parseDateBR,
  toISODate,
  today,
} from '../utils/format';

type NovoRoute = RouteProp<TabParamList, 'Novo'>;
type Origem = { kind: 'conta' | 'cartao'; id: string } | null;
type DataOpcao = 'hoje' | 'ontem' | 'outra';
type Repeticao = 'nao' | 'mensal' | 'parcelado';

/** Quantidade de ocorrências geradas para lançamentos recorrentes mensais. */
const OCORRENCIAS_RECORRENTES = 12;
const PARCELAS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const TIPO_COR: Record<TipoTransacao, string> = {
  DESPESA: colors.danger,
  RECEITA: colors.success,
  TRANSFERENCIA: colors.primary,
};

export default function NewTransactionScreen() {
  const route = useRoute<NovoRoute>();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cartoes, setCartoes] = useState<CartaoCredito[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tipo, setTipo] = useState<TipoTransacao>('DESPESA');
  const [digits, setDigits] = useState('');
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [origem, setOrigem] = useState<Origem>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [dataOpcao, setDataOpcao] = useState<DataOpcao>('hoje');
  const [dataTexto, setDataTexto] = useState('');
  const [repeticao, setRepeticao] = useState<Repeticao>('nao');
  const [parcelas, setParcelas] = useState(2);
  const [quem, setQuem] = useState<Quem>({ pessoaId: null, dividido: false });

  const valor = digitsToAmount(digits);

  const resetForm = useCallback((novoTipo: TipoTransacao = 'DESPESA') => {
    setTipo(novoTipo);
    setDigits('');
    setCategoriaId(null);
    setDescricao('');
    setShowDetails(novoTipo === 'TRANSFERENCIA');
    setDestinoId(null);
    setDataOpcao('hoje');
    setDataTexto('');
    setRepeticao('nao');
    setParcelas(2);
    setQuem({ pessoaId: null, dividido: false });
  }, []);

  // Tipo pré-selecionado vindo das ações rápidas do Dashboard.
  const tipoParam = route.params?.tipo;
  const nonce = route.params?.nonce;
  useEffect(() => {
    if (tipoParam) resetForm(tipoParam);
  }, [tipoParam, nonce, resetForm]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [catRes, contasRes, cartoesRes, pessoasList] = await Promise.all([
        supabase.from('categorias').select('*').order('nome'),
        supabase.from('contas').select('*').order('data_criacao'),
        supabase.from('cartoes_credito').select('*').order('data_criacao'),
        carregarPessoas(),
      ]);
      if (catRes.error) throw catRes.error;
      if (contasRes.error) throw contasRes.error;
      if (cartoesRes.error) throw cartoesRes.error;
      setCategorias((catRes.data ?? []) as Categoria[]);
      setContas((contasRes.data ?? []) as Conta[]);
      setCartoes((cartoesRes.data ?? []) as CartaoCredito[]);
      setPessoas(pessoasList);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  // Garante uma origem válida sempre que tipo/contas mudarem.
  useEffect(() => {
    const origemValida =
      origem &&
      (origem.kind === 'conta'
        ? contas.some((c) => c.id === origem.id)
        : tipo === 'DESPESA' && cartoes.some((c) => c.id === origem.id));
    if (!origemValida) {
      if (contas[0]) setOrigem({ kind: 'conta', id: contas[0].id });
      else if (tipo === 'DESPESA' && cartoes[0]) setOrigem({ kind: 'cartao', id: cartoes[0].id });
      else setOrigem(null);
    }
  }, [tipo, contas, cartoes, origem]);

  useEffect(() => {
    if (repeticao === 'parcelado' && origem?.kind !== 'cartao') setRepeticao('nao');
  }, [origem, repeticao]);

  const categoriasDoTipo = useMemo(
    () => (tipo === 'TRANSFERENCIA' ? [] : categorias.filter((c) => c.tipo === tipo)),
    [categorias, tipo],
  );

  // Conta conjunta ou cartão compartilhado: o lançamento indica quem gastou.
  const origemCompartilhada =
    tipo !== 'TRANSFERENCIA' &&
    !!origem &&
    (origem.kind === 'conta'
      ? !!contas.find((c) => c.id === origem.id)?.conjunta
      : !!cartoes.find((c) => c.id === origem.id)?.conjunto);

  const dataSelecionada = (): Date | null => {
    if (dataOpcao === 'hoje') return today();
    if (dataOpcao === 'ontem') return addDays(today(), -1);
    return parseDateBR(dataTexto);
  };

  const origemLabel = () => {
    if (!origem) return 'Nenhuma conta';
    if (origem.kind === 'conta') return contas.find((c) => c.id === origem.id)?.nome ?? 'Conta';
    const k = cartoes.find((c) => c.id === origem.id);
    return k ? `💳 ${k.nome}` : 'Cartão';
  };

  const montarLancamentos = (usuarioId: string, data: Date): NovaTransacao[] => {
    const hoje = today();
    const base = {
      usuario_id: usuarioId,
      categoria_id: tipo === 'TRANSFERENCIA' ? null : categoriaId,
      descricao: descricao.trim(),
      numero_parcela: 1,
      total_parcelas: 1,
      recorrente: repeticao === 'mensal',
      pessoa_id: origemCompartilhada && !quem.dividido ? quem.pessoaId : null,
      dividido: origemCompartilhada && quem.dividido,
    };
    const statusPara = (d: Date, cartao: boolean) => (cartao || d <= hoje ? 'EFETIVADA' : 'PENDENTE') as NovaTransacao['status'];

    // Transferência entre contas: saída na origem + entrada no destino.
    if (tipo === 'TRANSFERENCIA') {
      const n = repeticao === 'mensal' ? OCORRENCIAS_RECORRENTES : 1;
      const origemNome = contas.find((c) => c.id === origem?.id)?.nome ?? '';
      const destinoNome = contas.find((c) => c.id === destinoId)?.nome ?? '';
      const rows: NovaTransacao[] = [];
      for (let i = 0; i < n; i++) {
        const d = addMonths(data, i);
        const common = { ...base, tipo, data_transacao: toISODate(d), status: statusPara(d, false), cartao_id: null };
        rows.push({ ...common, conta_id: origem!.id, valor: -valor, descricao: base.descricao || `Transferência para ${destinoNome}` });
        rows.push({ ...common, conta_id: destinoId, valor, descricao: base.descricao || `Transferência de ${origemNome}` });
      }
      return rows;
    }

    const sinal = tipo === 'DESPESA' ? -1 : 1;
    const noCartao = origem!.kind === 'cartao';
    const destino = noCartao ? { conta_id: null, cartao_id: origem!.id } : { conta_id: origem!.id, cartao_id: null };

    if (repeticao === 'parcelado' && noCartao) {
      // Divide em centavos; a diferença de arredondamento fica na 1ª parcela.
      const totalCents = Math.round(valor * 100);
      const parcelaCents = Math.floor(totalCents / parcelas);
      const resto = totalCents - parcelaCents * parcelas;
      return Array.from({ length: parcelas }, (_, i) => {
        const d = addMonths(data, i);
        return {
          ...base,
          ...destino,
          tipo,
          recorrente: false,
          valor: (sinal * (parcelaCents + (i === 0 ? resto : 0))) / 100,
          data_transacao: toISODate(d),
          status: statusPara(d, true),
          numero_parcela: i + 1,
          total_parcelas: parcelas,
        };
      });
    }

    const n = repeticao === 'mensal' ? OCORRENCIAS_RECORRENTES : 1;
    return Array.from({ length: n }, (_, i) => {
      const d = addMonths(data, i);
      return {
        ...base,
        ...destino,
        tipo,
        valor: sinal * valor,
        data_transacao: toISODate(d),
        status: statusPara(d, noCartao),
      };
    });
  };

  const salvar = async () => {
    if (valor <= 0) {
      Alert.alert('Atenção', 'Informe um valor maior que zero.');
      return;
    }
    if (!origem) {
      Alert.alert('Atenção', 'Cadastre uma conta (no Início) ou um cartão antes de lançar.');
      return;
    }
    if (tipo === 'TRANSFERENCIA') {
      if (origem.kind !== 'conta' || !destinoId) {
        Alert.alert('Atenção', 'Selecione a conta de origem e a conta de destino.');
        setShowDetails(true);
        return;
      }
      if (destinoId === origem.id) {
        Alert.alert('Atenção', 'A conta de destino deve ser diferente da origem.');
        return;
      }
    } else if (!categoriaId) {
      Alert.alert('Atenção', 'Escolha uma categoria.');
      return;
    } else if (origemCompartilhada && pessoas.length > 0 && !quem.pessoaId && !quem.dividido) {
      Alert.alert('Atenção', 'Indique quem fez este lançamento ou marque como Dividido.');
      return;
    }
    const data = dataSelecionada();
    if (!data) {
      Alert.alert('Atenção', 'Data inválida. Use o formato DD/MM/AAAA.');
      return;
    }

    setSaving(true);
    try {
      const usuarioId = await getUserId();
      const rows = montarLancamentos(usuarioId, data);
      const { error } = await supabase.from('transacoes').insert(rows);
      if (error) throw error;

      const extra =
        repeticao === 'parcelado'
          ? ` em ${parcelas}x de ${formatCurrency(valor / parcelas)}`
          : repeticao === 'mensal'
            ? ` (repetido pelos próximos ${OCORRENCIAS_RECORRENTES} meses)`
            : '';
      Alert.alert('Lançamento salvo', `${formatCurrency(valor)}${extra}`);
      resetForm(tipo);
      navigation.navigate('Tabs', { screen: 'Inicio' });
    } catch (err) {
      Alert.alert('Erro ao salvar', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const cor = TIPO_COR[tipo];
  const contasDestino = contas.filter((c) => c.id !== origem?.id);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Novo lançamento</Text>
          {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}

          <SegmentedControl
            options={[
              { label: 'Despesa', value: 'DESPESA' },
              { label: 'Receita', value: 'RECEITA' },
              { label: 'Transferência', value: 'TRANSFERENCIA' },
            ]}
            value={tipo}
            onChange={(t) => {
              setTipo(t);
              setCategoriaId(null);
              if (t === 'TRANSFERENCIA') setShowDetails(true);
            }}
            colorFor={(t) => TIPO_COR[t]}
          />

          {/* Valor em destaque (máscara de centavos) */}
          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>Valor</Text>
            <View>
              <Text style={[styles.amount, { color: valor > 0 ? cor : colors.textMuted }]}>{formatCurrency(valor)}</Text>
              <TextInput
                value={digits}
                onChangeText={(t) => setDigits(t.replace(/\D/g, '').replace(/^0+/, '').slice(0, 11))}
                keyboardType="number-pad"
                style={styles.amountInput}
                caretHidden
                accessibilityLabel="Valor do lançamento"
              />
            </View>
          </View>

          {/* Atalhos de categoria */}
          {tipo !== 'TRANSFERENCIA' ? (
            <>
              <Text style={styles.label}>Categoria</Text>
              <View style={styles.grid}>
                {categoriasDoTipo.map((c) => {
                  const selected = c.id === categoriaId;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catItem, selected && { borderColor: cor, backgroundColor: `${cor}22` }]}
                      onPress={() => setCategoriaId(c.id)}
                    >
                      <Text style={styles.catIcon}>{c.icone}</Text>
                      <Text style={[styles.catName, selected && { color: colors.text }]} numberOfLines={1}>
                        {c.nome}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {categoriasDoTipo.length === 0 ? <Text style={styles.muted}>Nenhuma categoria encontrada.</Text> : null}
              </View>
            </>
          ) : null}

          {origemCompartilhada ? (
            <View style={styles.quemBox}>
              <Text style={styles.label}>Quem? • {origemLabel()} (compartilhado)</Text>
              {pessoas.length > 0 ? (
                <QuemSelector pessoas={pessoas} value={quem} onChange={setQuem} />
              ) : (
                <Text style={[styles.muted, { marginBottom: spacing.md }]}>
                  Cadastre as pessoas no extrato da conta ou em Cartões para separar os gastos.
                </Text>
              )}
              {quem.dividido && pessoas.length > 0 && valor > 0 ? (
                <Text style={[styles.muted, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>
                  {formatCurrency(valor / pessoas.length)} para cada uma das {pessoas.length} pessoas
                </Text>
              ) : null}
            </View>
          ) : null}

          <Input
            label="Descrição"
            placeholder="Do que se trata? Ex: Almoço"
            value={descricao}
            onChangeText={setDescricao}
            maxLength={200}
          />

          {/* Mais detalhes */}
          <TouchableOpacity style={styles.detailsToggle} onPress={() => setShowDetails((v) => !v)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailsTitle}>Mais detalhes</Text>
              {!showDetails ? (
                <Text style={styles.muted} numberOfLines={1}>
                  {origemLabel()} • {dataOpcao === 'hoje' ? 'Hoje' : dataOpcao === 'ontem' ? 'Ontem' : dataTexto || 'Outra data'}
                  {repeticao === 'mensal' ? ' • Mensal' : repeticao === 'parcelado' ? ` • ${parcelas}x` : ''}
                </Text>
              ) : null}
            </View>
            <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {showDetails ? (
            <View style={styles.details}>
              <Text style={styles.label}>{tipo === 'TRANSFERENCIA' ? 'Conta de origem' : 'Conta ou cartão'}</Text>
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
                {contas.length === 0 && cartoes.length === 0 ? (
                  <Text style={styles.muted}>Cadastre uma conta no Início ou um cartão em Cartões.</Text>
                ) : null}
              </View>

              {tipo === 'TRANSFERENCIA' ? (
                <>
                  <Text style={styles.label}>Conta de destino</Text>
                  <View style={styles.chips}>
                    {contasDestino.map((c) => (
                      <Chip key={c.id} label={c.nome} selected={destinoId === c.id} onPress={() => setDestinoId(c.id)} />
                    ))}
                    {contasDestino.length === 0 ? (
                      <Text style={styles.muted}>Você precisa de pelo menos duas contas para transferir.</Text>
                    ) : null}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Data</Text>
              <View style={styles.chips}>
                <Chip label="Hoje" selected={dataOpcao === 'hoje'} onPress={() => setDataOpcao('hoje')} />
                <Chip label="Ontem" selected={dataOpcao === 'ontem'} onPress={() => setDataOpcao('ontem')} />
                <Chip label="Outra data" selected={dataOpcao === 'outra'} onPress={() => setDataOpcao('outra')} />
              </View>
              {dataOpcao === 'outra' ? (
                <Input
                  placeholder="DD/MM/AAAA"
                  value={dataTexto}
                  onChangeText={(t) => setDataTexto(maskDateBR(t))}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              ) : null}

              <Text style={styles.label}>Repetição</Text>
              <View style={styles.chips}>
                <Chip label="Não repetir" selected={repeticao === 'nao'} onPress={() => setRepeticao('nao')} />
                <Chip label="Repetir mensalmente" selected={repeticao === 'mensal'} onPress={() => setRepeticao('mensal')} />
                {origem?.kind === 'cartao' && tipo === 'DESPESA' ? (
                  <Chip label="Parcelar" selected={repeticao === 'parcelado'} onPress={() => setRepeticao('parcelado')} />
                ) : null}
              </View>
              {repeticao === 'parcelado' ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {PARCELAS.map((n) => (
                      <Chip key={n} label={`${n}x`} selected={parcelas === n} onPress={() => setParcelas(n)} />
                    ))}
                  </ScrollView>
                  {valor > 0 ? (
                    <Text style={styles.muted}>
                      {parcelas}x de {formatCurrency(valor / parcelas)} nas próximas faturas
                    </Text>
                  ) : null}
                </>
              ) : null}
              {repeticao === 'mensal' ? (
                <Text style={styles.muted}>
                  Serão criados {OCORRENCIAS_RECORRENTES} lançamentos mensais. Os futuros ficam como pendentes.
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Botão fixo inferior */}
        <View style={styles.footer}>
          <PrimaryButton title="Salvar Lançamento" onPress={salvar} loading={saving} color={cor} icon="checkmark" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: spacing.lg },
  amountBox: { alignItems: 'center', paddingVertical: spacing.xl },
  amountLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  amount: { fontSize: 44, fontWeight: '800', textAlign: 'center' },
  amountInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, color: 'transparent', opacity: 0.02, fontSize: 44 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  catItem: {
    width: '31.5%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    gap: 4,
  },
  catIcon: { fontSize: 24 },
  catName: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },
  muted: { color: colors.textMuted, fontSize: 12 },
  quemBox: { marginBottom: spacing.sm },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  detailsTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  details: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
