import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/alert';
import type { ResumoPessoas } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { PESSOA_CORES, colors, radius, spacing } from '../theme';
import type { Pessoa } from '../types';
import { formatCurrency } from '../utils/format';
import { Card, LinkButton, ProgressBar } from './ui';

// ---------------------------------------------------------------------
// Cadastro de pessoas (lista global do usuário)
// ---------------------------------------------------------------------

export function PessoasEditor({ pessoas, onChange }: { pessoas: Pessoa[]; onChange: () => void }) {
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);
  /** Pessoa sendo renomeada (toque no nome); null = adicionando. */
  const [editId, setEditId] = useState<string | null>(null);

  const adicionar = async () => {
    const n = nome.trim();
    if (!n) return;
    if (pessoas.some((p) => p.id !== editId && p.nome.toLowerCase() === n.toLowerCase())) {
      Alert.alert('Atenção', `${n} já está cadastrado(a).`);
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const { error } = await supabase.from('pessoas').update({ nome: n }).eq('id', editId);
        if (error) throw error;
      } else {
        const usuario_id = await getUserId();
        const cor = PESSOA_CORES[pessoas.length % PESSOA_CORES.length];
        const { error } = await supabase.from('pessoas').insert({ usuario_id, nome: n, cor });
        if (error) throw error;
      }
      setNome('');
      setEditId(null);
      onChange();
    } catch (err) {
      Alert.alert(editId ? 'Erro ao renomear' : 'Erro ao adicionar pessoa', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const alternarEdicao = (p: Pessoa) => {
    if (editId === p.id) {
      setEditId(null);
      setNome('');
    } else {
      setEditId(p.id);
      setNome(p.nome);
    }
  };

  const remover = (p: Pessoa) => {
    Alert.alert(
      'Remover pessoa',
      `Remover ${p.nome}? Os lançamentos dela continuam, mas ficam sem pessoa; investimentos passam a ser do casal.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('pessoas').delete().eq('id', p.id);
            if (error) Alert.alert('Erro', errorMessage(error));
            else onChange();
          },
        },
      ],
    );
  };

  return (
    <View>
      <View style={styles.chips}>
        {pessoas.map((p) => (
          <View key={p.id} style={[styles.pessoaChip, { borderColor: p.cor }, editId === p.id && { backgroundColor: `${p.cor}33` }]}>
            <TouchableOpacity onPress={() => alternarEdicao(p)} style={styles.nomeToque} accessibilityLabel={`Renomear ${p.nome}`}>
              <View style={[styles.dot, { backgroundColor: p.cor }]} />
              <Text style={styles.pessoaNome}>{p.nome}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => remover(p)} hitSlop={8} accessibilityLabel={`Remover ${p.nome}`}>
              <Ionicons name="close" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}
        {pessoas.length === 0 ? (
          <Text style={styles.muted}>Nenhuma pessoa cadastrada.</Text>
        ) : (
          <Text style={[styles.muted, { width: '100%' }]}>Toque no nome para renomear.</Text>
        )}
      </View>
      <View style={styles.addRow}>
        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder={editId ? 'Novo nome' : 'Nome (ex: Ana)'}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={adicionar}
          returnKeyType="done"
          maxLength={60}
        />
        <TouchableOpacity
          style={[styles.addBtn, (!nome.trim() || saving) && { opacity: 0.5 }]}
          onPress={adicionar}
          disabled={!nome.trim() || saving}
          accessibilityLabel={editId ? 'Salvar nome' : 'Adicionar pessoa'}
        >
          <Ionicons name={editId ? 'checkmark' : 'add'} size={22} color={colors.onAccent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------
// Seletor "Quem gastou?" para lançamentos compartilhados
// ---------------------------------------------------------------------

export interface Quem {
  pessoaId: string | null;
  dividido: boolean;
}

export function QuemSelector({
  pessoas,
  value,
  onChange,
}: {
  pessoas: Pessoa[];
  value: Quem;
  onChange: (q: Quem) => void;
}) {
  return (
    <View style={styles.chips}>
      {pessoas.map((p) => {
        const sel = !value.dividido && value.pessoaId === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.quemChip, sel && { backgroundColor: p.cor, borderColor: p.cor }]}
            onPress={() => onChange({ pessoaId: p.id, dividido: false })}
          >
            <View style={[styles.dot, { backgroundColor: sel ? colors.onAccent : p.cor }]} />
            <Text style={[styles.quemText, sel && { color: colors.onAccent }]}>{p.nome}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.quemChip, value.dividido && { backgroundColor: colors.primary, borderColor: colors.primary }]}
        onPress={() => onChange({ pessoaId: null, dividido: true })}
      >
        <Ionicons name="git-compare-outline" size={14} color={value.dividido ? colors.onAccent : colors.textSecondary} />
        <Text style={[styles.quemText, value.dividido && { color: colors.onAccent }]}>Dividido</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------
// Card "Gastos por pessoa"
// ---------------------------------------------------------------------

export function GastosPorPessoaCard({
  resumo,
  titulo,
  onGerenciar,
}: {
  resumo: ResumoPessoas;
  titulo: string;
  onGerenciar?: () => void;
}) {
  const max = Math.max(1, ...resumo.porPessoa.map((p) => p.total));
  const n = resumo.porPessoa.length;
  return (
    <Card style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.titulo}>{titulo}</Text>
        {onGerenciar ? <LinkButton title="Pessoas" onPress={onGerenciar} /> : null}
      </View>
      {n === 0 ? (
        <Text style={styles.muted}>Cadastre as pessoas que dividem esta conta para separar os gastos.</Text>
      ) : (
        resumo.porPessoa.map((g) => (
          <View key={g.pessoa.id} style={{ gap: 4 }}>
            <View style={styles.rowBetween}>
              <View style={styles.nomeRow}>
                <View style={[styles.dot, { backgroundColor: g.pessoa.cor }]} />
                <Text style={styles.pessoaNome}>{g.pessoa.nome}</Text>
              </View>
              <Text style={styles.valor}>{formatCurrency(g.total)}</Text>
            </View>
            <ProgressBar progress={g.total / max} color={g.pessoa.cor} height={6} />
            <Text style={styles.muted}>
              Próprios {formatCurrency(g.individual)}
              {g.parteDividida > 0
                ? ` + ${n === 2 ? 'metade' : `1/${n}`} dos divididos ${formatCurrency(g.parteDividida)}`
                : ''}
            </Text>
          </View>
        ))
      )}
      <View style={styles.footer}>
        <Text style={styles.muted}>Divididos: {formatCurrency(resumo.totalDividido)}</Text>
        {resumo.semPessoa > 0 ? <Text style={styles.muted}>Sem pessoa: {formatCurrency(resumo.semPessoa)}</Text> : null}
        <Text style={styles.muted}>Total: {formatCurrency(resumo.total)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  pessoaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    backgroundColor: colors.border,
  },
  nomeToque: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pessoaNome: { color: colors.text, fontWeight: '600', fontSize: 14 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muted: { color: colors.textMuted, fontSize: 12 },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    height: 46,
    fontSize: 15,
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.input,
    backgroundColor: colors.border,
  },
  quemText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  card: { gap: spacing.md, marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titulo: { color: colors.text, fontWeight: '700', fontSize: 15 },
  nomeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valor: { color: colors.text, fontWeight: '800', fontSize: 15 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
});

// ---------------------------------------------------------------------
// Seletor de dono: uma pessoa ou o casal (null)
// ---------------------------------------------------------------------

export function DonoSelector({
  pessoas,
  value,
  onChange,
}: {
  pessoas: Pessoa[];
  value: string | null;
  onChange: (pessoaId: string | null) => void;
}) {
  return (
    <View style={styles.chips}>
      {pessoas.map((p) => {
        const sel = value === p.id;
        return (
          <TouchableOpacity
            key={p.id}
            style={[styles.quemChip, sel && { backgroundColor: p.cor, borderColor: p.cor }]}
            onPress={() => onChange(p.id)}
          >
            <View style={[styles.dot, { backgroundColor: sel ? colors.onAccent : p.cor }]} />
            <Text style={[styles.quemText, sel && { color: colors.onAccent }]}>{p.nome}</Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[styles.quemChip, value === null && { backgroundColor: colors.primary, borderColor: colors.primary }]}
        onPress={() => onChange(null)}
      >
        <Ionicons name="people" size={14} color={value === null ? colors.onAccent : colors.textSecondary} />
        <Text style={[styles.quemText, value === null && { color: colors.onAccent }]}>
          {pessoas.length ? 'Casal' : 'Conjunto'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/** Nome do dono para exibição. */
export function nomeDono(pessoas: Pick<Pessoa, 'id' | 'nome'>[], pessoaId: string | null): string {
  return pessoas.find((p) => p.id === pessoaId)?.nome ?? (pessoas.length ? 'Casal' : 'Conjunto');
}
