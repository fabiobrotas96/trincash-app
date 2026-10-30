import type { Categoria, TipoCategoria } from '../types';
import { toISODate, today } from '../utils/format';

// ---------------------------------------------------------------------
// Importação de extratos bancários (OFX ou CSV exportados pelo banco)
// ---------------------------------------------------------------------

export interface ItemImportado {
  /** 'YYYY-MM-DD' */
  data: string;
  descricao: string;
  /** Negativo para saídas, positivo para entradas */
  valor: number;
}

export interface ExtratoLido {
  formato: 'OFX' | 'CSV' | 'PDF';
  /** Nome do banco, quando o arquivo informa (OFX). */
  banco: string | null;
  itens: ItemImportado[];
}

/** Lê os bytes do arquivo: UTF-8 quando válido, senão Windows-1252 (bancos antigos). */
export function decodificarArquivo(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Identifica o formato pelo conteúdo e devolve os lançamentos do extrato. */
export function lerExtrato(texto: string): ExtratoLido {
  const limpo = texto.replace(/^﻿/, '');
  if (/<OFX>/i.test(limpo) || /OFXHEADER/i.test(limpo)) return lerOFX(limpo);
  return lerCSV(limpo);
}

// ---------------------------------------------------------------------
// OFX (SGML ou XML; tags de fechamento são opcionais no OFX 1.x)
// ---------------------------------------------------------------------

const tagOFX = (bloco: string, tag: string): string => {
  const m = bloco.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return m ? decodificarEntidades(m[1].trim()) : '';
};

const decodificarEntidades = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function lerOFX(texto: string): ExtratoLido {
  const itens: ItemImportado[] = [];
  for (const bloco of texto.split(/<STMTTRN>/i).slice(1)) {
    const data = dataOFX(tagOFX(bloco, 'DTPOSTED'));
    const valor = lerValor(tagOFX(bloco, 'TRNAMT'));
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    const memo = tagOFX(bloco, 'MEMO');
    const nome = tagOFX(bloco, 'NAME');
    const descricao = juntarTextos([nome, memo]);
    itens.push({ data, valor, descricao });
  }
  return { formato: 'OFX', banco: tagOFX(texto, 'ORG') || null, itens };
}

/** 'AAAAMMDD[HHMMSS[.xxx]][-3:BRT]' -> 'AAAA-MM-DD' */
function dataOFX(s: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? validarData(+m[1], +m[2], +m[3]) : null;
}

// ---------------------------------------------------------------------
// CSV (separador e colunas detectados pelo cabeçalho)
// ---------------------------------------------------------------------

/** Remove acentos, caixa e espaços extras para comparar nomes de colunas e descrições. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function separarLinhaCSV(linha: string, sep: string): string[] {
  const cells: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === sep) {
      cells.push(atual.trim());
      atual = '';
    } else atual += ch;
  }
  cells.push(atual.trim());
  return cells;
}

/** O separador é o que mais aparece fora de aspas nas primeiras linhas. */
function detectarSeparador(linhas: string[]): string {
  const contar = (sep: string) =>
    linhas.slice(0, 20).reduce((n, l) => n + separarLinhaCSV(l, sep).length - 1, 0);
  return [';', ',', '\t'].reduce((melhor, sep) => (contar(sep) > contar(melhor) ? sep : melhor));
}

const COLUNAS_DESCRICAO = [
  'historico',
  'descricao',
  'description',
  'lancamento',
  'tipo de transacao',
  'estabelecimento',
  'nome',
  'detalhe',
  'detalhes',
  'titulo',
  'memo',
];

interface MapaColunas {
  data: number;
  descricao: number[];
  valor: number;
  credito: number;
  debito: number;
}

function mapearColunas(cabecalho: string[]): MapaColunas | null {
  const nomes = cabecalho.map(normalizar);
  const achar = (teste: (n: string) => boolean) => nomes.findIndex(teste);
  const data = achar((n) => n === 'data' || n === 'date' || /^data( d[eo])? (lancamento|movimento|transacao|compra)/.test(n));
  const dataGenerica = data >= 0 ? data : achar((n) => n.startsWith('data') || n.startsWith('date') || n === 'dt');
  const valor = achar((n) => /^(valor|amount|value|quantia)\b/.test(n) && !n.includes('saldo'));
  const credito = achar((n) => /^(credito|entrada)/.test(n));
  const debito = achar((n) => /^(debito|saida)/.test(n));
  const descricao = COLUNAS_DESCRICAO.flatMap((c) => {
    const i = nomes.findIndex((n) => n === c || n.startsWith(`${c} `));
    return i >= 0 ? [i] : [];
  }).sort((a, b) => a - b);
  if (dataGenerica < 0 || (valor < 0 && credito < 0 && debito < 0)) return null;
  return { data: dataGenerica, descricao: [...new Set(descricao)], valor, credito, debito };
}

function lerCSV(texto: string): ExtratoLido {
  const linhas = texto.split(/\r?\n/);
  const sep = detectarSeparador(linhas.filter((l) => l.trim()));
  const tabela = linhas.map((l) => separarLinhaCSV(l, sep));

  const inicio = tabela.findIndex((cells) => mapearColunas(cells) !== null);
  if (inicio < 0) {
    throw new Error('Não encontrei as colunas de data e valor neste arquivo. Ele é um extrato em CSV ou OFX?');
  }
  const mapa = mapearColunas(tabela[inicio])!;

  const itens: ItemImportado[] = [];
  for (const cells of tabela.slice(inicio + 1)) {
    // Linha em branco depois dos lançamentos: fim do extrato (o resto é rodapé).
    if (cells.every((c) => !c)) {
      if (itens.length) break;
      continue;
    }
    const data = lerData(cells[mapa.data] ?? '');
    if (!data) continue;
    let valor: number;
    if (mapa.valor >= 0) valor = lerValor(cells[mapa.valor] ?? '');
    else {
      const c = mapa.credito >= 0 ? lerValor(cells[mapa.credito] ?? '') : NaN;
      const d = mapa.debito >= 0 ? lerValor(cells[mapa.debito] ?? '') : NaN;
      if (!Number.isFinite(c) && !Number.isFinite(d)) continue;
      // Débito pode vir positivo ("59,68") ou já negativo ("-59,68").
      valor = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    if (!Number.isFinite(valor) || valor === 0) continue;
    const descricao = juntarTextos(mapa.descricao.map((i) => cells[i] ?? ''));
    itens.push({ data, valor: Math.round(valor * 100) / 100, descricao });
  }
  return { formato: 'CSV', banco: null, itens };
}

// ---------------------------------------------------------------------
// PDF (texto extraído com pdf.js, agrupado em linhas pela posição)
// ---------------------------------------------------------------------

/** Trecho de texto de uma página do PDF, com a posição (y cresce para cima). */
export interface TextoPdf {
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

const DINHEIRO = /-?\s?R\$\s?-?\s?[\d.]+,\d{2}|-?[\d.]*\d,\d{2}\b/g;
const DATA_INICIO = /^(\d{2}[/-]\d{2}(?:[/-]\d{2,4})?)\b/;

/** Agrupa os trechos em linhas (mesma página e altura) e as células da esquerda para a direita. */
function agruparLinhas(itens: TextoPdf[]): string[][] {
  const linhas: { pagina: number; y: number; cells: { x: number; t: string }[] }[] = [];
  for (const it of itens) {
    const t = it.texto.trim();
    if (!t) continue;
    let l = linhas.find((x) => x.pagina === it.pagina && Math.abs(x.y - it.y) <= 2);
    if (!l) linhas.push((l = { pagina: it.pagina, y: it.y, cells: [] }));
    l.cells.push({ x: it.x, t });
  }
  return linhas
    .sort((a, b) => a.pagina - b.pagina || b.y - a.y)
    .map((l) => l.cells.sort((a, b) => a.x - b.x).map((c) => c.t));
}

/**
 * Extratos em PDF: cada movimento é uma linha que começa com a data e tem o
 * valor (e às vezes o saldo depois). Descrições longas quebram em linhas sem
 * data logo acima e/ou abaixo — elas são juntadas ao movimento.
 */
export function lerPDF(itens: TextoPdf[]): ExtratoLido {
  const linhas = agruparLinhas(itens);
  const textoTodo = linhas.map((l) => l.join(' ')).join('\n');
  // Ano para datas sem ano (DD/MM): o mais frequente entre as datas completas do arquivo.
  const anos = [...textoTodo.matchAll(/\b\d{2}[/-]\d{2}[/-](\d{4})\b/g)].map((m) => m[1]);
  const anoPadrao = anos.sort((a, b) => anos.filter((x) => x === b).length - anos.filter((x) => x === a).length)[0]
    ?? String(today().getFullYear());

  /** esperaAbaixo: a descrição começou acima da linha da data, então continua abaixo dela. */
  type Mov = ItemImportado & { esperaAbaixo: boolean; partes: string[] };
  const movs: Mov[] = [];
  let soltas: string[] = [];
  const ignorar = (texto: string) => {
    const n = normalizar(texto);
    return /^\d+ ?\/ ?\d+$/.test(n) || (/\bdata\b/.test(n) && /\b(valor|saldo)\b/.test(n));
  };

  for (const cells of linhas) {
    const juntas = cells.join(' ');
    const m = cells[0]?.match(DATA_INICIO);
    const valores = juntas.match(DINHEIRO);
    if (!m || !valores) {
      if (!ignorar(juntas)) soltas.push(juntas);
      continue;
    }
    let dataTxt = m[1];
    if (dataTxt.length <= 5) dataTxt = `${dataTxt}/${anoPadrao}`;
    const data = lerData(dataTxt);
    // Com valor e saldo na linha, o valor é o primeiro.
    const valor = lerValor(valores[0]);
    if (!data || !Number.isFinite(valor) || valor === 0) {
      soltas.push(juntas);
      continue;
    }
    const inline = juntas
      .replace(DATA_INICIO, '')
      .replace(DINHEIRO, ' ')
      .replace(/\b\d{8,}\b/g, ' ') // IDs da operação
      .replace(/\s+/g, ' ')
      .trim();

    // Linhas soltas entre dois movimentos: a primeira fecha a descrição do
    // anterior (se ela continua abaixo da data); a última abre a do atual.
    const anterior = movs[movs.length - 1];
    if (anterior?.esperaAbaixo && soltas.length) anterior.partes.push(soltas.shift()!);
    const acima = soltas.slice(-1);
    movs.push({ data, valor, descricao: '', esperaAbaixo: !inline || acima.length > 0, partes: [...acima, ...(inline ? [inline] : [])] });
    soltas = [];
  }
  const ultimo = movs[movs.length - 1];
  if (ultimo?.esperaAbaixo && soltas.length) ultimo.partes.push(soltas[0]);

  return {
    formato: 'PDF',
    banco: null,
    itens: movs.map(({ data, valor, partes }) => ({ data, valor, descricao: partes.join(' ').slice(0, 200) })),
  };
}

// ---------------------------------------------------------------------
// Datas e valores em formatos brasileiros
// ---------------------------------------------------------------------

function validarData(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toISODate(dt);
}

/** Aceita 'DD/MM/AAAA', 'DD/MM/AA', 'DD-MM-AAAA', 'AAAA-MM-DD' (com ou sem hora). */
export function lerData(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validarData(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) return validarData(+m[3], +m[2], +m[1]);
  return null;
}

/** Aceita '+R$ 1.136,13', '-59,68', '(59,68)', '1234.56', 'R$ -5,00'. */
export function lerValor(s: string): number {
  let t = s.trim();
  if (!t) return NaN;
  const negativo = /^\(.*\)$/.test(t) || t.includes('-') || /\bD$/i.test(t);
  t = t.replace(/[^\d.,]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

const juntarTextos = (partes: string[]) => {
  const vistos = new Set<string>();
  return partes
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => {
      const k = normalizar(p);
      if (!k || vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .join(' - ')
    .slice(0, 200);
};

// ---------------------------------------------------------------------
// Sugestão de categoria pela descrição
// ---------------------------------------------------------------------

/** Palavras-chave por nome de categoria (as categorias padrão do app). */
const REGRAS: { categoria: string; tipo: TipoCategoria; padrao: RegExp }[] = [
  { categoria: 'Assinaturas', tipo: 'DESPESA', padrao: /netflix|spotify|prime video|amazon prime|disney|hbo|max\.com|youtube|apple\.com|icloud|google (one|storage)|deezer|globoplay|paramount|chatgpt|openai|claude/ },
  { categoria: 'Alimentação', tipo: 'DESPESA', padrao: /ifood|rappi|restaurante|lanchonete|padaria|panificadora|supermercado|mercado(?! ?(livre|pago))|atacadao|assai|carrefour|pao de acucar|hortifruti|acougue|pizza|burger|mc ?donalds|bk |subway|cafe|lanches|sorvete/ },
  { categoria: 'Transporte', tipo: 'DESPESA', padrao: /uber|\b99\b|99 ?app|cabify|posto|combustivel|gasolina|shell|ipiranga|petrobras|br mania|estacionamento|estapar|pedagio|sem parar|veloe|conectcar|move mais|eixo sp|autoban|ccr |arteris|ecovias|metro|cptm|onibus|bilhete unico|taxi/ },
  { categoria: 'Moradia', tipo: 'DESPESA', padrao: /aluguel|condominio|energia|enel|cpfl|cemig|light |copel|elektro|forca e luz|energisa|neoenergia|sabesp|saneamento|agua e esgoto|comgas|naturgy|internet|vivo|telefonica|claro|\btim\b|oi fibra|net servicos/ },
  { categoria: 'Saúde', tipo: 'DESPESA', padrao: /farmacia|drogaria|droga ?raia|drogasil|pague menos|panvel|odonto|dental|hospital|clinica|laboratorio|exame|unimed|amil|sulamerica|bradesco saude|hapvida|medic|psicolog/ },
  { categoria: 'Educação', tipo: 'DESPESA', padrao: /escola|colegio|faculdade|universidade|mensalidade|curso|udemy|alura|hotmart|livraria|papelaria/ },
  { categoria: 'Lazer', tipo: 'DESPESA', padrao: /cinema|cinemark|ingresso|sympla|eventim|steam|playstation|xbox|nintendo|\bbar\b|choperia|cervejaria|show|teatro|parque|viagem|hotel|airbnb|booking/ },
  { categoria: 'Compras', tipo: 'DESPESA', padrao: /amazon|mercado ?livre|mercadolivre|shopee|magalu|magazine|americanas|aliexpress|shein|casas bahia|renner|riachuelo|c&a|zara|centauro|netshoes|kabum|leroy/ },
  { categoria: 'Salário', tipo: 'RECEITA', padrao: /salario|folha de pagamento|pagto salario|proventos|vencimentos/ },
  { categoria: 'Investimentos', tipo: 'RECEITA', padrao: /rendimento|juros|dividendo|resgate|cdb|tesouro|aplicacao/ },
];

const FALLBACK: Record<TipoCategoria, string> = { DESPESA: 'Outros', RECEITA: 'Outras receitas' };

/** Sugere uma categoria do usuário com base na descrição; cai em "Outros" / "Outras receitas". */
export function sugerirCategoria(descricao: string, valor: number, categorias: Categoria[]): string | null {
  const tipo: TipoCategoria = valor < 0 ? 'DESPESA' : 'RECEITA';
  const doTipo = categorias.filter((c) => c.tipo === tipo);
  const porNome = (nome: string) => doTipo.find((c) => normalizar(c.nome) === normalizar(nome))?.id ?? null;
  const texto = normalizar(descricao);
  for (const r of REGRAS) {
    if (r.tipo === tipo && r.padrao.test(texto)) {
      const id = porNome(r.categoria);
      if (id) return id;
    }
  }
  return porNome(FALLBACK[tipo]) ?? doTipo[0]?.id ?? null;
}

/**
 * Movimentações entre a conta e as caixinhas/cofrinhos do próprio banco
 * (ex.: "Dinheiro reservado", "Dinheiro retirado" no Mercado Pago). Não são
 * gastos nem receitas, então chegam desmarcadas na importação.
 */
export function ehMovimentacaoInterna(descricao: string): boolean {
  return /^dinheiro (reservado|retirado|guardado)|caixinha|cofrinho|porquinho|aplicacao automatica|resgate automatico/.test(
    normalizar(descricao),
  );
}

// ---------------------------------------------------------------------
// Duplicados
// ---------------------------------------------------------------------

/**
 * Marca itens que já existem na conta (mesma data e mesmo valor). Cada
 * lançamento existente "consome" só um item, então duas compras iguais no
 * mesmo dia só são marcadas se já houver duas no app.
 */
export function marcarDuplicados(
  itens: ItemImportado[],
  existentes: { data_transacao: string; valor: number }[],
): boolean[] {
  const chave = (data: string, valor: number) => `${data.slice(0, 10)}|${Math.round(valor * 100)}`;
  const saldo = new Map<string, number>();
  for (const e of existentes) {
    const k = chave(e.data_transacao, e.valor);
    saldo.set(k, (saldo.get(k) ?? 0) + 1);
  }
  return itens.map((it) => {
    const k = chave(it.data, it.valor);
    const n = saldo.get(k) ?? 0;
    if (n > 0) {
      saldo.set(k, n - 1);
      return true;
    }
    return false;
  });
}
