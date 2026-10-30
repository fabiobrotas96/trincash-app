import { Platform } from 'react-native';
import type { TextoPdf } from './importacao';

// pdf.js carregado sob demanda (só quando o usuário escolhe um PDF), direto do CDN.
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getTextContent(): Promise<{ items: { str?: string; transform?: number[] }[] }>;
      }>;
    }>;
  };
}

let carregando: Promise<PdfJs> | null = null;

function carregarPdfJs(): Promise<PdfJs> {
  if (Platform.OS !== 'web') {
    return Promise.reject(new Error('A leitura de PDF está disponível na versão web do Trincash. No celular, use OFX ou CSV.'));
  }
  const w = globalThis as unknown as { pdfjsLib?: PdfJs; document: Document };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  carregando ??= new Promise<PdfJs>((ok, falha) => {
    const s = w.document.createElement('script');
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => {
      w.pdfjsLib!.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
      ok(w.pdfjsLib!);
    };
    s.onerror = () => {
      carregando = null;
      falha(new Error('Não foi possível carregar o leitor de PDF. Verifique a conexão e tente de novo.'));
    };
    w.document.head.appendChild(s);
  });
  return carregando;
}

/** Extrai os trechos de texto (com posição) de todas as páginas do PDF. */
export async function textoDoPdf(bytes: ArrayBuffer): Promise<TextoPdf[]> {
  const pdfjs = await carregarPdfJs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException') {
      throw new Error('Este PDF tem senha. Exporte o extrato sem senha (ou em OFX/CSV) e tente de novo.');
    }
    throw err;
  }
  const itens: TextoPdf[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    for (const it of items) {
      if (it.str && it.transform) itens.push({ pagina: p, x: it.transform[4], y: it.transform[5], texto: it.str });
    }
  }
  return itens;
}
