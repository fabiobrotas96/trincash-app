import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext } from 'react';
import { Appearance } from 'react-native';
import type { NomeTema } from '../theme';

/**
 * Preferências do app. Ficam no aparelho (AsyncStorage) porque tema,
 * biometria e notificações locais são de cada dispositivo.
 */
export interface Config {
  tema: 'escuro' | 'claro' | 'sistema';
  /** Mostra "R$ •••••" no lugar dos valores. */
  ocultarValores: boolean;
  /** Exige biometria (ou senha do aparelho) para abrir o app. */
  bloqueioBiometria: boolean;
  /** Minutos em segundo plano antes de bloquear de novo (0 = sempre). */
  bloqueioMinutos: number;
  notifFatura: boolean;
  /** Dias antes do vencimento para lembrar da fatura. */
  notifFaturaDias: number;
  notifOrcamento: boolean;
  notifPendentes: boolean;
  notifLembreteDiario: boolean;
  notifLembreteHora: number;
}

export const CONFIG_PADRAO: Config = {
  tema: 'escuro',
  ocultarValores: false,
  bloqueioBiometria: false,
  bloqueioMinutos: 0,
  notifFatura: true,
  notifFaturaDias: 3,
  notifOrcamento: true,
  notifPendentes: true,
  notifLembreteDiario: false,
  notifLembreteHora: 20,
};

const CHAVE = 'trincash:config';

export async function carregarConfig(): Promise<Config> {
  try {
    const raw = await AsyncStorage.getItem(CHAVE);
    return raw ? { ...CONFIG_PADRAO, ...(JSON.parse(raw) as Partial<Config>) } : CONFIG_PADRAO;
  } catch {
    return CONFIG_PADRAO;
  }
}

export async function salvarConfig(c: Config): Promise<void> {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(c));
}

/** Resolve "sistema" para o tema atual do aparelho. */
export function resolverTema(tema: Config['tema']): NomeTema {
  if (tema === 'sistema') return Appearance.getColorScheme() === 'light' ? 'claro' : 'escuro';
  return tema;
}

export interface ConfigContextValue {
  config: Config;
  atualizar: (parcial: Partial<Config>) => Promise<void>;
}

export const ConfigContext = createContext<ConfigContextValue>({
  config: CONFIG_PADRAO,
  atualizar: async () => undefined,
});

export const useConfig = () => useContext(ConfigContext);
