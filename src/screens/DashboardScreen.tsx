import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { carregarStatusOrcamentos, type StatusOrcamento } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import type { Conta, TipoConta, TipoTransacao } from '../types';
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

  const [nome, setNome] = useState('');
  const [contas, setContas] = useState<Conta[]>([]);
  const [alertas, setAlertas] = useState<StatusOrcamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal nova conta
  const [modalVisible, setModalVisible] = useState(false);
  const [novaNome, setNovaNome] = useState('');
  const [novaSaldo, setNovaSaldo] = useState('');
  const [novaTipo, setNovaTipo] = useState<TipoConta>('CORRENTE');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const userId = await getUserId();
      const [perfilRes, contasRes, orcamentos] = await Promise.all([
        supabase.from('usuarios').select('nome').eq('id', userId).maybeSingle(),
        supabase.from('contas').select('*').order('data_criacao', { ascending: true }),
        carregarStatusOrcamentos(),
      ]);
      if (perfilRes.error) throw perfilRes.error;
      if (contasRes.error) throw contasRes.error;

      setNome((perfilRes.data?.nome as string | undefined) ?? '');
      setContas(((contasRes.data ?? []) as Conta[]).map((c) => ({ ...c, saldo: toNumber(c.saldo) })));

      const emAlerta = orcamentos.filter((o) => o.nivel !== 'ok');
      setAlertas(emAlerta);

      // Marca os alertas como enviados (exibidos) para o mês corrente.
      const pendentes = emAlerta.filter((o) => !o.orcamento.status_alerta_enviado).map((o) => o.orcamento.id);
      if (pendentes.length) {
        await supabase.from('orcamentos_categorias').update({ status_alerta_enviado: true }).in('id', pendentes);
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

  const handleLogout = () => {
    Alert.alert('Sair', 'Deseja sair da sua conta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          const { error: err } = await supabase.auth.signOut();
          if (err) Alert.alert('Erro', errorMessage(err));
        },
      },
    ]);
  };

  const abrirModal = () => {
    setNovaNome('');
    setNovaSaldo('');
    setNovaTipo('CORRENTE');
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
      const usuario_id = await getUserId();
      const { error: err } = await supabase.from('contas').insert({ usuario_id, nome: nomeConta, saldo, tipo: novaTipo });
      if (err) throw err;
      setModalVisible(false);
      await load();
    } catch (err) {
      Alert.alert('Erro ao criar conta', errorMessage(err));
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

  const quickActions: { label: string; icon: IconName; color: string; onPress: () => void }[] = [
    { label: 'Receita', icon: 'arrow-down', color: colors.success, onPress: () => irParaNovo('RECEITA') },
    { label: 'Despesa', icon: 'arrow-up', color: colors.danger, onPress: () => irParaNovo('DESPESA') },
    { label: 'Transferir', icon: 'swap-horizontal', color: colors.primary, onPress: () => irParaNovo('TRANSFERENCIA') },
    { label: 'Cartões', icon: 'card', color: colors.warning, onPress: () => navigation.navigate('Tabs', { screen: 'Cartoes' }) },
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
          <TouchableOpacity style={styles.avatar} onPress={handleLogout} accessibilityLabel="Perfil e sair">
            <Text style={styles.avatarText}>{(nome || '?').charAt(0).toUpperCase()}</Text>
            <View style={styles.logoutBadge}>
              <Ionicons name="log-out-outline" size={11} color={colors.text} />
            </View>
          </TouchableOpacity>
        </View>

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {/* Saldo consolidado */}
        <Card style={styles.balanceCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.balanceLabel}>Saldo consolidado</Text>
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
            >
              <View style={styles.accountIcon}>
                <Ionicons name={TIPO_CONTA_ICON[conta.tipo]} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName}>{conta.nome}</Text>
                <Text style={styles.accountType}>{TIPO_CONTA_LABEL[conta.tipo]}</Text>
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
      <BottomSheet visible={modalVisible} title="Nova conta" onClose={() => setModalVisible(false)}>
        <Input label="Nome da conta" placeholder="Ex: Nubank, Carteira" value={novaNome} onChangeText={setNovaNome} />
        <Input
          label="Saldo inicial"
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
        <PrimaryButton title="Criar conta" onPress={criarConta} loading={saving} style={{ marginTop: spacing.xl }} />
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
  modalLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
