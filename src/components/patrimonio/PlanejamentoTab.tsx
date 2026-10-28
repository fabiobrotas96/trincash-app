import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import type { Plano, StatusObjetivo } from '../../services/patrimonio';
import { errorMessage, getUserId, supabase } from '../../services/supabase';
import { colors, radius, spacing } from '../../theme';
import type { Pessoa, Renda, TipoRenda } from '../../types';
import { formatCurrency, formatDateLong, maskDateBR, parseDateBR, parseValor, toISODate, today } from '../../utils/format';
import { PERFIL_IDS, PERFIS, type PerfilId } from '../../utils/investCalc';
import { DonoSelector, nomeDono } from '../Pessoas';
import { BottomSheet, Card, Chip, EmptyState, Input, LinkButton, PrimaryButton, ProgressBar, SectionTitle } from '../ui';
import { TIPOS_RENDA, infoTipo } from './labels';

const prazoTexto = (meses: number) => {
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  return [a ? `${a} ano${a > 1 ? 's' : ''}` : '', m ? `${m} ${m > 1 ? 'meses' : 'mês'}` : ''].filter(Boolean).join(' e ');
};

export function PlanejamentoTab({
  pessoas,
  rendas,
  objetivos,
  plano,
  mesesGasto,
  reload,
  onSimularObjetivo,
}: {
  pessoas: Pessoa[];
  rendas: Renda[];
  objetivos: StatusObjetivo[];
  plano: Plano;
  /** Quantos meses entraram na média de gastos. */
  mesesGasto: number;
  reload: () => void;
  onSimularObjetivo: (s: StatusObjetivo) => void;
}) {
  const [saving, setSaving] = useState(false);

  // Renda
  const [rendaModal, setRendaModal] = useState(false);
  const [rendaEdit, setRendaEdit] = useState<Renda | null>(null);
  const [rDesc, setRDesc] = useState('');
  const [rTipo, setRTipo] = useState<TipoRenda>('SALARIO');
  const [rDono, setRDono] = useState<string | null>(null);
  const [rValor, setRValor] = useState('');
  const [rAtiva, setRAtiva] = useState(true);

  // Objetivo
  const [objModal, setObjModal] = useState(false);
  const [oNome, setONome] = useState('');
  const [oDono, setODono] = useState<string | null>(null);
  const [oValor, setOValor] = useState('');
  const [oData, setOData] = useState('');
  const [oPerfil, setOPerfil] = useState<PerfilId>('CDB');
  /** Objetivo em edição (null = criando um novo). */
  const [objEdit, setObjEdit] = useState<StatusObjetivo | null>(null);

  const abrirRenda = (r?: Renda) => {
    setRendaEdit(r ?? null);
    setRDesc(r?.descricao ?? '');
    setRTipo(r?.tipo ?? 'SALARIO');
    setRDono(r ? r.pessoa_id : pessoas[0]?.id ?? null);
    setRValor(r ? String(r.valor_mensal).replace('.', ',') : '');
    setRAtiva(r?.ativa ?? true);
    setRendaModal(true);
  };

  const salvarRenda = async () => {
    const v = parseValor(rValor);
    if (Number.isNaN(v) || v <= 0) return Alert.alert('Atenção', 'Informe o valor mensal líquido.');
    const descricao = rDesc.trim() || infoTipo(TIPOS_RENDA, rTipo).label;
    setSaving(true);
    try {
      const campos = { descricao, tipo: rTipo, pessoa_id: rDono, valor_mensal: v, ativa: rAtiva };
      const { error } = rendaEdit
        ? await supabase.from('rendas').update(campos).eq('id', rendaEdit.id)
        : await supabase.from('rendas').insert({ ...campos, usuario_id: await getUserId() });
      if (error) throw error;
      setRendaModal(false);
      reload();
    } catch (err) {
      Alert.alert('Erro ao salvar renda', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluirRenda = () => {
    if (!rendaEdit) return;
    Alert.alert('Excluir renda', `Excluir "${rendaEdit.descricao}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('rendas').delete().eq('id', rendaEdit.id);
          if (error) Alert.alert('Erro', errorMessage(error));
          else {
            setRendaModal(false);
            reload();
          }
        },
      },
    ]);
  };

  const abrirObjetivo = () => {
    setONome('');
    setODono(null);
    setOValor('');
    const d = today();
    setOData(maskDateBR(`${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear() + 5}`));
    setOPerfil('CDB');
    setObjEdit(null);
    setObjModal(true);
  };

  const editarObjetivo = (st: StatusObjetivo) => {
    const o = st.objetivo;
    const [y, m, d] = o.data_alvo.split('-');
    setONome(o.nome);
    setODono(o.pessoa_id);
    setOValor(String(o.valor_alvo).replace('.', ','));
    setOData(`${d}/${m}/${y}`);
    setOPerfil(st.perfil);
    setObjEdit(st);
    setObjModal(true);
  };

  const salvarObjetivo = async () => {
    const v = parseValor(oValor);
    const data = parseDateBR(oData);
    if (!oNome.trim()) return Alert.alert('Atenção', 'Dê um nome ao objetivo (ex: Independência financeira).');
    if (Number.isNaN(v) || v <= 0) return Alert.alert('Atenção', 'Informe o patrimônio desejado.');
    if (!data || data <= today()) return Alert.alert('Atenção', 'Informe uma data futura (DD/MM/AAAA).');
    setSaving(true);
    try {
      const campos = { pessoa_id: oDono, nome: oNome.trim(), valor_alvo: v, data_alvo: toISODate(data), perfil: oPerfil };
      const { error } = objEdit
        ? await supabase.from('objetivos_patrimonio').update(campos).eq('id', objEdit.objetivo.id)
        : await supabase.from('objetivos_patrimonio').insert({ ...campos, usuario_id: await getUserId() });
      if (error) throw error;
      setObjModal(false);
      reload();
    } catch (err) {
      Alert.alert('Erro ao salvar objetivo', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluirObjetivo = (s: StatusObjetivo) => {
    Alert.alert('Excluir objetivo', `Excluir "${s.objetivo.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('objetivos_patrimonio').delete().eq('id', s.objetivo.id);
          if (error) Alert.alert('Erro', errorMessage(error));
          else {
            setObjModal(false);
            reload();
          }
        },
      },
    ]);
  };

  const acima = plano.folga < 0;
  const semRenda = plano.rendaTotal <= 0;

  return (
    <View>
      {/* Quanto podemos gastar */}
      <Card style={[styles.gastarCard, { borderColor: semRenda ? colors.border : acima ? `${colors.danger}66` : `${colors.success}66` }]}>
        <Text style={styles.label}>Vocês podem gastar por mês</Text>
        <Text style={[styles.big, { color: semRenda ? colors.textMuted : plano.podeGastar < 0 ? colors.danger : colors.text }]}>
          {formatCurrency(plano.podeGastar)}
        </Text>
        <Text style={styles.muted}>Renda menos os aportes necessários para os objetivos</Text>
        <View style={styles.divider} />
        <Linha label="Renda mensal" valor={formatCurrency(plano.rendaTotal)} cor={colors.success} />
        <Linha label="Aportes para objetivos" valor={`- ${formatCurrency(plano.aportesTotal)}`} cor={colors.gold} />
        <Linha
          label={`Gasto médio (${mesesGasto ? `últimos ${mesesGasto} ${mesesGasto > 1 ? 'meses' : 'mês'}` : 'sem histórico'})`}
          valor={formatCurrency(plano.gastoMedio)}
        />
        {semRenda ? (
          <Text style={styles.alerta}>Cadastre as rendas abaixo para calcular o limite de gastos.</Text>
        ) : (
          <View style={[styles.statusBox, { backgroundColor: acima ? 'rgba(229,62,62,0.12)' : 'rgba(56,161,105,0.12)' }]}>
            <Ionicons name={acima ? 'warning-outline' : 'checkmark-circle-outline'} size={18} color={acima ? colors.danger : colors.success} />
            <Text style={styles.statusText}>
              {acima
                ? `Os gastos estão ${formatCurrency(-plano.folga)}/mês acima do que permite atingir os objetivos no prazo. Reduza gastos, aumente a renda ou estenda o prazo.`
                : `Dentro do plano: sobram ${formatCurrency(plano.folga)}/mês além dos aportes.`}
            </Text>
          </View>
        )}
        {pessoas.length > 0 && !semRenda ? (
          <>
            <View style={styles.divider} />
            {plano.porPessoa.map((p) => (
              <View key={p.pessoa.id} style={styles.pessoaRow}>
                <View style={[styles.dot, { backgroundColor: p.pessoa.cor }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pessoaNome}>{p.pessoa.nome}</Text>
                  <Text style={styles.muted}>
                    Renda {formatCurrency(p.renda)} • aportes {formatCurrency(p.aportes)} • gasta {formatCurrency(p.gastoMedio)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.pessoaValor, p.gastoMedio > p.podeGastar && { color: colors.danger }]}>
                    {formatCurrency(p.podeGastar)}
                  </Text>
                  <Text style={styles.muted}>pode gastar</Text>
                </View>
              </View>
            ))}
            <Text style={styles.muted}>Rendas, aportes e gastos do casal são divididos igualmente entre as pessoas.</Text>
          </>
        ) : null}
      </Card>

      {/* Objetivos */}
      <SectionTitle title="Objetivos de patrimônio" action={<LinkButton title="+ Objetivo" onPress={abrirObjetivo} />} />
      {objetivos.length === 0 ? (
        <Card>
          <EmptyState icon="flag-outline" title="Nenhum objetivo" message="Ex: R$ 1 milhão até 2040. O app calcula quanto aportar por mês." />
        </Card>
      ) : (
        objetivos.map((s) => {
          const pessoa = pessoas.find((p) => p.id === s.objetivo.pessoa_id);
          return (
            <TouchableOpacity key={s.objetivo.id} activeOpacity={0.85} onPress={() => editarObjetivo(s)} onLongPress={() => excluirObjetivo(s)}>
              <Card style={styles.objCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.objNome}>{s.objetivo.nome}</Text>
                    <Text style={styles.muted}>
                      <Text style={{ color: pessoa?.cor ?? colors.primary }}>{nomeDono(pessoas, s.objetivo.pessoa_id)}</Text> • até{' '}
                      {formatDateLong(s.objetivo.data_alvo)} ({prazoTexto(s.meses)})
                    </Text>
                  </View>
                  <Text style={[styles.pct, { color: s.atingido ? colors.success : colors.gold }]}>{Math.round(s.progresso * 100)}%</Text>
                </View>
                <ProgressBar progress={s.progresso} color={s.atingido ? colors.success : colors.gold} height={10} />
                <Text style={styles.muted}>
                  {formatCurrency(s.atual)} de {formatCurrency(s.objetivo.valor_alvo)}
                </Text>
                <View style={styles.aporteBox}>
                  <Ionicons name={s.atingido ? 'trophy-outline' : 'calculator-outline'} size={16} color={s.atingido ? colors.success : colors.gold} />
                  <Text style={styles.aporteText}>
                    {s.atingido ? (
                      'Objetivo atingido! 🎉'
                    ) : (
                      <>
                        Aporte necessário: <Text style={{ color: colors.gold, fontWeight: '800' }}>{formatCurrency(s.aporteMensal)}/mês</Text> em{' '}
                        {PERFIS[s.perfil].nome}
                      </>
                    )}
                  </Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })
      )}
      {objetivos.length > 0 ? (
        <Text style={styles.hint}>Toque para editar ou simular • Segure para excluir. Só os investimentos rendem no cálculo; bens e contas ficam constantes.</Text>
      ) : null}

      {/* Rendas */}
      <SectionTitle title="Rendas mensais" action={<LinkButton title="+ Renda" onPress={() => abrirRenda()} />} />
      {rendas.length === 0 ? (
        <Card>
          <EmptyState icon="cash-outline" title="Nenhuma renda" message="Cadastre salários, freelas, aluguéis... (valores líquidos)." />
        </Card>
      ) : (
        rendas.map((r) => {
          const t = infoTipo(TIPOS_RENDA, r.tipo);
          const pessoa = pessoas.find((p) => p.id === r.pessoa_id);
          return (
            <TouchableOpacity key={r.id} style={[styles.item, !r.ativa && { opacity: 0.5 }]} onPress={() => abrirRenda(r)} activeOpacity={0.7}>
              <Text style={{ fontSize: 20 }}>{t.icone}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.objNome}>{r.descricao}</Text>
                <Text style={styles.muted}>
                  {t.label} • <Text style={{ color: pessoa?.cor ?? colors.primary }}>{nomeDono(pessoas, r.pessoa_id)}</Text>
                  {r.ativa ? '' : ' • pausada'}
                </Text>
              </View>
              <Text style={[styles.pessoaValor, { color: colors.success }]}>{formatCurrency(r.valor_mensal)}</Text>
            </TouchableOpacity>
          );
        })
      )}

      {/* Modal renda */}
      <BottomSheet visible={rendaModal} title={rendaEdit ? 'Editar renda' : 'Nova renda'} onClose={() => setRendaModal(false)}>
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {TIPOS_RENDA.map((t) => (
            <Chip key={t.value} label={`${t.icone} ${t.label}`} selected={rTipo === t.value} onPress={() => setRTipo(t.value)} />
          ))}
        </View>
        <Input label="Descrição (opcional)" placeholder="Ex: Salário empresa X" value={rDesc} onChangeText={setRDesc} maxLength={80} />
        <Text style={styles.label}>De quem é?</Text>
        <DonoSelector pessoas={pessoas} value={rDono} onChange={setRDono} />
        <Input
          label="Valor mensal líquido (R$)"
          placeholder="5.000,00"
          value={rValor}
          onChangeText={(t) => setRValor(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        {rendaEdit ? (
          <View style={styles.chips}>
            <Chip label="Ativa" selected={rAtiva} onPress={() => setRAtiva(true)} color={colors.success} />
            <Chip label="Pausada" selected={!rAtiva} onPress={() => setRAtiva(false)} color={colors.warning} />
          </View>
        ) : null}
        <PrimaryButton title="Salvar" onPress={salvarRenda} loading={saving} style={{ marginTop: spacing.md }} />
        {rendaEdit ? (
          <TouchableOpacity onPress={excluirRenda} style={{ alignSelf: 'center', padding: spacing.md }}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir renda</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>

      {/* Modal objetivo */}
      <BottomSheet visible={objModal} title={objEdit ? 'Editar objetivo' : 'Novo objetivo de patrimônio'} onClose={() => setObjModal(false)}>
        <Input label="Nome" placeholder="Ex: Independência financeira" value={oNome} onChangeText={setONome} maxLength={80} />
        <Text style={styles.label}>De quem?</Text>
        <DonoSelector pessoas={pessoas} value={oDono} onChange={setODono} />
        <Text style={[styles.muted, { marginTop: -spacing.sm, marginBottom: spacing.md }]}>
          {oDono === null ? 'Considera o patrimônio total do casal.' : 'Considera o patrimônio da pessoa (próprio + metade do casal).'}
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Patrimônio desejado (R$)"
              placeholder="1.000.000"
              value={oValor}
              onChangeText={(t) => setOValor(t.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="Até" placeholder="DD/MM/AAAA" value={oData} onChangeText={(t) => setOData(maskDateBR(t))} keyboardType="number-pad" maxLength={10} />
          </View>
        </View>
        <Text style={styles.label}>Onde vão investir os aportes?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PERFIL_IDS.map((id) => (
            <Chip key={id} label={`${PERFIS[id].icone} ${PERFIS[id].nome}`} selected={oPerfil === id} onPress={() => setOPerfil(id)} color={colors.gold} />
          ))}
        </ScrollView>
        <PrimaryButton
          title={objEdit ? 'Salvar alterações' : 'Salvar objetivo'}
          onPress={salvarObjetivo}
          loading={saving}
          style={{ marginTop: spacing.md }}
        />
        {objEdit ? (
          <View style={styles.objAcoes}>
            <TouchableOpacity
              style={styles.objAcao}
              onPress={() => {
                setObjModal(false);
                onSimularObjetivo(objEdit);
              }}
            >
              <Ionicons name="calculator-outline" size={18} color={colors.gold} />
              <Text style={{ color: colors.gold, fontWeight: '700' }}>Abrir no simulador</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.objAcao} onPress={() => excluirObjetivo(objEdit)}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function Linha({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={[styles.linhaValor, cor ? { color: cor } : null]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
  big: { color: colors.text, fontSize: 32, fontWeight: '800' },
  gastarCard: { gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  linhaLabel: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  linhaValor: { color: colors.text, fontSize: 14, fontWeight: '700' },
  alerta: { color: colors.warning, fontSize: 12 },
  statusBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sm, alignItems: 'flex-start' },
  statusText: { color: colors.text, fontSize: 12, flex: 1, lineHeight: 17 },
  pessoaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pessoaNome: { color: colors.text, fontWeight: '700', fontSize: 14 },
  pessoaValor: { color: colors.text, fontWeight: '800', fontSize: 15 },
  objAcoes: { flexDirection: 'row', justifyContent: 'space-around', marginTop: spacing.md },
  objAcao: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  objCard: { gap: spacing.sm, marginBottom: spacing.sm },
  objNome: { color: colors.text, fontSize: 15, fontWeight: '700' },
  pct: { fontSize: 16, fontWeight: '800' },
  aporteBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.border, borderRadius: radius.sm, padding: spacing.sm },
  aporteText: { color: colors.textSecondary, fontSize: 12, flex: 1 },
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
});
