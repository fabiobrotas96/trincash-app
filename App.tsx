import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { Session } from '@supabase/supabase-js';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading, type IconName } from './src/components/ui';
import CartoesScreen from './src/screens/CartoesScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ExtratoScreen from './src/screens/ExtratoScreen';
import LoginScreen from './src/screens/LoginScreen';
import NewTransactionScreen from './src/screens/NewTransactionScreen';
import RelatoriosMetasScreen from './src/screens/RelatoriosMetasScreen';
import { supabase } from './src/services/supabase';
import { colors } from './src/theme';
import type { RootStackParamList, TabParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
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
                <Ionicons name="add" size={26} color={colors.text} />
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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

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
    <SafeAreaProvider>
      <StatusBar style="light" />
      {initializing ? (
        <View style={styles.splash}>
          <Loading />
        </View>
      ) : (
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            {session ? (
              <>
                <Stack.Screen name="Tabs" component={MainTabs} />
                <Stack.Screen name="ExtratoDetalhe" component={ExtratoScreen} options={{ animation: 'slide_from_right' }} />
              </>
            ) : (
              <Stack.Screen name="Login" component={LoginScreen} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
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
