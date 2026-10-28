import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { errorMessage, getUserId, supabase } from '../../services/supabase';
import { colors, radius, spacing } from '../../theme';
import type { Conta, Investimento, Pessoa, TipoInvestimento } from '../../types';
import { formatCurrency, formatDateLong, parseValor } from '../../utils/format';
import { PERFIL_POR_TIPO, type PerfilId } from '../../utils/investCalc';
import { DonoSelector, nomeDono } from '../Pessoas';
import { BottomSheet, Card, Chip, EmptyState, Input, LinkButton, PrimaryButton, SectionTitle, SegmentedControl } from '../ui';
import { TIPOS_INVESTIMENTO, infoTipo } from './labels';

export type InvestimentoComAportes = Investimento & { aportado: number };
export type FiltroDono = 'todos' | 'casal' | string;

export function filtrarPorDono<T extends { pessoa_id: string | null }>(itens: T[], pessoas: Pessoa[], filtro: FiltroDono): T[] {
  if (filtro === 'todos') return itens;
  const ehPessoa = (id: string | null) => !!id && pessoas.some((p) => p.id === id);
  if (filtro === 'casal') return itens.filter((i) => !ehPessoa(i.pessoa_id));
  return itens.filter((i) => i.pessoa_id === filtro);
}

export function FiltroDonoChips({
  pessoas,
  value,
  onChange,
}: {
  pessoas: Pessoa[];
  value: FiltroDono;
  onChange: (f: FiltroDono) => void;
}) {
  return (
    <View style={styles.chips}>
      <Chip label="Todos" selected={value === 'todos'} onPress={() => onChange('todos')} />
      {pessoas.map((p) => (
        <Chip key={p.id} label={p.nome} color={p.cor} selected={value === p.id} onPress={() => onChange(p.id)} />
      ))}
      {pessoas.length ? <Chip label="Casal" selected={value === 'casal'} onPress={() => onChange('casal')} /> : null}
    </View>
  );
}

type Acao = 'APORTE' | 'RESGATE' | 'ATUALIZAR';

export function InvestimentosTab({
  pessoas,
  contas,
  investimentos,
  reload,
  onSimular,
}: {
  pessoas: Pessoa[];
  contas: Conta[];
  investimentos: InvestimentoComAportes[];
  reload: () => void;
  onSimular: (perfil: PerfilId, inicial: number) => void;
}) {
  const [filtro, setFiltro] = useState<FiltroDono>('todos');
  const [saving, setSaving] = useState(false);

  // Novo investimento
  const [novoModal, setNovoModal] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoInvestimento>('RENDA_FIXA');
  const [instituicao, setInstituicao] = useState('');
  const [dono, setDono] = useState<string | null>(null);
  const [valorInicial, setValorInicial] = useState('');
  const [contaDebito, setContaDebito] = useState<string | null>(null);
  /** Investimento cujos dados estão sendo editados (null = criando um novo). */
  const [invEdit, setInvEdit] = useState<InvestimentoComAportes | null>(null);

  // Movimentar
  const [sel, setSel] = useState<InvestimentoComAportes | null>(null);
  const [acao, setAcao] = useState<Acao>('APORTE');
  const [valorMov, setValorMov] = useState('');
  const [contaMov, setContaMov] = useState<string | null>(null);

  const lista = filtrarPorDono(investimentos, pessoas, filtro);
  const total = lista.reduce((a, i) => a + i.valor_atual, 0);
  const aportado = lista.reduce((a, i) => a + i.aportado, 0);
  const rendimento = total - aportado;

  const porTipo = TIPOS_INVESTIMENTO.map((t) => ({
    ...t,
    total: lista.filter((i) => i.tipo === t.value).reduce((a, i) => a + i.valor_atual, 0),
  })).filter((t) => t.total > 0);

  const abrirNovo = () => {
    setNome('');
    setTipo('RENDA_FIXA');
    setInstituicao('');
    setDono(filtro !== 'todos' && filtro !== 'casal' ? filtro : null);
    setValorInicial('');
    setContaDebito(null);
    setInvEdit(null);
    setNovoModal(true);
  };

  const editarDados = (i: InvestimentoComAportes) => {
    setNome(i.nome);
    setTipo(i.tipo);
    setInstituicao(i.instituicao);
    setDono(i.pessoa_id);
    setInvEdit(i);
    setSel(null);
    setNovoModal(true);
  };

  const criar = async () => {
    const inicial = valorInicial.trim() ? parseValor(valorInicial) : 0;
    if (!nome.trim()) return Alert.alert('Atenção', 'Dê um nome ao investimento (ex: CDB Banco X).');
    if (Number.isNaN(inicial) || inicial < 0) return Alert.alert('Atenção', 'Valor inicial inválido.');
    setSaving(true);
    if (invEdit) {
      try {
        const { error } = await supabase
          .from('investimentos')
          .update({ nome: nome.trim(), tipo, instituicao: instituicao.trim(), pessoa_id: dono })
          .eq('id', invEdit.id);
        if (error) throw error;
        setNovoModal(false);
        reload();
      } catch (err) {
        Alert.alert('Erro ao salvar investimento', errorMessage(err));
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const usuario_id = await getUserId();
      const { data, error } = await supabase
        .from('investimentos')
        .insert({ usuario_id, pessoa_id: dono, nome: nome.trim(), tipo, instituicao: instituicao.trim(), valor_atual: 0 })
        .select('id')
        .single();
      if (error) throw error;
      if (inicial > 0) {
        const { error: e2 } = await supabase.rpc('movimentar_investimento', {
          p_investimento_id: (data as { id: string }).id,
          p_tipo: 'APORTE',
          p_valor: inicial,
          p_conta_id: contaDebito,
        });
        if (e2) throw e2;
      }
      setNovoModal(false);
      reload();
    } catch (err) {
      Alert.alert('Erro ao criar investimento', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const abrirMov = (i: InvestimentoComAportes) => {
    setSel(i);
    setAcao('APORTE');
    setValorMov('');
    setContaMov(null);
  };

  const confirmarMov = async () => {
    if (!sel) return;
    const v = parseValor(valorMov);
    if (Number.isNaN(v) || v < 0 || (acao !== 'ATUALIZAR' && v === 0)) return Alert.alert('Atenção', 'Informe um valor válido.');
    setSaving(true);
    try {
      if (acao === 'ATUALIZAR') {
        const { error } = await supabase
          .from('investimentos')
          .update({ valor_atual: v, data_atualizacao: new Date().toISOString().slice(0, 10) })
          .eq('id', sel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('movimentar_investimento', {
          p_investimento_id: sel.id,
          p_tipo: acao,
          p_valor: v,
          p_conta_id: contaMov,
        });
        if (error) throw error;
      }
      setSel(null);
      reload();
    } catch (err) {
      Alert.alert('Erro', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluir = (i: InvestimentoComAportes) => {
    Alert.alert('Excluir investimento', `Excluir "${i.nome}" e seu histórico? Lançamentos já feitos nas contas não são estornados.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('investimentos').delete().eq('id', i.id);
          if (error) Alert.alert('Erro', errorMessage(error));
          else {
            setSel(null);
            reload();
          }
        },
      },
    ]);
  };

  return (
    <View>
      <FiltroDonoChips pessoas={pessoas} value={filtro} onChange={setFiltro} />

      <Card style={{ gap: 4 }}>
        <Text style={styles.label}>Total investido {filtro === 'todos' ? '' : `• ${nomeDono(pessoas, filtro === 'casal' ? null : filtro)}`}</Text>
        <Text style={styles.big}>{formatCurrency(total)}</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.muted}>Aportado líquido {formatCurrency(aportado)}</Text>
          <Text style={[styles.muted, { color: rendimento >= 0 ? colors.success : colors.danger, fontWeight: '700' }]}>
            {formatCurrency(rendimento, { sign: true })}
            {aportado > 0 ? ` (${((rendimento / aportado) * 100).toFixed(1).replace('.', ',')}%)` : ''}
          </Text>
        </View>
        {porTipo.length > 1 ? (
          <View style={styles.alocacao}>
            {porTipo.map((t) => (
              <View key={t.value} style={[styles.alocItem, { flex: t.total }]}>
                <Text style={styles.alocText} numberOfLines={1}>
                  {t.icone} {Math.round((t.total / total) * 100)}%
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <SectionTitle title="Carteira" action={<LinkButton title="+ Investimento" onPress={abrirNovo} />} />
      {lista.length === 0 ? (
        <Card>
          <EmptyState icon="trending-up-outline" title="Nenhum investimento" message="Cadastre CDBs, Tesouro, ações, previdência e outros." />
        </Card>
      ) : (
        lista.map((i) => {
          const t = infoTipo(TIPOS_INVESTIMENTO, i.tipo);
          const rend = i.valor_atual - i.aportado;
          const pessoa = pessoas.find((p) => p.id === i.pessoa_id);
          return (
            <TouchableOpacity key={i.id} style={styles.item} onPress={() => abrirMov(i)} activeOpacity={0.7}>
              <View style={styles.icon}>
                <Text style={{ fontSize: 20 }}>{t.icone}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>
                  {i.nome}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {t.label}
                  {i.instituicao ? ` • ${i.instituicao}` : ''} •{' '}
                  <Text style={{ color: pessoa?.cor ?? colors.primary }}>{nomeDono(pessoas, i.pessoa_id)}</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.valor}>{formatCurrency(i.valor_atual)}</Text>
                <Text style={[styles.mini, { color: rend >= 0 ? colors.success : colors.danger }]}>
                  {formatCurrency(rend, { sign: true })}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })
      )}

      {/* Novo investimento */}
      <BottomSheet visible={novoModal} title={invEdit ? 'Editar investimento' : 'Novo investimento'} onClose={() => setNovoModal(false)}>
        <Input label="Nome" placeholder="Ex: CDB Banco X 110% CDI" value={nome} onChangeText={setNome} maxLength={80} />
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {TIPOS_INVESTIMENTO.map((t) => (
            <Chip key={t.value} label={`${t.icone} ${t.label}`} selected={tipo === t.value} onPress={() => setTipo(t.value)} />
          ))}
        </View>
        <Input label="Instituição (opcional)" placeholder="Ex: Nubank, XP" value={instituicao} onChangeText={setInstituicao} maxLength={80} />
        <Text style={styles.label}>De quem é?</Text>
        <DonoSelector pessoas={pessoas} value={dono} onChange={setDono} />
        {!invEdit ? (
          <>
            <Input
              label="Valor já investido (R$)"
              placeholder="0,00"
              value={valorInicial}
              onChangeText={(t) => setValorInicial(t.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
            />
            <Text style={styles.label}>Debitar de uma conta?</Text>
            <View style={styles.chips}>
              <Chip label="Não debitar" selected={contaDebito === null} onPress={() => setContaDebito(null)} />
              {contas.map((c) => (
                <Chip key={c.id} label={c.nome} selected={contaDebito === c.id} onPress={() => setContaDebito(c.id)} />
              ))}
            </View>
            <Text style={styles.muted}>Use "Não debitar" para investimentos que você já tinha antes do app.</Text>
          </>
        ) : (
          <Text style={styles.muted}>Para mudar o valor, use Aportar, Resgatar ou Atualizar saldo no investimento.</Text>
        )}
        <PrimaryButton
          title={invEdit ? 'Salvar alterações' : 'Salvar investimento'}
          onPress={criar}
          loading={saving}
          style={{ marginTop: spacing.lg }}
        />
      </BottomSheet>

      {/* Movimentar */}
      <BottomSheet visible={!!sel} title={sel?.nome ?? ''} onClose={() => setSel(null)}>
        {sel ? (
          <>
            <Text style={styles.big}>{formatCurrency(sel.valor_atual)}</Text>
            <Text style={[styles.muted, { marginBottom: spacing.lg }]}>
              {nomeDono(pessoas, sel.pessoa_id)} • atualizado em {formatDateLong(sel.data_atualizacao)}
            </Text>
            <SegmentedControl
              options={[
                { label: 'Aportar', value: 'APORTE' },
                { label: 'Resgatar', value: 'RESGATE' },
                { label: 'Atualizar saldo', value: 'ATUALIZAR' },
              ]}
              value={acao}
              onChange={setAcao}
            />
            <View style={{ height: spacing.lg }} />
            <Input
              label={acao === 'ATUALIZAR' ? 'Saldo atual informado pela instituição (R$)' : 'Valor (R$)'}
              placeholder="0,00"
              value={valorMov}
              onChangeText={(t) => setValorMov(t.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
            />
            {acao !== 'ATUALIZAR' ? (
              <>
                <Text style={styles.label}>{acao === 'APORTE' ? 'Debitar de uma conta?' : 'Creditar em uma conta?'}</Text>
                <View style={styles.chips}>
                  <Chip label="Nenhuma" selected={contaMov === null} onPress={() => setContaMov(null)} />
                  {contas.map((c) => (
                    <Chip key={c.id} label={c.nome} selected={contaMov === c.id} onPress={() => setContaMov(c.id)} />
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.muted}>Use para registrar rendimentos ou oscilações (ex: valor do extrato da corretora).</Text>
            )}
            <PrimaryButton title="Confirmar" onPress={confirmarMov} loading={saving} style={{ marginTop: spacing.lg }} />
            <View style={styles.acoes}>
              <TouchableOpacity
                style={styles.acao}
                onPress={() => {
                  const perfil = PERFIL_POR_TIPO[sel.tipo] ?? 'CDB';
                  const v = sel.valor_atual;
                  setSel(null);
                  onSimular(perfil, v);
                }}
              >
                <Ionicons name="calculator-outline" size={18} color={colors.gold} />
                <Text style={[styles.acaoText, { color: colors.gold }]}>Simular</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acao} onPress={() => editarDados(sel)}>
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={[styles.acaoText, { color: colors.primary }]}>Editar dados</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acao} onPress={() => excluir(sel)}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.acaoText, { color: colors.danger }]}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 12 },
  mini: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  big: { color: colors.text, fontSize: 28, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  alocacao: { flexDirection: 'row', gap: 3, marginTop: spacing.md, borderRadius: radius.sm, overflow: 'hidden' },
  alocItem: { backgroundColor: colors.input, paddingVertical: 6, paddingHorizontal: 4, minWidth: 44 },
  alocText: { color: colors.text, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  nome: { color: colors.text, fontSize: 15, fontWeight: '700' },
  valor: { color: colors.text, fontSize: 15, fontWeight: '800' },
  acoes: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.lg },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  acaoText: { fontWeight: '700' },
});
