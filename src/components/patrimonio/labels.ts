import type { TipoBem, TipoInvestimento, TipoRenda } from '../../types';

export const TIPOS_INVESTIMENTO: { value: TipoInvestimento; label: string; icone: string }[] = [
  { value: 'RENDA_FIXA', label: 'Renda fixa', icone: '🏦' },
  { value: 'TESOURO', label: 'Tesouro', icone: '🇧🇷' },
  { value: 'ACOES', label: 'Ações/ETF', icone: '📊' },
  { value: 'FII', label: 'FII', icone: '🏢' },
  { value: 'CRIPTO', label: 'Cripto', icone: '🪙' },
  { value: 'PREVIDENCIA', label: 'Previdência', icone: '🛟' },
  { value: 'OUTRO', label: 'Outro', icone: '💼' },
];

export const TIPOS_BEM: { value: TipoBem; label: string; icone: string }[] = [
  { value: 'IMOVEL', label: 'Imóvel', icone: '🏠' },
  { value: 'VEICULO', label: 'Veículo', icone: '🚗' },
  { value: 'TERRENO', label: 'Terreno', icone: '🌳' },
  { value: 'EMPRESA', label: 'Empresa', icone: '🏭' },
  { value: 'ELETRONICO', label: 'Eletrônico', icone: '💻' },
  { value: 'OUTRO', label: 'Outro', icone: '📦' },
];

export const TIPOS_RENDA: { value: TipoRenda; label: string; icone: string }[] = [
  { value: 'SALARIO', label: 'Salário', icone: '💼' },
  { value: 'PRO_LABORE', label: 'Pró-labore', icone: '🏭' },
  { value: 'FREELANCE', label: 'Freelance', icone: '💻' },
  { value: 'ALUGUEL', label: 'Aluguel', icone: '🏠' },
  { value: 'BENEFICIO', label: 'Benefício', icone: '🎁' },
  { value: 'OUTRO', label: 'Outra', icone: '💵' },
];

export function infoTipo<T extends string>(lista: { value: T; label: string; icone: string }[], v: T) {
  return lista.find((x) => x.value === v) ?? lista[lista.length - 1];
}
