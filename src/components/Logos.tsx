import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BANDEIRA_SVG } from '../assets/bandeiras';
import { CODIGOS_POPULARES, bancoPorCodigo, buscarBancos, logoDoBanco } from '../services/bancos';
import { colors, radius, spacing } from '../theme';
import type { IconName } from './ui';

// ---------------------------------------------------------------------
// Logo do banco (com fallback para as iniciais ou um ícone)
// ---------------------------------------------------------------------

export function BancoLogo({
  codigo,
  size = 42,
  fallbackIcon = 'business',
}: {
  codigo: string | null | undefined;
  size?: number;
  fallbackIcon?: IconName;
}) {
  const logo = logoDoBanco(codigo);
  const banco = bancoPorCodigo(codigo);
  const box = { width: size, height: size, borderRadius: size * 0.28 };

  if (logo !== undefined) {
    return (
      <View style={[styles.logoBox, box]}>
        <Image source={logo} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={banco?.nome} />
      </View>
    );
  }
  if (banco) {
    const iniciais = banco.nome
      .split(/\s+/)
      .filter((p) => p.length > 2 || /^[A-Z0-9]+$/.test(p))
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
    return (
      <View style={[styles.iniciais, box]}>
        <Text style={[styles.iniciaisText, { fontSize: size * 0.36 }]}>{iniciais || banco.nome[0]}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.semBanco, box]}>
      <Ionicons name={fallbackIcon} size={size * 0.48} color={colors.primary} />
    </View>
  );
}

// ---------------------------------------------------------------------
// Logo da bandeira do cartão
// ---------------------------------------------------------------------

/** Proporção dos SVGs: 780 x 500. */
export function BandeiraLogo({ bandeira, width = 46 }: { bandeira: string; width?: number }) {
  const xml = BANDEIRA_SVG[bandeira] ?? BANDEIRA_SVG.Outra;
  return <SvgXml xml={xml} width={width} height={(width * 500) / 780} />;
}

// ---------------------------------------------------------------------
// Seletor de banco (atalhos + busca), para os formulários
// ---------------------------------------------------------------------

export function BancoSelector({
  value,
  onChange,
  reconhecido,
  label = 'Banco',
}: {
  value: string | null;
  onChange: (codigo: string | null) => void;
  /** Banco reconhecido pelo nome, sugerido quando nada foi escolhido. */
  reconhecido?: string | null;
  label?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const efetivo = value ?? reconhecido ?? null;
  const banco = bancoPorCodigo(efetivo);
  const resultados = useMemo(() => buscarBancos(busca), [busca]);

  const escolher = (codigo: string | null) => {
    onChange(codigo);
    setAberto(false);
    setBusca('');
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.atual} onPress={() => setAberto((v) => !v)} activeOpacity={0.7}>
        <BancoLogo codigo={efetivo} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={styles.atualNome}>{banco?.nome ?? 'Nenhum banco'}</Text>
          {banco && !value && reconhecido ? <Text style={styles.muted}>Reconhecido pelo nome • toque para trocar</Text> : null}
          {!banco ? <Text style={styles.muted}>Opcional • mostra o logo da instituição</Text> : null}
        </View>
        <Ionicons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      {aberto ? (
        <View style={styles.painel}>
          <View style={styles.populares}>
            {CODIGOS_POPULARES.slice(0, 15).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.popular, efetivo === c && { borderColor: colors.primary }]}
                onPress={() => escolher(c)}
                accessibilityLabel={bancoPorCodigo(c)?.nome}
              >
                <BancoLogo codigo={c} size={34} />
                <Text style={styles.popularNome} numberOfLines={1}>
                  {bancoPorCodigo(c)?.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.buscaBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar outro banco ou código"
              placeholderTextColor={colors.textMuted}
              style={styles.buscaInput}
              autoCorrect={false}
            />
          </View>
          {resultados.map((b) => (
            <TouchableOpacity key={b.codigo} style={styles.resultado} onPress={() => escolher(b.codigo)}>
              <BancoLogo codigo={b.codigo} size={30} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultadoNome} numberOfLines={1}>
                  {b.nome}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {b.codigo} • {b.nomeOficial}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          {busca.trim() && resultados.length === 0 ? <Text style={styles.muted}>Nenhum banco encontrado.</Text> : null}
          <TouchableOpacity style={styles.nenhum} onPress={() => escolher(null)}>
            <Text style={styles.nenhumText}>{reconhecido ? 'Usar o reconhecido pelo nome' : 'Sem banco (ex: dinheiro)'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Logos de banco têm fundo próprio; a caixa branca garante contraste nos dois temas.
  logoBox: { backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iniciais: { backgroundColor: colors.input, alignItems: 'center', justifyContent: 'center' },
  iniciaisText: { color: colors.text, fontWeight: '800' },
  semBanco: { backgroundColor: 'rgba(49,130,206,0.15)', alignItems: 'center', justifyContent: 'center' },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 11 },
  atual: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    padding: spacing.sm,
    paddingRight: spacing.md,
  },
  atualNome: { color: colors.text, fontWeight: '700', fontSize: 15 },
  painel: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  populares: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  popular: {
    width: '18%',
    minWidth: 58,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  popularNome: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },
  buscaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    marginTop: spacing.xs,
  },
  buscaInput: { flex: 1, color: colors.text, fontSize: 14 },
  resultado: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  resultadoNome: { color: colors.text, fontWeight: '600', fontSize: 14 },
  nenhum: { alignSelf: 'center', paddingVertical: spacing.sm },
  nenhumText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
});
