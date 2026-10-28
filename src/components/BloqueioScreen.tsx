import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { autenticar, infoBiometria } from '../services/biometria';
import { supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import { Alert } from '../utils/alert';
import { PrimaryButton } from './ui';

/** Tela de bloqueio: a sessão continua salva, só pede biometria para entrar. */
export function BloqueioScreen({ onDesbloquear }: { onDesbloquear: () => void }) {
  const [nome, setNome] = useState('biometria');
  const [tentando, setTentando] = useState(false);
  const pediu = useRef(false);

  const tentar = async () => {
    setTentando(true);
    try {
      if (await autenticar()) onDesbloquear();
    } finally {
      setTentando(false);
    }
  };

  // Pede a biometria automaticamente ao aparecer (uma vez).
  useEffect(() => {
    infoBiometria().then((i) => setNome(i.nome));
    if (!pediu.current) {
      pediu.current = true;
      tentar();
    }
  }, []);

  const sair = () => {
    Alert.alert('Sair da conta', 'Você precisará entrar com e-mail e senha de novo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>T</Text>
        </View>
        <Text style={styles.titulo}>Trincash bloqueado</Text>
        <Text style={styles.sub}>Use {nome} ou a senha do aparelho para continuar.</Text>
        <View style={styles.iconBox}>
          <Ionicons name={nome === 'Face ID' || nome === 'reconhecimento facial' ? 'scan-outline' : 'finger-print'} size={56} color={colors.primary} />
        </View>
        <PrimaryButton title={`Desbloquear com ${nome}`} onPress={tentar} loading={tentando} style={{ alignSelf: 'stretch' }} />
      </View>
      <TouchableOpacity onPress={sair} style={styles.sair}>
        <Text style={styles.sairText}>Entrar com outra conta</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  logoText: { color: colors.onAccent, fontWeight: '800', fontSize: 32 },
  titulo: { color: colors.text, fontSize: 22, fontWeight: '800' },
  sub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  iconBox: {
    width: 110,
    height: 110,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  sair: { alignSelf: 'center', padding: spacing.lg },
  sairText: { color: colors.textMuted, fontWeight: '600' },
});
