import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { errorMessage, getUserId, supabase } from '../../services/supabase';
import { colors, radius, spacing } from '../../theme';
import type { Bem, Pessoa, TipoBem } from '../../types';
import { formatCurrency, parseValor } from '../../utils/format';
import { DonoSelector, nomeDono } from '../Pessoas';
import { BottomSheet, Card, Chip, EmptyState, Input, LinkButton, PrimaryButton, SectionTitle } from '../ui';
import { FiltroDonoChips, filtrarPorDono, type FiltroDono } from './InvestimentosTab';
import { TIPOS_BEM, infoTipo } from './labels';

const fmt = (n: number) => (n ? String(n).replace('.', ',') : '');

export function BensTab({ pessoas, bens, reload }: { pessoas: Pessoa[]; bens: Bem[]; reload: () => void }) {
  const [filtro, setFiltro] = useState<FiltroDono>('todos');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Bem | null>(null);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoBem>('IMOVEL');
  const [dono, setDono] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [divida, setDivida] = useState('');
  const [saving, setSaving] = useState(false);

  const lista = filtrarPorDono(bens, pessoas, filtro);
  const totalValor = lista.reduce((a, b) => a + b.valor_estimado, 0);
  const totalDivida = lista.reduce((a, b) => a + b.saldo_devedor, 0);

  const abrir = (b?: Bem) => {
    setEditando(b ?? null);
    setNome(b?.nome ?? '');
    setTipo(b?.tipo ?? 'IMOVEL');
    setDono(b ? b.pessoa_id : filtro !== 'todos' && filtro !== 'casal' ? filtro : null);
    setValor(fmt(b?.valor_estimado ?? 0));
    setDivida(fmt(b?.saldo_devedor ?? 0));
    setModal(true);
  };

  const salvar = async () => {
    const v = parseValor(valor);
    const d = divida.trim() ? parseValor(divida) : 0;
    if (!nome.trim()) return Alert.alert('Atenção', 'Dê um nome ao bem (ex: Apartamento, Carro).');
    if (Number.isNaN(v) || v < 0) return Alert.alert('Atenção', 'Informe o valor estimado.');
    if (Number.isNaN(d) || d < 0) return Alert.alert('Atenção', 'Saldo devedor inválido.');
    setSaving(true);
    try {
      const campos = {
        nome: nome.trim(),
        tipo,
        pessoa_id: dono,
        valor_estimado: v,
        saldo_devedor: d,
        data_atualizacao: new Date().toISOString().slice(0, 10),
      };
      const { error } = editando
        ? await supabase.from('bens').update(campos).eq('id', editando.id)
        : await supabase.from('bens').insert({ ...campos, usuario_id: await getUserId() });
      if (error) throw error;
      setModal(false);
      reload();
    } catch (err) {
      Alert.alert('Erro ao salvar bem', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const excluir = () => {
    if (!editando) return;
    Alert.alert('Excluir bem', `Excluir "${editando.nome}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('bens').delete().eq('id', editando.id);
          if (error) Alert.alert('Erro', errorMessage(error));
          else {
            setModal(false);
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
        <Text style={styles.label}>Bens (valor líquido)</Text>
        <Text style={styles.big}>{formatCurrency(totalValor - totalDivida)}</Text>
        <Text style={styles.muted}>
          Valor estimado {formatCurrency(totalValor)}
          {totalDivida > 0 ? ` • Dívidas ${formatCurrency(totalDivida)}` : ''}
        </Text>
      </Card>

      <SectionTitle title="Nossos bens" action={<LinkButton title="+ Bem" onPress={() => abrir()} />} />
      {lista.length === 0 ? (
        <Card>
          <EmptyState icon="home-outline" title="Nenhum bem cadastrado" message="Cadastre imóveis, veículos e outros bens para compor o patrimônio." />
        </Card>
      ) : (
        lista.map((b) => {
          const t = infoTipo(TIPOS_BEM, b.tipo);
          const pessoa = pessoas.find((p) => p.id === b.pessoa_id);
          return (
            <TouchableOpacity key={b.id} style={styles.item} onPress={() => abrir(b)} activeOpacity={0.7}>
              <View style={styles.icon}>
                <Text style={{ fontSize: 20 }}>{t.icone}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome} numberOfLines={1}>
                  {b.nome}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {t.label} • <Text style={{ color: pessoa?.cor ?? colors.primary }}>{nomeDono(pessoas, b.pessoa_id)}</Text>
                  {b.saldo_devedor > 0 ? ` • deve ${formatCurrency(b.saldo_devedor)}` : ''}
                </Text>
              </View>
              <Text style={styles.valor}>{formatCurrency(b.valor_estimado - b.saldo_devedor)}</Text>
            </TouchableOpacity>
          );
        })
      )}

      <BottomSheet visible={modal} title={editando ? 'Editar bem' : 'Novo bem'} onClose={() => setModal(false)}>
        <Input label="Nome" placeholder="Ex: Apartamento, Carro" value={nome} onChangeText={setNome} maxLength={80} />
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {TIPOS_BEM.map((t) => (
            <Chip key={t.value} label={`${t.icone} ${t.label}`} selected={tipo === t.value} onPress={() => setTipo(t.value)} />
          ))}
        </View>
        <Text style={styles.label}>De quem é?</Text>
        <DonoSelector pessoas={pessoas} value={dono} onChange={setDono} />
        <Input
          label="Valor estimado de mercado (R$)"
          placeholder="350.000,00"
          value={valor}
          onChangeText={(t) => setValor(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Input
          label="Saldo devedor / financiamento (R$)"
          placeholder="0,00"
          value={divida}
          onChangeText={(t) => setDivida(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
        />
        <Text style={styles.muted}>O bem entra no patrimônio pelo valor estimado menos o que ainda falta pagar.</Text>
        <PrimaryButton title="Salvar" onPress={salvar} loading={saving} style={{ marginTop: spacing.lg }} />
        {editando ? (
          <TouchableOpacity onPress={excluir} style={{ alignSelf: 'center', padding: spacing.md }}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Excluir bem</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 12 },
  big: { color: colors.text, fontSize: 28, fontWeight: '800' },
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
});
