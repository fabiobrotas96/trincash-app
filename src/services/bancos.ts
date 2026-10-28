/**
 * Bancos brasileiros e seus logos, a partir do pacote logos-bancos-br
 * (lista do Banco Central; logos do Open Finance / sites oficiais).
 * Os logos são marcas das instituições, usadas só para identificá-las.
 */
import dados from 'logos-bancos-br/data/bancos.json';
import logos from 'logos-bancos-br/react-native';

export interface Banco {
  /** COMPE com 4 dígitos, ex: '0260'. */
  codigo: string;
  nome: string;
  nomeOficial: string;
  temLogo: boolean;
}

/** Nomes curtos dos bancos mais usados (o nome oficial costuma ser longo). */
const NOMES_POPULARES: Record<string, string> = {
  '0260': 'Nubank',
  '0341': 'Itaú',
  '0237': 'Bradesco',
  '0001': 'Banco do Brasil',
  '0104': 'Caixa',
  '0033': 'Santander',
  '0077': 'Inter',
  '0336': 'C6 Bank',
  '0208': 'BTG Pactual',
  '0102': 'XP',
  '0380': 'PicPay',
  '0323': 'Mercado Pago',
  '0290': 'PagBank',
  '0536': 'Neon',
  '0756': 'Sicoob',
  '0748': 'Sicredi',
  '0041': 'Banrisul',
  '0422': 'Safra',
  '0623': 'Banco Pan',
  '0197': 'Stone',
  '0121': 'Agibank',
  '0318': 'BMG',
  '0212': 'Original',
  '0004': 'Banco do Nordeste',
  '0070': 'BRB',
};

/** Ordem dos atalhos no seletor. */
export const CODIGOS_POPULARES = Object.keys(NOMES_POPULARES);

/**
 * Palavras que identificam o banco no nome que o usuário deu à conta/cartão.
 * A ordem importa: termos mais específicos antes dos genéricos.
 */
const APELIDOS: [RegExp, string][] = [
  [/\bnu ?bank\b|\broxinho\b|^nu\b/, '0260'],
  [/\bita[uú]\b|\bpersonnalit[eé]\b|\biti\b/, '0341'],
  [/\bbradesco\b|\bnext\b/, '0237'],
  [/\bbanco do brasil\b|^bb\b|\bourocard\b/, '0001'],
  [/\bcaixa\b|\bcef\b/, '0104'],
  [/\bsantander\b/, '0033'],
  [/\binter\b/, '0077'],
  [/\bc6\b/, '0336'],
  [/\bbtg\b/, '0208'],
  [/\bxp\b/, '0102'],
  [/\bpic ?pay\b/, '0380'],
  [/\bmercado ?pago\b|\bmercado livre\b/, '0323'],
  [/\bpag ?bank\b|\bpag ?seguro\b/, '0290'],
  [/\bneon\b/, '0536'],
  [/\bsicoob\b/, '0756'],
  [/\bsicredi\b/, '0748'],
  [/\bbanrisul\b/, '0041'],
  [/\bsafra\b/, '0422'],
  [/\bpan\b/, '0623'],
  [/\bstone\b/, '0197'],
  [/\bagi ?bank\b/, '0121'],
  [/\bbmg\b/, '0318'],
  [/\boriginal\b/, '0212'],
  [/\bbnb\b|\bbanco do nordeste\b/, '0004'],
  [/\bbrb\b/, '0070'],
];

const MAPA_LOGOS = logos as Record<string, number>;

/** "BANCO INTER S.A." → "Banco Inter" (para bancos fora da lista popular). */
function nomeLegivel(oficial: string): string {
  const base = oficial
    .replace(/\s+-\s+.*$/, '')
    .replace(/\b(S\.?\/?A\.?|LTDA\.?|S\.A)\s*$/i, '')
    .trim();
  if (base !== base.toUpperCase()) return base;
  const minusculas = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const BANCOS: Banco[] = (dados as { banks: { compe4: string; name: string }[] }).banks
  .filter((b) => b.compe4)
  .map((b) => ({
    codigo: b.compe4,
    nome: NOMES_POPULARES[b.compe4] ?? nomeLegivel(b.name),
    nomeOficial: b.name,
    temLogo: MAPA_LOGOS[b.compe4] !== undefined,
  }))
  .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

const POR_CODIGO = new Map(BANCOS.map((b) => [b.codigo, b]));

export function bancoPorCodigo(codigo: string | null | undefined): Banco | undefined {
  return codigo ? POR_CODIGO.get(codigo) : undefined;
}

/** Fonte da imagem do logo (para <Image source>), se houver. */
export function logoDoBanco(codigo: string | null | undefined): number | undefined {
  return codigo ? MAPA_LOGOS[codigo] : undefined;
}

/** Reconhece o banco pelo nome dado à conta ou cartão ("Nubank", "Itaú Personnalité"...). */
export function detectarBanco(nome: string): string | null {
  const n = semAcento(nome).trim();
  if (!n) return null;
  for (const [re, codigo] of APELIDOS) if (re.test(n)) return codigo;
  return null;
}

/** Banco efetivo: o escolhido manualmente ou, na falta, o reconhecido pelo nome. */
export function bancoDe(item: { banco_codigo?: string | null; nome: string }): string | null {
  return item.banco_codigo || detectarBanco(item.nome);
}

/** Busca por nome curto, nome oficial ou código. */
export function buscarBancos(termo: string, limite = 20): Banco[] {
  const t = semAcento(termo).trim();
  if (!t) return [];
  return BANCOS.filter(
    (b) => b.codigo.includes(t) || semAcento(b.nome).includes(t) || semAcento(b.nomeOficial).includes(t),
  )
    .sort((a, b) => Number(b.temLogo) - Number(a.temLogo))
    .slice(0, limite);
}
