import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';
import { formatCurrency, parseValor } from '../../utils/format';
import {
  PERFIL_IDS,
  PERFIS,
  aporteNecessario,
  simular,
  type Mercado,
  type ParametrosPerfil,
  type PerfilId,
  type RegraIR,
} from '../../utils/investCalc';
import { Card, Chip, ProgressBar, SectionTitle, SegmentedControl } from '../ui';

export interface PresetSimulador {
  perfil: PerfilId;
  inicial?: number;
  alvo?: number;
  meses?: number;
  /** Muda a cada pedido para reaplicar o preset. */
  nonce: number;
}

const REGRAS_IR: { value: RegraIR; label: string }[] = [
  { value: 'REGRESSIVO', label: 'Regressivo' },
  { value: 'PREVIDENCIA', label: 'Previdência' },
  { value: 'ISENTO', label: 'Isento' },
  { value: 'FIXO', label: 'Alíquota fixa' },
];

const fmtNum = (n: number) => String(n).replace('.', ',');
const pct = (f: number) => `${(f * 100).toFixed(2).replace('.', ',')}%`;
const num = (t: string, fallback = 0) => {
  const v = parseValor(t);
  return Number.isNaN(v) ? fallback : v;
};

function Campo({
  label,
  value,
  onChange,
  sufixo,
  flex = 1,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  sufixo?: string;
  flex?: number;
}) {
  return (
    <View style={{ flex }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={colors.textMuted}
          placeholder="0"
        />
        {sufixo ? <Text style={styles.sufixo}>{sufixo}</Text> : null}
      </View>
    </View>
  );
}

export function SimuladorTab({
  mercado,
  onMercado,
  preset,
}: {
  mercado: Mercado;
  onMercado: (m: Mercado) => void;
  preset: PresetSimulador | null;
}) {
  const [modo, setModo] = useState<'simular' | 'objetivo'>('simular');
  const [perfil, setPerfil] = useState<PerfilId>('CDB');
  const [inicial, setInicial] = useState('1000');
  const [aporte, setAporte] = useState('500');
  const [alvo, setAlvo] = useState('100000');
  const [prazo, setPrazo] = useState('5');
  const [unidade, setUnidade] = useState<'anos' | 'meses'>('anos');
  const [showPremissas, setShowPremissas] = useState(false);

  // Parâmetros editáveis do perfil (texto para permitir vírgula).
  const [taxa, setTaxa] = useState('');
  const [taxaAdm, setTaxaAdm] = useState('');
  const [custodia, setCustodia] = useState('');
  const [taxaEntrada, setTaxaEntrada] = useState('');
  const [regraIR, setRegraIR] = useState<RegraIR>('REGRESSIVO');
  const [aliquota, setAliquota] = useState('15');
  const [selic, setSelic] = useState(fmtNum(mercado.selic));
  const [cdi, setCdi] = useState(fmtNum(mercado.cdi));
  const [ipca, setIpca] = useState(fmtNum(mercado.ipca));

  const aplicarPerfil = (id: PerfilId) => {
    const p = PERFIS[id].padrao;
    setPerfil(id);
    setTaxa(fmtNum(p.taxa));
    setTaxaAdm(fmtNum(p.taxaAdm));
    setCustodia(fmtNum(p.custodia));
    setTaxaEntrada(fmtNum(p.taxaEntrada));
    setRegraIR(p.regraIR);
    setAliquota(fmtNum(p.aliquotaIR));
  };

  useEffect(() => {
    aplicarPerfil('CDB');
  }, []);

  // Preset vindo de um investimento ou objetivo.
  useEffect(() => {
    if (!preset) return;
    aplicarPerfil(preset.perfil);
    if (preset.inicial !== undefined) setInicial(fmtNum(Math.round(preset.inicial * 100) / 100));
    if (preset.alvo !== undefined) {
      setAlvo(fmtNum(Math.round(preset.alvo)));
      setModo('objetivo');
    } else setModo('simular');
    if (preset.meses !== undefined) {
      setUnidade('meses');
      setPrazo(String(preset.meses));
    }
  }, [preset?.nonce]);

  // Premissas de mercado são compartilhadas com os objetivos.
  useEffect(() => {
    const m = { selic: num(selic, mercado.selic), cdi: num(cdi, mercado.cdi), ipca: num(ipca, mercado.ipca) };
    if (m.selic !== mercado.selic || m.cdi !== mercado.cdi || m.ipca !== mercado.ipca) onMercado(m);
  }, [selic, cdi, ipca]);

  const params: ParametrosPerfil = {
    indexador: PERFIS[perfil].padrao.indexador,
    taxa: num(taxa),
    taxaAdm: num(taxaAdm),
    custodia: num(custodia),
    taxaEntrada: num(taxaEntrada),
    regraIR,
    aliquotaIR: num(aliquota),
  };
  const meses = Math.min(600, Math.max(1, Math.round(num(prazo, 1) * (unidade === 'anos' ? 12 : 1))));
  const vInicial = num(inicial);

  const calc = useMemo(() => {
    const aporteMensal = modo === 'objetivo' ? aporteNecessario(num(alvo), vInicial, meses, params, mercado) : num(aporte);
    const r = simular({ inicial: vInicial, aporteMensal, meses, params, mercado });
    const poupanca = simular({ inicial: vInicial, aporteMensal, meses, params: PERFIS.POUPANCA.padrao, mercado });
    const comparativo = PERFIL_IDS.map((id) => ({
      id,
      liquido:
        id === perfil ? r.saldoLiquido : simular({ inicial: vInicial, aporteMensal, meses, params: PERFIS[id].padrao, mercado }).saldoLiquido,
    })).sort((a, b) => b.liquido - a.liquido);
    return { aporteMensal, r, poupanca, comparativo };
  }, [modo, alvo, aporte, vInicial, meses, JSON.stringify(params), mercado]);

  const { r, aporteMensal, poupanca, comparativo } = calc;
  const info = PERFIS[perfil];
  const maxEvo = Math.max(1, ...r.evolucao.map((e) => e.saldo));
  const maxComp = Math.max(1, ...comparativo.map((c) => c.liquido));
  const prazoTxt = meses % 12 === 0 ? `${meses / 12} ano${meses / 12 > 1 ? 's' : ''}` : `${meses} meses`;

  return (
    <View>
      <SegmentedControl
        options={[
          { label: 'Simular', value: 'simular' },
          { label: 'Atingir objetivo', value: 'objetivo' },
        ]}
        value={modo}
        onChange={setModo}
      />

      <Text style={[styles.label, { marginTop: spacing.lg }]}>Perfil do investimento</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.perfis}>
        {PERFIL_IDS.map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => aplicarPerfil(id)}
            style={[styles.perfil, perfil === id && styles.perfilSel]}
          >
            <Text style={{ fontSize: 20 }}>{PERFIS[id].icone}</Text>
            <Text style={[styles.perfilNome, perfil === id && { color: colors.text }]} numberOfLines={2}>
              {PERFIS[id].nome}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <Text style={styles.muted}>{info.descricao}</Text>

      <View style={styles.row}>
        <Campo label="Valor inicial (R$)" value={inicial} onChange={setInicial} />
        {modo === 'simular' ? (
          <Campo label="Aporte mensal (R$)" value={aporte} onChange={setAporte} />
        ) : (
          <Campo label="Objetivo líquido (R$)" value={alvo} onChange={setAlvo} />
        )}
      </View>
      <View style={[styles.row, { alignItems: 'flex-end' }]}>
        <Campo label="Prazo" value={prazo} onChange={setPrazo} />
        <View style={{ flex: 1 }}>
          <SegmentedControl
            options={[
              { label: 'Anos', value: 'anos' },
              { label: 'Meses', value: 'meses' },
            ]}
            value={unidade}
            onChange={setUnidade}
          />
        </View>
      </View>

      {/* Premissas e taxas */}
      <TouchableOpacity style={styles.toggle} onPress={() => setShowPremissas((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Premissas, taxas e impostos</Text>
          <Text style={styles.muted} numberOfLines={1}>
            Selic {selic}% • CDI {cdi}% • IPCA {ipca}%
            {info.labelTaxa !== '—' ? ` • ${taxa} ${info.padrao.indexador === 'CDI' ? '% CDI' : '% a.a.'}` : ''}
          </Text>
        </View>
        <Ionicons name={showPremissas ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textSecondary} />
      </TouchableOpacity>
      {showPremissas ? (
        <Card style={{ marginTop: spacing.sm, gap: spacing.md }}>
          <Text style={styles.muted}>Atualize com as taxas do momento. Elas também são usadas nos objetivos.</Text>
          <View style={styles.row}>
            <Campo label="Selic" value={selic} onChange={setSelic} sufixo="% a.a." />
            <Campo label="CDI" value={cdi} onChange={setCdi} sufixo="% a.a." />
            <Campo label="IPCA" value={ipca} onChange={setIpca} sufixo="% a.a." />
          </View>
          {info.labelTaxa !== '—' ? <Campo label={info.labelTaxa} value={taxa} onChange={setTaxa} /> : null}
          <View style={styles.row}>
            <Campo label="Taxa de adm." value={taxaAdm} onChange={setTaxaAdm} sufixo="% a.a." />
            <Campo label="Custódia" value={custodia} onChange={setCustodia} sufixo="% a.a." />
          </View>
          <Campo
            label={perfil === 'PREVIDENCIA' ? 'Carregamento (por aporte)' : 'Corretagem/spread (por aporte)'}
            value={taxaEntrada}
            onChange={setTaxaEntrada}
            sufixo="%"
          />
          <Text style={styles.label}>Imposto de renda</Text>
          <View style={styles.chips}>
            {REGRAS_IR.map((x) => (
              <Chip key={x.value} label={x.label} selected={regraIR === x.value} onPress={() => setRegraIR(x.value)} />
            ))}
          </View>
          {regraIR === 'FIXO' ? <Campo label="Alíquota sobre o ganho" value={aliquota} onChange={setAliquota} sufixo="%" /> : null}
          <Text style={styles.muted}>
            {regraIR === 'REGRESSIVO'
              ? 'Tabela regressiva: 22,5% (até 180 dias), 20% (até 360), 17,5% (até 720), 15% (acima), aplicada a cada aporte.'
              : regraIR === 'PREVIDENCIA'
                ? 'Tabela regressiva da previdência: de 35% (até 2 anos) a 10% (acima de 10 anos), por aporte, sobre o ganho (VGBL).'
                : regraIR === 'ISENTO'
                  ? 'Sem IR sobre o rendimento.'
                  : 'Alíquota única sobre o ganho no resgate.'}
          </Text>
        </Card>
      ) : null}

      {/* Resultado */}
      {modo === 'objetivo' ? (
        <Card style={[styles.destaque, { borderColor: `${colors.gold}66` }]}>
          <Text style={styles.label}>Aporte mensal necessário</Text>
          <Text style={[styles.big, { color: colors.gold }]}>{formatCurrency(aporteMensal)}</Text>
          <Text style={styles.muted}>
            para ter {formatCurrency(num(alvo))} líquidos em {prazoTxt}, já descontadas taxas e IR
          </Text>
        </Card>
      ) : null}

      <Card style={{ marginTop: spacing.md, gap: spacing.sm }}>
        <Text style={styles.label}>Valor líquido em {prazoTxt}</Text>
        <Text style={styles.big}>{formatCurrency(r.saldoLiquido)}</Text>
        <Text style={styles.muted}>
          ≈ {formatCurrency(r.valorReal)} em valores de hoje (descontado IPCA de {ipca}% a.a.)
        </Text>
        <View style={styles.divider} />
        <Linha label="Total investido" valor={formatCurrency(r.totalInvestido)} />
        <Linha label={`Rendimento bruto (${pct(r.taxaAnualBruta)} a.a.)`} valor={formatCurrency(r.rendimentoBruto + r.taxasAdmCustodia + r.taxasEntrada)} cor={colors.success} />
        {r.taxasAdmCustodia > 0 ? <Linha label="Taxas de administração/custódia" valor={`- ${formatCurrency(r.taxasAdmCustodia)}`} cor={colors.danger} /> : null}
        {r.taxasEntrada > 0 ? <Linha label="Carregamento/corretagem" valor={`- ${formatCurrency(r.taxasEntrada)}`} cor={colors.danger} /> : null}
        <Linha label="Imposto de renda" valor={r.ir > 0 ? `- ${formatCurrency(r.ir)}` : 'Isento'} cor={r.ir > 0 ? colors.danger : colors.success} />
        <View style={styles.divider} />
        <Linha label="Rendimento líquido" valor={formatCurrency(r.rendimentoLiquido)} cor={r.rendimentoLiquido >= 0 ? colors.success : colors.danger} forte />
        <Linha label="Rentabilidade líquida no período" valor={pct(r.rentabilidadeLiquida)} />
        <Linha label="Equivalente ao ano (líquido)" valor={pct(r.taxaAnualLiquida)} />
        {perfil !== 'POUPANCA' ? (
          <Linha
            label="Diferença vs. poupança"
            valor={formatCurrency(r.saldoLiquido - poupanca.saldoLiquido, { sign: true })}
            cor={r.saldoLiquido >= poupanca.saldoLiquido ? colors.success : colors.danger}
          />
        ) : null}
      </Card>

      {r.evolucao.length > 1 ? (
        <>
          <SectionTitle title="Evolução" />
          <Card style={{ gap: spacing.sm }}>
            {r.evolucao.map((e) => (
              <View key={e.mes} style={styles.evoRow}>
                <Text style={styles.evoLabel}>{e.mes % 12 === 0 ? `Ano ${e.mes / 12}` : `Mês ${e.mes}`}</Text>
                <View style={{ flex: 1, gap: 3 }}>
                  <ProgressBar progress={e.saldo / maxEvo} color={colors.gold} height={8} />
                  <ProgressBar progress={e.investido / maxEvo} color={colors.input} height={4} />
                </View>
                <Text style={styles.evoValor}>{formatCurrency(e.saldo)}</Text>
              </View>
            ))}
            <Text style={styles.muted}>Dourado: saldo após taxas (antes do IR) • Cinza: total investido</Text>
          </Card>
        </>
      ) : null}

      <SectionTitle title="Comparar perfis" />
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.muted}>Mesmos valores e prazo, com as taxas padrão de cada perfil.</Text>
        {comparativo.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => aplicarPerfil(c.id)} style={{ gap: 4 }}>
            <View style={styles.linha}>
              <Text style={[styles.linhaLabel, c.id === perfil && { color: colors.text, fontWeight: '800' }]}>
                {PERFIS[c.id].icone} {PERFIS[c.id].nome}
              </Text>
              <Text style={styles.linhaValor}>{formatCurrency(c.liquido)}</Text>
            </View>
            <ProgressBar progress={c.liquido / maxComp} color={c.id === perfil ? colors.gold : colors.primary} height={5} />
          </TouchableOpacity>
        ))}
        <Text style={styles.muted}>
          Simulação estimativa: rentabilidade passada ou esperada não garante resultado futuro. IOF (resgates em menos de 30
          dias) e come-cotas não são considerados.
        </Text>
      </Card>
    </View>
  );
}

function Linha({ label, valor, cor, forte }: { label: string; valor: string; cor?: string; forte?: boolean }) {
  return (
    <View style={styles.linha}>
      <Text style={[styles.linhaLabel, forte && { color: colors.text, fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.linhaValor, cor ? { color: cor } : null, forte && { fontWeight: '800' }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  perfis: { gap: spacing.sm, paddingBottom: spacing.sm },
  perfil: {
    width: 92,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.md,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  perfilSel: { borderColor: colors.gold, backgroundColor: 'rgba(214,158,46,0.12)' },
  perfilNome: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.border,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  input: { flex: 1, color: colors.text, fontSize: 16 },
  sufixo: { color: colors.textMuted, fontSize: 11, marginLeft: 4 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  toggleTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  destaque: { marginTop: spacing.lg, alignItems: 'center', gap: 4 },
  big: { color: colors.text, fontSize: 30, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  linhaLabel: { color: colors.textSecondary, fontSize: 13, flex: 1 },
  linhaValor: { color: colors.text, fontSize: 14, fontWeight: '700' },
  evoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  evoLabel: { color: colors.textSecondary, fontSize: 12, width: 52 },
  evoValor: { color: colors.text, fontSize: 12, fontWeight: '700', width: 104, textAlign: 'right' },
});
