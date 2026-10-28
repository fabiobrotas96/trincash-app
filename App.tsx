import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BloqueioScreen } from './src/components/BloqueioScreen';
import { Loading, type IconName } from './src/components/ui';
import CartoesScreen from './src/screens/CartoesScreen';
import ConfiguracoesScreen from './src/screens/ConfiguracoesScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ExtratoScreen from './src/screens/ExtratoScreen';
import LoginScreen from './src/screens/LoginScreen';
import NewTransactionScreen from './src/screens/NewTransactionScreen';
import PatrimonioScreen from './src/screens/PatrimonioScreen';
import RelatoriosMetasScreen from './src/screens/RelatoriosMetasScreen';
import { ConfigContext, salvarConfig, type Config } from './src/services/config';
import { reagendar } from './src/services/notificacoes';
import { supabase } from './src/services/supabase';
import { colors, temaAtivo } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/types';
import { definirOcultarValores } from './src/utils/format';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const baseTheme = temaAtivo === 'claro' ? DefaultTheme : DarkTheme;
const navTheme: Theme = {
  ...baseTheme,
  colors: {
    ...baseTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

const TAB_ICONS: Record<keyof TabParamList, [IconName, IconName]> = {
  Inicio: ['home', 'home-outline'],
  Extrato: ['list', 'list-outline'],
  Novo: ['add', 'add'],
  Cartoes: ['card', 'card-outline'],
  Relatorios: ['pie-chart', 'pie-chart-outline'],
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const [active, inactive] = TAB_ICONS[route.name];
          if (route.name === 'Novo') {
            return (
              <View style={styles.novoBtn}>
                <Ionicons name="add" size={26} color={colors.onAccent} />
              </View>
            );
          }
          return <Ionicons name={focused ? active : inactive} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={DashboardScreen} options={{ title: 'Início' }} />
      <Tab.Screen name="Extrato" component={ExtratoScreen} options={{ title: 'Extrato' }} />
      <Tab.Screen name="Novo" component={NewTransactionScreen} options={{ title: 'Novo +' }} />
      <Tab.Screen name="Cartoes" component={CartoesScreen} options={{ title: 'Cartões' }} />
      <Tab.Screen name="Relatorios" component={RelatoriosMetasScreen} options={{ title: 'Relatórios & Metas' }} />
    </Tab.Navigator>
  );
}

/** Campos que mudam o que está agendado como notificação. */
const CAMPOS_NOTIFICACAO: (keyof Config)[] = ['notifFatura', 'notifFaturaDias', 'notifPendentes', 'notifLembreteDiario', 'notifLembreteHora'];

export default function App({ configInicial }: { configInicial: Config }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [config, setConfig] = useState<Config>(configInicial);
  // Com a biometria ativa, o app abre bloqueado (a sessão continua salva).
  const [bloqueado, setBloqueado] = useState(configInicial.bloqueioBiometria);
  const configRef = useRef(config);
  configRef.current = config;

  const atualizar = useCallback(async (parcial: Partial<Config>) => {
    const nova = { ...configRef.current, ...parcial };
    setConfig(nova);
    await salvarConfig(nova);
    if ('ocultarValores' in parcial) definirOcultarValores(nova.ocultarValores);
    if (CAMPOS_NOTIFICACAO.some((k) => k in parcial)) reagendar(nova).catch(() => undefined);
  }, []);
  const ctx = useMemo(() => ({ config, atualizar }), [config, atualizar]);

  // Bloqueia de novo ao voltar do segundo plano, depois do tempo configurado.
  useEffect(() => {
    let saiuEm = 0;
    const sub = AppState.addEventListener('change', (estado) => {
      const c = configRef.current;
      if (estado === 'background') saiuEm = Date.now();
      else if (estado === 'active' && saiuEm && c.bloqueioBiometria) {
        if (Date.now() - saiuEm >= c.bloqueioMinutos * 60_000) setBloqueado(true);
        saiuEm = 0;
      }
    });
    return () => sub.remove();
  }, []);

  // Reagenda as notificações ao entrar (os dados podem ter mudado em outro aparelho).
  useEffect(() => {
    if (session && !bloqueado) reagendar(configRef.current).catch(() => undefined);
  }, [session?.user.id, bloqueado]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setInitializing(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <ConfigContext.Provider value={ctx}>
      <SafeAreaProvider>
        <StatusBar style={temaAtivo === 'claro' ? 'dark' : 'light'} />
        {initializing ? (
          <View style={styles.splash}>
            <Loading />
          </View>
        ) : session && bloqueado && config.bloqueioBiometria ? (
          <BloqueioScreen onDesbloquear={() => setBloqueado(false)} />
        ) : (
          // A key remonta as telas quando "ocultar valores" muda, para reformatar tudo.
          <NavigationContainer key={config.ocultarValores ? 'ocultos' : 'visiveis'} theme={navTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              {session ? (
                <>
                  <Stack.Screen name="Tabs" component={MainTabs} />
                  <Stack.Screen name="ExtratoDetalhe" component={ExtratoScreen} options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="Patrimonio" component={PatrimonioScreen} options={{ animation: 'slide_from_right' }} />
                  <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ animation: 'slide_from_right' }} />
                </>
              ) : (
                <Stack.Screen name="Login" component={LoginScreen} />
              )}
            </Stack.Navigator>
          </NavigationContainer>
        )}
      </SafeAreaProvider>
    </ConfigContext.Provider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.background },
  novoBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -14,
    shadowColor: colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
