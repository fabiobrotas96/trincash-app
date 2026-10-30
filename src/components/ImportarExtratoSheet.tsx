import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../utils/alert';
import {
  decodificarArquivo,
  ehMovimentacaoInterna,
  lerExtrato,
  lerPDF,
  marcarDuplicados,
  sugerirCategoria,
  type ItemImportado,
} from '../services/importacao';
import { textoDoPdf } from '../services/pdf';
import { carregarPessoas } from '../services/finance';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import type { Categoria, Conta, NovaTransacao, Pessoa } from '../types';
import { formatCurrency, formatDateLabel, toISODate, today, toNumber } from '../utils/format';
import { QuemSelector, type Quem } from './Pessoas';
import { BottomSheet, Chip, PrimaryButton } from './ui';

interface Linha extends ItemImportado {
  incluir: boolean;
  duplicado: boolean;
  /** Movimentação com caixinha/cofrinho do próprio banco. */
  interno: boolean;
  categoriaId: string | null;
}

/**
 * Importa um extrato (OFX ou CSV) para uma conta: lê o arquivo, mostra a
 * prévia com categorias sugeridas e possíveis duplicados, e grava os
 * lançamentos escolhidos.
 */
export function ImportarExtratoSheet({
  visible,
  contaId: contaInicial,
  onClose,
  onImported,
}: {
  visible: boolean;
  /** Conta pré-selecionada (extrato de uma conta); sem ela, o usuário escolhe. */
  contaId?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [contaId, setContaId] = useState<string | null>(contaInicial ?? null);
  const [arquivo, setArquivo] = useState<{ nome: string; banco: string | null; formato: string } | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [editando, setEditando] = useState<number | null>(null);
  const [quem, setQuem] = useState<Quem>({ pessoaId: null, dividido: false });
  const [manterSaldo, setManterSaldo] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setContaId(contaInicial ?? null);
    setArquivo(null);
    setLinhas([]);
    setEditando(null);
    setQuem({ pessoaId: null, dividido: false });
    setManterSaldo(true);
    (async () => {
      try {
        const [contasRes, catRes, pessoasList] = await Promise.all([
          supabase.from('contas').select('*').order('data_criacao'),
          supabase.from('categorias').select('*').order('nome'),
          carregarPessoas(),
        ]);
        if (contasRes.error) throw contasRes.error;
        if (catRes.error) throw catRes.error;
        setContas((contasRes.data ?? []) as Conta[]);
        setCategorias((catRes.data ?? []) as Categoria[]);
        setPessoas(pessoasList);
      } catch (err) {
        Alert.alert('Erro', errorMessage(err));
      }
    })();
  }, [visible, contaInicial]);

  const escolherArquivo = async () => {
    if (!contaId) {
      Alert.alert('Atenção', 'Escolha primeiro a conta que vai receber os lançamentos.');
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setLendo(true);
    try {
      const bytes = asset.file ? await asset.file.arrayBuffer() : await (await fetch(asset.uri)).arrayBuffer();
      const pdf = /\.pdf$/i.test(asset.name) || asset.mimeType === 'application/pdf';
      const extrato = pdf ? lerPDF(await textoDoPdf(bytes)) : lerExtrato(decodificarArquivo(bytes));
      if (!extrato.itens.length) {
        throw new Error(
          pdf
            ? 'Nenhum lançamento encontrado no PDF. Se ele for uma imagem escaneada, exporte o extrato em OFX ou CSV.'
            : 'Nenhum lançamento encontrado no arquivo.',
        );
      }

      // Lançamentos já existentes na conta no mesmo período, para marcar duplicados.
      const datas = extrato.itens.map((i) => i.data).sort();
      const { data, error } = await supabase
        .from('transacoes')
        .select('data_transacao, valor')
        .eq('conta_id', contaId)
        .gte('data_transacao', datas[0])
        .lte('data_transacao', datas[datas.length - 1]);
      if (error) throw error;
      const existentes = ((data ?? []) as { data_transacao: string; valor: number }[]).map((t) => ({
        ...t,
        valor: toNumber(t.valor),
      }));
      const dup = marcarDuplicados(extrato.itens, existentes);

      setArquivo({ nome: asset.name, banco: extrato.banco, formato: extrato.formato });
      setLinhas(
        extrato.itens
          .map((it, i) => {
            const interno = ehMovimentacaoInterna(it.descricao);
            return {
              ...it,
              duplicado: dup[i],
              interno,
              incluir: !dup[i] && !interno,
              categoriaId: sugerirCategoria(it.descricao, it.valor, categorias),
            };
          })
          .sort((a, b) => b.data.localeCompare(a.data)),
      );
    } catch (err) {
      Alert.alert('Não foi possível ler o extrato', errorMessage(err));
    } finally {
      setLendo(false);
    }
  };

  const selecionadas = useMemo(() => linhas.filter((l) => l.incluir), [linhas]);
  const totais = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const l of selecionadas) {
      if (l.valor > 0) entradas += l.valor;
      else saidas += l.valor;
    }
    return { entradas, saidas };
  }, [selecionadas]);
  const duplicados = linhas.filter((l) => l.duplicado).length;
  const internos = linhas.filter((l) => l.interno && !l.duplicado).length;

  const atualizar = (i: number, patch: Partial<Linha>) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const importar = async () => {
    if (!contaId || !selecionadas.length) return;
    setSalvando(true);
    try {
      const usuarioId = await getUserId();
      const hoje = toISODate(today());
      const saldoAntes = contas.find((c) => c.id === contaId)?.saldo;
      const rows: NovaTransacao[] = selecionadas.map((l) => ({
        usuario_id: usuarioId,
        conta_id: contaId,
        cartao_id: null,
        categoria_id: l.categoriaId,
        tipo: l.valor < 0 ? 'DESPESA' : 'RECEITA',
        valor: l.valor,
        descricao: l.descricao,
        data_transacao: l.data,
        status: l.data <= hoje ? 'EFETIVADA' : 'PENDENTE',
        numero_parcela: 1,
        total_parcelas: 1,
        recorrente: false,
        pessoa_id: quem.dividido ? null : quem.pessoaId,
        dividido: quem.dividido,
      }));
      const { error } = await supabase.from('transacoes').insert(rows);
      if (error) throw error;

      // O saldo informado no app já inclui esses lançamentos: desfaz o ajuste do trigger.
      if (manterSaldo && saldoAntes !== undefined) {
        const { error: errSaldo } = await supabase.from('contas').update({ saldo: toNumber(saldoAntes) }).eq('id', contaId);
        if (errSaldo) throw errSaldo;
      }
      Alert.alert('Extrato importado', `${rows.length} lançamento(s) adicionados.`);
      onImported();
      onClose();
    } catch (err) {
      Alert.alert('Erro ao importar', errorMessage(err));
    } finally {
      setSalvando(false);
    }
  };

  const nomeCategoria = (id: string | null) => {
    const c = categorias.find((x) => x.id === id);
    return c ? `${c.icone} ${c.nome}` : 'Sem categoria';
  };

  return (
    <BottomSheet visible={visible} title="Importar extrato" onClose={onClose}>
      {!arquivo ? (
        <>
          <Text style={styles.label}>Conta</Text>
          <View style={styles.chips}>
            {contas.map((c) => (
              <Chip key={c.id} label={c.nome} selected={contaId === c.id} onPress={() => setContaId(c.id)} />
            ))}
            {contas.length === 0 ? <Text style={styles.muted}>Cadastre uma conta no Início antes de importar.</Text> : null}
          </View>
          <Text style={[styles.muted, { marginBottom: spacing.lg }]}>
            Exporte o extrato no app ou site do banco em OFX (Itaú, Bradesco, C6, Caixa...), CSV ou PDF e selecione o arquivo.
            Você revisa tudo antes de salvar.
          </Text>
          <PrimaryButton title="Escolher arquivo" icon="document-attach-outline" onPress={escolherArquivo} loading={lendo} />
        </>
      ) : (
        <>
          <View style={styles.resumo}>
            <Text style={styles.arquivo} numberOfLines={1}>
              {arquivo.banco ?? arquivo.nome} • {arquivo.formato}
            </Text>
            <Text style={styles.muted}>
              {linhas.length} lançamentos no arquivo • {selecionadas.length} selecionados
              {duplicados ? ` • ${duplicados} já existem no app (desmarcados)` : ''}
              {internos ? ` • ${internos} movimentações de caixinha (desmarcadas)` : ''}
            </Text>
            <Text style={styles.muted}>
              Entradas <Text style={{ color: colors.success }}>{formatCurrency(totais.entradas)}</Text> • Saídas{' '}
              <Text style={{ color: colors.danger }}>{formatCurrency(Math.abs(totais.saidas))}</Text>
            </Text>
          </View>

          <Text style={styles.muted}>Toque na caixa para incluir/excluir e na categoria para trocar.</Text>
          {linhas.map((l, i) => (
            <View key={`${l.data}-${i}`} style={[styles.linha, !l.incluir && { opacity: 0.45 }]}>
              <View style={styles.linhaTopo}>
                <TouchableOpacity onPress={() => atualizar(i, { incluir: !l.incluir })} hitSlop={8}>
                  <Ionicons
                    name={l.incluir ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={l.incluir ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={styles.desc} numberOfLines={2}>
                    {l.descricao || 'Sem descrição'}
                  </Text>
                  <Text style={styles.muted}>
                    {formatDateLabel(l.data)}
                    {l.duplicado ? ' • possível duplicado' : l.interno ? ' • caixinha / cofrinho' : ''}
                  </Text>
                </View>
                <Text style={[styles.valor, { color: l.valor < 0 ? colors.danger : colors.success }]}>
                  {formatCurrency(l.valor, { sign: true })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setEditando(editando === i ? null : i)} style={styles.catBtn}>
                <Text style={styles.catText}>{nomeCategoria(l.categoriaId)}</Text>
                <Ionicons name={editando === i ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              {editando === i ? (
                <View style={[styles.chips, { marginTop: spacing.sm }]}>
                  {categorias
                    .filter((c) => c.tipo === (l.valor < 0 ? 'DESPESA' : 'RECEITA'))
                    .map((c) => (
                      <Chip
                        key={c.id}
                        label={`${c.icone} ${c.nome}`}
                        selected={l.categoriaId === c.id}
                        onPress={() => {
                          atualizar(i, { categoriaId: c.id });
                          setEditando(null);
                        }}
                      />
                    ))}
                </View>
              ) : null}
            </View>
          ))}

          {pessoas.length > 0 ? (
            <>
              <Text style={styles.label}>Quem? (opcional, vale para todos)</Text>
              <QuemSelector pessoas={pessoas} value={quem} onChange={setQuem} />
            </>
          ) : null}

          <TouchableOpacity style={styles.toggle} onPress={() => setManterSaldo((v) => !v)}>
            <Ionicons name={manterSaldo ? 'checkbox' : 'square-outline'} size={22} color={manterSaldo ? colors.primary : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.desc}>Manter o saldo atual da conta</Text>
              <Text style={styles.muted}>
                Marque se o saldo no app já está igual ao do banco. Desmarque para somar os lançamentos ao saldo.
              </Text>
            </View>
          </TouchableOpacity>

          <PrimaryButton
            title={`Importar ${selecionadas.length} lançamento(s)`}
            icon="cloud-upload-outline"
            onPress={importar}
            loading={salvando}
            disabled={!selecionadas.length}
          />
          <View style={{ height: spacing.sm }} />
          <PrimaryButton title="Escolher outro arquivo" variant="outline" onPress={escolherArquivo} loading={lendo} />
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  muted: { color: colors.textMuted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  resumo: {
    backgroundColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    marginBottom: spacing.md,
  },
  arquivo: { color: colors.text, fontWeight: '700', fontSize: 15 },
  linha: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.md },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  desc: { color: colors.text, fontWeight: '600', fontSize: 14 },
  valor: { fontWeight: '800', fontSize: 14 },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.sm,
    marginLeft: 22 + spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  catText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
});
