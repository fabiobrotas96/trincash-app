import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import type { TransacaoDetalhada } from '../types';
import { formatCurrency } from '../utils/format';

export function valorColor(t: Pick<TransacaoDetalhada, 'tipo' | 'valor'>): string {
  if (t.tipo === 'TRANSFERENCIA') return colors.primary;
  return t.valor < 0 ? colors.danger : colors.success;
}

export function TransactionItem({
  item,
  onPress,
  onLongPress,
}: {
  item: TransacaoDetalhada;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const icone = item.categorias?.icone ?? (item.tipo === 'TRANSFERENCIA' ? '🔁' : '💸');
  const categoria = item.categorias?.nome ?? (item.tipo === 'TRANSFERENCIA' ? 'Transferência' : 'Sem categoria');
  const origem = item.contas?.nome ?? (item.cartoes_credito ? `💳 ${item.cartoes_credito.nome}` : '');
  const parcela = item.total_parcelas > 1 ? ` • ${item.numero_parcela}/${item.total_parcelas}` : '';
  const pendente = item.status === 'PENDENTE';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={styles.row}
    >
      <View style={styles.icon}>
        <Text style={{ fontSize: 20 }}>{icone}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.desc} numberOfLines={1}>
          {item.descricao || categoria}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {categoria}
          {origem ? ` • ${origem}` : ''}
          {parcela}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.valor, { color: valorColor(item) }]}>
          {formatCurrency(item.valor, { sign: true })}
        </Text>
        {pendente ? <Text style={styles.pendente}>Pendente</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  valor: { fontSize: 15, fontWeight: '700' },
  pendente: { color: colors.warning, fontSize: 11, fontWeight: '600', marginTop: 2 },
});
