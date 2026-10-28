export type NomeTema = 'escuro' | 'claro';

const ESCURO = {
  background: '#0A0A0A',
  card: '#141414',
  border: '#1E1E1E',
  input: '#2A2A2A',
  text: '#FFFFFF',
  textSecondary: '#A0A0A0',
  textMuted: '#718096',
  primary: '#3182CE',
  success: '#38A169',
  danger: '#E53E3E',
  warning: '#DD6B20',
  gold: '#D69E2E',
  overlay: 'rgba(0,0,0,0.7)',
  /** Texto/ícones sobre fundos coloridos (botões, chips selecionados, cartões). */
  onAccent: '#FFFFFF',
};

const CLARO: typeof ESCURO = {
  background: '#F4F5F7',
  card: '#FFFFFF',
  border: '#E2E8F0',
  input: '#CBD5E0',
  text: '#1A202C',
  textSecondary: '#4A5568',
  textMuted: '#718096',
  primary: '#2B6CB0',
  success: '#2F855A',
  danger: '#C53030',
  warning: '#C05621',
  gold: '#B7791F',
  overlay: 'rgba(0,0,0,0.45)',
  onAccent: '#FFFFFF',
};

/**
 * Paleta ativa. É um objeto mutável: aplicarTema() troca os valores ANTES
 * de as telas serem carregadas (ver src/Root.tsx), porque os estilos são
 * criados com StyleSheet.create quando cada módulo é avaliado. Por isso a
 * troca de tema exige recarregar o app.
 */
export const colors = { ...ESCURO };

export let temaAtivo: NomeTema = 'escuro';

export function aplicarTema(tema: NomeTema) {
  Object.assign(colors, tema === 'claro' ? CLARO : ESCURO);
  temaAtivo = tema;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const CARD_COLORS = ['#3182CE', '#805AD5', '#38A169', '#E53E3E', '#DD6B20', '#D69E2E', '#2D3748', '#000000'];
export const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Diners', 'Outra'];
export const META_ICONES = ['🎯', '🛟', '✈️', '🚗', '🏠', '💍', '🎓', '💻', '🎁', '🏖️'];
export const PESSOA_CORES = ['#3182CE', '#D53F8C', '#38A169', '#DD6B20', '#805AD5', '#D69E2E'];
