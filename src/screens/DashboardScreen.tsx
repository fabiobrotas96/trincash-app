import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BottomSheet,
  Card,
  ErrorBanner,
  Input,
  LinkButton,
  Loading,
  PrimaryButton,
  ProgressBar,
  SectionTitle,
  SegmentedControl,
  type IconName,
} from '../components/ui';
import { BancoLogo, BancoSelector } from '../components/Logos';
import { PessoasEditor } from '../components/Pessoas';
import { bancoDe, detectarBanco } from '../services/bancos';
import { carregarPessoas, carregarStatusOrcamentos, type StatusOrcamento } from '../services/finance';
import { useConfig } from '../services/config';
import { notificarOrcamento } from '../services/notificacoes';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import type { Conta, Pessoa, TipoConta, TipoTransacao } from '../types';
import { formatCurrency, parseValor, toNumber } from '../utils/format';

const TIPO_CONTA_LABEL: Record<TipoConta, string> = {
  CORRENTE: 'Conta Corrente',
  POUPANCA: 'Poupança',
  DINHEIRO: 'Dinheiro',
};
const TIPO_CONTA_ICON: Record<TipoConta, IconName> = {
  CORRENTE: 'business',
  POUPANCA: 'trending-up',
  DINHEIRO: 'cash',
};

export default function DashboardScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { config, atualizar } = useConfig();
  const notifOrcamentoRef = useRef(config.notifOrcamento);
  notifOrcamentoRef.current = config.notifOrcamento;

  const [nome, setNome] = useState('');
  const [contas, setContas] = useState<Conta[]>([]);
  const [alertas, setAlertas] = useState<StatusOrcamento[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [patrimonioExtra, setPatrimonioExtra] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal nova conta
  const [modalVisible, setModalVisible] = useState(false);
  const [novaNome, setNovaNome] = useState('');
  const [novaSaldo, setNovaSaldo] = useState('');
  const [novaTipo, setNovaTipo] = useState<TipoConta>('CORRENTE');
  const [novaConjunta, setNovaConjunta] = useState(false);
  /** Banco escolhido no formulário (null = usar o reconhecido pelo nome). */
  const [novaBanco, setNovaBanco] = useState<string | null>(null);
  /** Conta em edição (null = criando uma nova). */
  const [contaEdit, setContaEdit] = useState<Conta | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const userId = await getUserId();
      const [perfilRes, contasRes, orcamentos, pessoasList, invRes, bensRes] = await Promise.all([
        supabase.from('usuarios').select('nome').eq('id', userId).maybeSingle(),
        supabase.from('contas').select('*').order('data_criacao', { ascending: true }),
        carregarStatusOrcamentos(),
        carregarPessoas(),
        supabase.from('investimentos').select('valor_atual'),
        supabase.from('bens').select('valor_estimado, saldo_devedor'),
      ]);
      if (perfilRes.error) throw perfilRes.error;
      if (contasRes.error) throw contasRes.error;
      if (invRes.error) throw invRes.error;
      if (bensRes.error) throw bensRes.error;
      setPessoas(pessoasList);
      setPatrimonioExtra(
        (invRes.data ?? []).reduce((a, i) => a + toNumber(i.valor_atual), 0) +
          (bensRes.data ?? []).reduce((a, b) => a + toNumber(b.valor_estimado) - toNumber(b.saldo_devedor), 0),
      );

      setNome((perfilRes.data?.nome as string | undefined) ?? '');
      setContas(((contasRes.data ?? []) as Conta[]).map((c) => ({ ...c, saldo: toNumber(c.saldo) })));

      const emAlerta = orcamentos.filter((o) => o.nivel !== 'ok');
      setAlertas(emAlerta);

      // Marca os alertas como enviados (exibidos) para o mês corrente.
      const novos = emAlerta.filter((o) => !o.orcamento.status_alerta_enviado);
      if (novos.length) {
        if (notifOrcamentoRef.current) {
          for (const o of novos) notificarOrcamento(o.categoria.nome, o.percentual).catch(() => undefined);
        }
        await supabase
          .from('orcamentos_categorias')
          .update({ status_alerta_enviado: true })
          .in('id', novos.map((o) => o.orcamento.id));
      }
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

  const saldoTotal = contas.reduce((acc, c) => acc + c.saldo, 0);
  const positivo = saldoTotal >= 0;

  const irParaNovo = (tipo: TipoTransacao) =>
    navigation.navigate('Tabs', { screen: 'Novo', params: { tipo, nonce: Date.now() } });

  const abrirModal = () => {
    setNovaNome('');
    setNovaSaldo('');
    setNovaTipo('CORRENTE');
    setNovaConjunta(false);
    setNovaBanco(null);
    setContaEdit(null);
    setModalVisible(true);
  };

  const editarConta = (conta: Conta) => {
    setNovaNome(conta.nome);
    setNovaSaldo(String(conta.saldo).replace('.', ','));
    setNovaTipo(conta.tipo);
    setNovaConjunta(!!conta.conjunta);
    setNovaBanco(conta.banco_codigo);
    setContaEdit(conta);
    setModalVisible(true);
  };

  const criarConta = async () => {
    const nomeConta = novaNome.trim();
    if (!nomeConta) {
      Alert.alert('Atenção', 'Informe o nome da conta.');
      return;
    }
    const saldo = novaSaldo.trim() ? parseValor(novaSaldo) : 0;
    if (Number.isNaN(saldo)) {
      Alert.alert('Atenção', 'Saldo inicial inválido. Use números, ex: 1500,00');
      return;
    }
    setSaving(true);
    try {
      const banco_codigo = novaBanco ?? (novaTipo === 'DINHEIRO' ? null : detectarBanco(nomeConta));
      const campos = { nome: nomeConta, saldo, tipo: novaTipo, conjunta: novaConjunta, banco_codigo };
      const { error: err } = contaEdit
        ? await supabase.from('contas').update(campos).eq('id', contaEdit.id)
        : await supabase.from('contas').insert({ ...campos, usuario_id: await getUserId() });
      if (err) throw err;
      setModalVisible(false);
      await load();
    } catch (err) {
      Alert.alert(contaEdit ? 'Erro ao salvar conta' : 'Erro ao criar conta', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluirConta = () => {
    if (!contaEdit) return;
    Alert.alert(
      'Excluir conta',
      `Excluir "${contaEdit.nome}"? Todos os lançamentos dela também serão apagados. Isso não pode ser desfeito.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.from('contas').delete().eq('id', contaEdit.id);
            if (err) return Alert.alert('Erro ao excluir conta', errorMessage(err));
            setModalVisible(false);
            load();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const quickActions: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: 'Receita', icon: 'arrow-down', color: colors.success, onPress: () => irParaNovo('RECEITA') },
    { label: 'Despesa', icon: 'arrow-up', color: colors.danger, onPress: () => irParaNovo('DESPESA') },
    { label: 'Transferir', icon: 'swap-horizontal', color: colors.primary, onPress: () => irParaNovo('TRANSFERENCIA') },
    { label: 'Cartões', icon: 'card', color: colors.warning, onPress: () => navigation.navigate('Tabs', { screen: 'Cartoes' }) },
    { label: 'Patrimônio', icon: 'diamond-outline', color: colors.gold, onPress: () => navigation.navigate('Patrimonio') },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greetingSmall}>Bem-vindo de volta</Text>
            <Text style={styles.greeting} numberOfLines={1}>
              Olá, {nome || 'você'}!
            </Text>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('Configuracoes')} accessibilityLabel="Configurações">
            <Text style={styles.avatarText}>{(nome || '?').charAt(0).toUpperCase()}</Text>
            <View style={styles.logoutBadge}>
              <Ionicons name="settings-outline" size={11} color={colors.text} />
            </View>
          </TouchableOpacity>
        </View>

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {/* Saldo consolidado */}
        <Card style={styles.balanceCard}>
          <View style={styles.rowBetween}>
            <TouchableOpacity
              style={styles.olho}
              onPress={() => atualizar({ ocultarValores: !config.ocultarValores })}
              hitSlop={8}
              accessibilityLabel={config.ocultarValores ? 'Mostrar valores' : 'Ocultar valores'}
            >
              <Text style={styles.balanceLabel}>Saldo consolidado</Text>
              <Ionicons name={config.ocultarValores ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            <View style={[styles.statusPill, { backgroundColor: positivo ? 'rgba(56,161,105,0.15)' : 'rgba(229,62,62,0.15)' }]}>
              <View style={[styles.statusDot, { backgroundColor: positivo ? colors.success : colors.danger }]} />
              <Text style={{ color: positivo ? colors.success : colors.danger, fontWeight: '700', fontSize: 12 }}>
                {positivo ? 'No verde' : 'No vermelho'}
              </Text>
            </View>
          </View>
          <Text style={styles.balance}>{formatCurrency(saldoTotal)}</Text>
          <Text style={styles.balanceSub}>
            {contas.length} {contas.length === 1 ? 'conta' : 'contas'} cadastrada{contas.length === 1 ? '' : 's'}
          </Text>
          <TouchableOpacity style={styles.extratoBtn} onPress={() => navigation.navigate('ExtratoDetalhe', {})}>
            <Text style={styles.extratoBtnText}>Ver extrato consolidado →</Text>
          </TouchableOpacity>
        </Card>

        {/* Ações rápidas */}
        <View style={styles.actions}>
          {quickActions.map((a) => (
            <TouchableOpacity key={a.label} style={styles.action} onPress={a.onPress} activeOpacity={0.7}>
              <View style={[styles.actionIcon, { backgroundColor: `${a.color}22` }]}>
                <Ionicons name={a.icon} size={22} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Patrimônio */}
        <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Patrimonio')}>
          <Card style={styles.patrimonioCard}>
            <Ionicons name="diamond-outline" size={22} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>Patrimônio total</Text>
              <Text style={styles.patrimonioValor}>{formatCurrency(saldoTotal + patrimonioExtra)}</Text>
              <Text style={styles.balanceSub}>Contas + investimentos + bens</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Card>
        </TouchableOpacity>

        {/* Alertas de orçamento */}
        {alertas.length > 0 ? (
          <>
            <SectionTitle title="Alertas de orçamento" />
            {alertas.map((a) => {
              const estourado = a.nivel === 'estourado';
              const cor = estourado ? colors.danger : colors.warning;
              return (
                <Card key={a.orcamento.id} style={[styles.alertCard, { borderColor: `${cor}66` }]}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.alertTitle}>
                      {a.categoria.icone} {a.categoria.nome}
                    </Text>
                    <Text style={{ color: cor, fontWeight: '800' }}>{Math.round(a.percentual * 100)}%</Text>
                  </View>
                  <ProgressBar progress={a.percentual} color={cor} />
                  <Text style={styles.alertText}>
                    {estourado
                      ? `Limite ultrapassado em ${formatCurrency(a.gasto - a.orcamento.limite_mensal)}. Evite novos gastos nesta categoria.`
                      : `Você já usou ${formatCurrency(a.gasto)} de ${formatCurrency(a.orcamento.limite_mensal)}. Restam ${formatCurrency(a.disponivelPorDia)}/dia até o fim do mês.`}
                  </Text>
                </Card>
              );
            })}
          </>
        ) : null}

        {/* Minhas contas */}
        <SectionTitle title="Minhas Contas" action={<LinkButton title="+ Adicionar" onPress={abrirModal} />} />
        {contas.length > 0 ? <Text style={styles.hint}>Segure uma conta para editar (nome, saldo, conjunta) ou excluir.</Text> : null}
        {contas.length === 0 ? (
          <Card style={{ alignItems: 'center', gap: spacing.sm }}>
            <Ionicons name="wallet-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhuma conta cadastrada ainda.</Text>
            <LinkButton title="Adicionar primeira conta" onPress={abrirModal} />
          </Card>
        ) : (
          contas.map((conta) => (
            <TouchableOpacity
              key={conta.id}
              activeOpacity={0.7}
              style={styles.accountCard}
              onPress={() => navigation.navigate('ExtratoDetalhe', { contaId: conta.id, contaNome: conta.nome })}
              onLongPress={() => editarConta(conta)}
            >
              {bancoDe(conta) && conta.tipo !== 'DINHEIRO' ? (
                <BancoLogo codigo={bancoDe(conta)} size={42} />
              ) : (
                <View style={styles.accountIcon}>
                  <Ionicons name={TIPO_CONTA_ICON[conta.tipo]} size={20} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName}>{conta.nome}</Text>
                <Text style={styles.accountType}>
                  {TIPO_CONTA_LABEL[conta.tipo]}
                  {conta.conjunta ? ' • 👥 Conjunta' : ''}
                </Text>
              </View>
              <Text style={[styles.accountBalance, conta.saldo < 0 && { color: colors.danger }]}>
                {formatCurrency(conta.saldo)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Modal nova conta */}
      <BottomSheet visible={modalVisible} title={contaEdit ? 'Editar conta' : 'Nova conta'} onClose={() => setModalVisible(false)}>
        <Input label="Nome da conta" placeholder="Ex: Nubank, Carteira" value={novaNome} onChangeText={setNovaNome} />
        {novaTipo !== 'DINHEIRO' ? (
          <BancoSelector value={novaBanco} onChange={setNovaBanco} reconhecido={detectarBanco(novaNome)} />
        ) : null}
        <Input
          label={contaEdit ? 'Saldo atual' : 'Saldo inicial'}
          placeholder="0,00"
          value={novaSaldo}
          onChangeText={(t) => setNovaSaldo(t.replace(/[^0-9.,-]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Text style={styles.modalLabel}>Tipo de conta</Text>
        <SegmentedControl
          options={[
            { label: 'Corrente', value: 'CORRENTE' },
            { label: 'Poupança', value: 'POUPANCA' },
            { label: 'Dinheiro', value: 'DINHEIRO' },
          ]}
          value={novaTipo}
          onChange={setNovaTipo}
        />
        <TouchableOpacity style={styles.toggleRow} onPress={() => setNovaConjunta((v) => !v)}>
          <Ionicons name={novaConjunta ? 'checkbox' : 'square-outline'} size={22} color={novaConjunta ? colors.primary : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Conta conjunta</Text>
            <Text style={styles.balanceSub}>Cada lançamento indica quem gastou ou se foi dividido</Text>
          </View>
        </TouchableOpacity>
        {novaConjunta ? (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.modalLabel}>Pessoas que dividem a conta</Text>
            <PessoasEditor
              pessoas={pessoas}
              onChange={() => carregarPessoas().then(setPessoas).catch(() => undefined)}
            />
          </View>
        ) : null}
        {contaEdit ? (
          <Text style={[styles.hint, { marginTop: spacing.md, marginBottom: 0 }]}>
            Alterar o saldo é um ajuste manual: não cria lançamento no extrato.
          </Text>
        ) : null}
        <PrimaryButton
          title={contaEdit ? 'Salvar alterações' : 'Criar conta'}
          onPress={criarConta}
          loading={saving}
          style={{ marginTop: spacing.xl }}
        />
        {contaEdit ? (
          <TouchableOpacity onPress={excluirConta} style={{ alignSelf: 'center', padding: spacing.md }}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir conta</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  greetingSmall: { color: colors.textSecondary, fontSize: 13 },
  greeting: { color: colors.text, fontSize: 26, fontWeight: '800' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontWeight: '800', fontSize: 18 },
  logoutBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  balanceCard: { padding: spacing.xl },
  balanceLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  balance: { color: colors.text, fontSize: 36, fontWeight: '800', marginTop: spacing.xs },
  balanceSub: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  extratoBtn: {
    marginTop: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.border,
    alignItems: 'center',
  },
  extratoBtnText: { color: colors.primary, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xl },
  action: { alignItems: 'center', flex: 1, gap: spacing.sm },
  actionIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  alertCard: { marginBottom: spacing.sm, gap: spacing.sm },
  alertTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  alertText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  emptyText: { color: colors.textSecondary },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  accountIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(49,130,206,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  accountType: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  accountBalance: { color: colors.text, fontSize: 15, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: -spacing.sm, marginBottom: spacing.sm },
  olho: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  patrimonioCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  patrimonioValor: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  toggleTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  modalLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
