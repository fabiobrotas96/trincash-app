import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Alert } from '../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ErrorBanner, Input, PrimaryButton, type IconName } from '../components/ui';
import { errorMessage, isSupabaseConfigured, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';

const SLIDES: { icon: IconName; color: string; title: string; text: string }[] = [
  {
    icon: 'flash',
    color: colors.primary,
    title: 'Organize suas finanças em segundos',
    text: 'Registre gastos e receitas rapidamente.',
  },
  {
    icon: 'card',
    color: colors.warning,
    title: 'Acompanhe seus cartões e não perca vencimentos',
    text: 'Alertas inteligentes e controle de limites.',
  },
  {
    icon: 'sparkles',
    color: colors.success,
    title: 'Sua IA e métricas pessoais para entender seus gastos',
    text: 'Resumos e insights para melhores decisões.',
  },
];

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const [slide, setSlide] = useState(0);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const [mode, setMode] = useState<Mode>('login');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slideWidth = width - spacing.xl * 2;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / slideWidth);
    if (idx !== slide) setSlide(idx);
  };

  const goToSlide = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * slideWidth, animated: true });
    setSlide(idx);
  };

  const handleSubmit = async () => {
    setError(null);
    const mail = email.trim().toLowerCase();
    if (!mail || !senha) {
      setError('Informe e-mail e senha.');
      return;
    }
    if (mode === 'signup') {
      if (!nome.trim()) {
        setError('Informe seu nome.');
        return;
      }
      if (senha.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
    }
    if (!isSupabaseConfigured) {
      setError('Supabase não configurado. Preencha o arquivo .env com base no .env.example.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password: senha });
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: mail,
          password: senha,
          options: { data: { nome: nome.trim() } },
        });
        if (err) throw err;
        if (!data.session) {
          Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação. Após confirmar, faça login.');
          setMode('login');
        }
      }
    } catch (err) {
      const msg = errorMessage(err);
      setError(msg === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const socialLogin = (provider: 'Apple' | 'Google') => {
    Alert.alert(
      `Entrar com ${provider}`,
      `Para habilitar o login com ${provider}, ative o provedor em Authentication > Providers no painel do Supabase e configure o deep link do app.`,
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>T</Text>
            </View>
            <Text style={styles.brand}>Trincash</Text>
          </View>

          {/* Carrossel de boas-vindas */}
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
            style={{ width: slideWidth }}
          >
            {SLIDES.map((s) => (
              <View key={s.title} style={[styles.slide, { width: slideWidth }]}>
                <View style={[styles.slideIcon, { backgroundColor: `${s.color}22` }]}>
                  <Ionicons name={s.icon} size={30} color={s.color} />
                </View>
                <Text style={styles.slideTitle}>{s.title}</Text>
                <Text style={styles.slideText}>{s.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <TouchableOpacity key={s.title} onPress={() => goToSlide(i)} hitSlop={6}>
                <View style={[styles.dot, i === slide && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Formulário */}
          <View style={styles.form}>
            <View style={styles.tabs}>
              {(['login', 'signup'] as Mode[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.tab, mode === m && styles.tabActive]}
                  onPress={() => {
                    setMode(m);
                    setError(null);
                  }}
                >
                  <Text style={[styles.tabText, mode === m && { color: colors.text }]}>
                    {m === 'login' ? 'Entrar' : 'Criar conta'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'signup' ? (
              <Input label="Nome" placeholder="Como devemos te chamar?" value={nome} onChangeText={setNome} autoCapitalize="words" />
            ) : null}
            <Input
              label="E-mail"
              placeholder="voce@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <View>
              <Input
                label="Senha"
                placeholder="••••••••"
                value={senha}
                onChangeText={setSenha}
                secureTextEntry={!showSenha}
                textContentType={mode === 'login' ? 'password' : 'newPassword'}
                style={{ paddingRight: 48 }}
              />
              <TouchableOpacity style={styles.eye} onPress={() => setShowSenha((v) => !v)} hitSlop={8}>
                <Ionicons name={showSenha ? 'eye-off' : 'eye'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {error ? <ErrorBanner message={error} /> : null}

            <PrimaryButton
              title={mode === 'login' ? 'Entrar' : 'Criar minha conta'}
              onPress={handleSubmit}
              loading={loading}
              style={{ marginTop: spacing.sm }}
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={[styles.social, { backgroundColor: '#FFFFFF' }]} onPress={() => socialLogin('Apple')}>
              <Ionicons name="logo-apple" size={20} color="#000" />
              <Text style={[styles.socialText, { color: '#000' }]}>Entrar com Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.social} onPress={() => socialLogin('Google')}>
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={styles.socialText}>Entrar com Google</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>
            Ao continuar, você concorda com nossos <Text style={styles.footerLink}>Termos de Uso</Text> e{' '}
            <Text style={styles.footerLink}>Política de Privacidade</Text>.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, paddingBottom: spacing.xxl },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: colors.onAccent, fontWeight: '800', fontSize: 20 },
  brand: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  slide: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    minHeight: 180,
  },
  slideIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  slideTitle: { color: colors.text, fontSize: 20, fontWeight: '800', lineHeight: 26 },
  slideText: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.input },
  dotActive: { width: 22, backgroundColor: colors.primary },
  form: { marginTop: spacing.xl },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { color: colors.textSecondary, fontWeight: '700' },
  eye: { position: 'absolute', right: 14, top: 38 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  divider: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 12 },
  social: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.input,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  socialText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  footer: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xl, lineHeight: 18 },
  footerLink: { color: colors.textSecondary, textDecorationLine: 'underline' },
});
