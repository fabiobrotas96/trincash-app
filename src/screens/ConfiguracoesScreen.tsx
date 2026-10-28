import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useState, type ReactNode } from 'react';
import { DevSettings, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Chip, Input, PrimaryButton, ScreenHeader, SectionTitle, type IconName } from '../components/ui';
import { autenticar, infoBiometria, type InfoBiometria } from '../services/biometria';
import { useConfig, type Config } from '../services/config';
import { notificacoesSuportadas, pedirPermissao, temPermissao } from '../services/notificacoes';
import { errorMessage, getUserId, supabase } from '../services/supabase';
import { colors, radius, spacing } from '../theme';
import { Alert } from '../utils/alert';

const TEMAS: { value: Config['tema']; label: string; icone: IconName }[] = [
  { value: 'escuro', label: 'Escuro', icone: 'moon' },
  { value: 'claro', label: 'Claro', icone: 'sunny' },
  { value: 'sistema', label: 'Sistema', icone: 'phone-portrait-outline' },
];

/** Recarrega o app para aplicar o novo tema (os estilos são criados na carga). */
function recarregarApp() {
  if (Platform.OS === 'web') {
    window.location.reload();
  } else if (__DEV__) {
    DevSettings.reload();
  } else {
    Alert.alert('Tema salvo', 'Feche e abra o app para aplicar o novo tema.');
  }
}

function Linha({
  icone,
  titulo,
  descricao,
  valor,
  onChange,
  disabled,
}: {
  icone: IconName;
  titulo: string;
  descricao?: string;
  valor: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.linha, disabled && { opacity: 0.5 }]}>
      <Ionicons name={icone} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.linhaTitulo}>{titulo}</Text>
        {descricao ? <Text style={styles.muted}>{descricao}</Text> : null}
      </View>
      <Switch
        value={valor}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: colors.input }}
        thumbColor={Platform.OS === 'android' ? colors.onAccent : undefined}
      />
    </View>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <View style={styles.sub}>{children}</View>;
}

export default function ConfiguracoesScreen() {
  const navigation = useNavigation();
  const { config, atualizar } = useConfig();

  // Perfil
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [emailNovo, setEmailNovo] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);

  // Estado do aparelho
  const [bio, setBio] = useState<InfoBiometria | null>(null);
  const [permNotif, setPermNotif] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, userId] = await Promise.all([supabase.auth.getUser(), getUserId()]);
      setEmail(data.user?.email ?? '');
      const { data: perfil } = await supabase.from('usuarios').select('nome').eq('id', userId).maybeSingle();
      setNome((perfil?.nome as string | undefined) ?? '');
    })().catch((err) => Alert.alert('Erro', errorMessage(err)));
    infoBiometria().then(setBio);
    temPermissao().then(setPermNotif);
  }, []);

  // ---------------- Perfil ----------------

  const salvarNome = async () => {
    const n = nome.trim();
    if (!n) return Alert.alert('Atenção', 'Informe seu nome.');
    setSalvando('nome');
    try {
      const userId = await getUserId();
      const { error } = await supabase.from('usuarios').update({ nome: n }).eq('id', userId);
      if (error) throw error;
      await supabase.auth.updateUser({ data: { nome: n } });
      Alert.alert('Pronto', 'Nome atualizado.');
    } catch (err) {
      Alert.alert('Erro ao salvar nome', errorMessage(err));
    } finally {
      setSalvando(null);
    }
  };

  const alterarEmail = async () => {
    const e = emailNovo.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return Alert.alert('Atenção', 'Informe um e-mail válido.');
    setSalvando('email');
    try {
      const { error } = await supabase.auth.updateUser({ email: e });
      if (error) throw error;
      setEmailNovo('');
      Alert.alert('Confirme a troca', `Enviamos um link de confirmação para ${e}. O e-mail muda depois que você confirmar.`);
    } catch (err) {
      Alert.alert('Erro ao alterar e-mail', errorMessage(err));
    } finally {
      setSalvando(null);
    }
  };

  const alterarSenha = async () => {
    if (senha.length < 6) return Alert.alert('Atenção', 'A nova senha deve ter pelo menos 6 caracteres.');
    if (senha !== senha2) return Alert.alert('Atenção', 'As senhas não conferem.');
    setSalvando('senha');
    try {
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setSenha('');
      setSenha2('');
      Alert.alert('Pronto', 'Senha alterada.');
    } catch (err) {
      Alert.alert('Erro ao alterar senha', errorMessage(err));
    } finally {
      setSalvando(null);
    }
  };

  // ---------------- Aparência ----------------

  const mudarTema = (tema: Config['tema']) => {
    if (tema === config.tema) return;
    Alert.alert('Mudar tema', 'O app será recarregado para aplicar o novo tema.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aplicar',
        onPress: async () => {
          await atualizar({ tema });
          recarregarApp();
        },
      },
    ]);
  };

  // ---------------- Notificações ----------------

  const ligarNotificacao = async (parcial: Partial<Config>) => {
    const ligando = Object.values(parcial).some((v) => v === true);
    if (ligando && !(await pedirPermissao())) {
      setPermNotif(false);
      return Alert.alert(
        'Notificações bloqueadas',
        'Permita as notificações do app nos Ajustes do aparelho para receber os alertas.',
      );
    }
    setPermNotif(await temPermissao());
    await atualizar(parcial);
  };

  // ---------------- Segurança ----------------

  const alternarBiometria = async (ligar: boolean) => {
    if (!ligar) {
      // Confirma a identidade antes de desligar a proteção.
      if (await autenticar('Confirme para desativar o bloqueio')) await atualizar({ bloqueioBiometria: false });
      return;
    }
    const info = await infoBiometria();
    if (!info.disponivel) return Alert.alert('Biometria indisponível', info.motivo ?? 'Não foi possível usar a biometria.');
    if (await autenticar(`Ativar ${info.nome} no Trincash`)) await atualizar({ bloqueioBiometria: true });
  };

  const sairDeTodos = () => {
    Alert.alert('Sair de todos os aparelhos', 'Encerra a sessão em todos os dispositivos, inclusive este.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair de todos',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.auth.signOut({ scope: 'global' });
          if (error) Alert.alert('Erro', errorMessage(error));
        },
      },
    ]);
  };

  const sair = () => {
    Alert.alert('Sair', 'Deseja sair da sua conta neste aparelho?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const excluirConta = () => {
    Alert.alert(
      'Excluir minha conta',
      'Todos os seus dados (contas, cartões, lançamentos, investimentos, bens, metas) serão apagados permanentemente. Isso não pode ser desfeito.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Tem certeza?', 'Última confirmação: excluir a conta e todos os dados agora?', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Excluir tudo',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await supabase.rpc('excluir_minha_conta');
                  if (error) return Alert.alert('Erro ao excluir conta', errorMessage(error));
                  await supabase.auth.signOut({ scope: 'local' });
                },
              },
            ]),
        },
      ],
    );
  };

  const versao = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Configurações" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Perfil */}
        <SectionTitle title="Dados do usuário" />
        <Card style={{ gap: spacing.sm }}>
          <Input label="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" maxLength={120} />
          <PrimaryButton title="Salvar nome" variant="outline" onPress={salvarNome} loading={salvando === 'nome'} />
          <View style={styles.divider} />
          <Text style={styles.label}>E-mail atual</Text>
          <Text style={styles.valor}>{email}</Text>
          <Input
            label="Novo e-mail"
            placeholder="novo@email.com"
            value={emailNovo}
            onChangeText={setEmailNovo}
            autoCapitalize="none"
            keyboardType="email-address"
            style={{ marginTop: spacing.sm }}
          />
          <PrimaryButton title="Alterar e-mail" variant="outline" onPress={alterarEmail} loading={salvando === 'email'} />
          <View style={styles.divider} />
          <Input label="Nova senha" value={senha} onChangeText={setSenha} secureTextEntry placeholder="Mínimo 6 caracteres" />
          <Input label="Confirmar nova senha" value={senha2} onChangeText={setSenha2} secureTextEntry />
          <PrimaryButton title="Alterar senha" variant="outline" onPress={alterarSenha} loading={salvando === 'senha'} />
        </Card>

        {/* Aparência */}
        <SectionTitle title="Aparência" />
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.label}>Tema do app</Text>
          <View style={styles.temas}>
            {TEMAS.map((t) => {
              const sel = config.tema === t.value;
              return (
                <TouchableOpacity key={t.value} style={[styles.tema, sel && styles.temaSel]} onPress={() => mudarTema(t.value)}>
                  <Ionicons name={t.icone} size={22} color={sel ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.temaText, sel && { color: colors.text }]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.muted}>"Sistema" segue o modo claro/escuro do aparelho ao abrir o app.</Text>
        </Card>

        {/* Notificações */}
        <SectionTitle title="Alertas e notificações" />
        <Card style={{ gap: spacing.xs }}>
          {!notificacoesSuportadas ? (
            <Text style={styles.muted}>Notificações não estão disponíveis no navegador. Use o app no celular.</Text>
          ) : permNotif === false ? (
            <View style={styles.aviso}>
              <Ionicons name="notifications-off-outline" size={18} color={colors.warning} />
              <Text style={[styles.muted, { flex: 1 }]}>
                As notificações estão desativadas para o app. Ative um alerta abaixo ou permita nos Ajustes do aparelho.
              </Text>
            </View>
          ) : null}
          <Linha
            icone="card-outline"
            titulo="Vencimento de faturas"
            descricao={`Avisa ${config.notifFaturaDias} dia(s) antes e no dia do vencimento, às 9h`}
            valor={config.notifFatura}
            onChange={(v) => ligarNotificacao({ notifFatura: v })}
            disabled={!notificacoesSuportadas}
          />
          {config.notifFatura && notificacoesSuportadas ? (
            <Sub>
              {[1, 3, 5, 7].map((d) => (
                <Chip key={d} label={`${d} dia${d > 1 ? 's' : ''} antes`} selected={config.notifFaturaDias === d} onPress={() => atualizar({ notifFaturaDias: d })} />
              ))}
            </Sub>
          ) : null}
          <Linha
            icone="pie-chart-outline"
            titulo="Limites de orçamento"
            descricao="Avisa quando uma categoria atinge o percentual de alerta"
            valor={config.notifOrcamento}
            onChange={(v) => ligarNotificacao({ notifOrcamento: v })}
            disabled={!notificacoesSuportadas}
          />
          <Linha
            icone="time-outline"
            titulo="Lançamentos pendentes"
            descricao="Avisa no dia de recorrências e lançamentos futuros"
            valor={config.notifPendentes}
            onChange={(v) => ligarNotificacao({ notifPendentes: v })}
            disabled={!notificacoesSuportadas}
          />
          <Linha
            icone="create-outline"
            titulo="Lembrete diário"
            descricao={`Lembra de registrar os gastos às ${config.notifLembreteHora}h`}
            valor={config.notifLembreteDiario}
            onChange={(v) => ligarNotificacao({ notifLembreteDiario: v })}
            disabled={!notificacoesSuportadas}
          />
          {config.notifLembreteDiario && notificacoesSuportadas ? (
            <Sub>
              {[8, 12, 18, 20, 22].map((h) => (
                <Chip key={h} label={`${h}h`} selected={config.notifLembreteHora === h} onPress={() => atualizar({ notifLembreteHora: h })} />
              ))}
            </Sub>
          ) : null}
        </Card>

        {/* Segurança */}
        <SectionTitle title="Segurança" />
        <Card style={{ gap: spacing.xs }}>
          <Linha
            icone={bio?.nome === 'Face ID' ? 'scan-outline' : 'finger-print'}
            titulo={`Desbloquear com ${bio?.nome ?? 'biometria'}`}
            descricao={
              bio && !bio.disponivel
                ? bio.motivo
                : 'Você continua logado; ao abrir o app, ele pede a biometria (ou a senha do aparelho).'
            }
            valor={config.bloqueioBiometria}
            onChange={alternarBiometria}
            disabled={!bio?.disponivel && !config.bloqueioBiometria}
          />
          {config.bloqueioBiometria ? (
            <Sub>
              {[
                { m: 0, l: 'Sempre' },
                { m: 1, l: 'Após 1 min' },
                { m: 5, l: 'Após 5 min' },
                { m: 15, l: 'Após 15 min' },
              ].map((o) => (
                <Chip key={o.m} label={o.l} selected={config.bloqueioMinutos === o.m} onPress={() => atualizar({ bloqueioMinutos: o.m })} />
              ))}
              <Text style={[styles.muted, { width: '100%' }]}>Quando bloquear ao voltar para o app depois de sair dele.</Text>
            </Sub>
          ) : null}
          <Linha
            icone="eye-off-outline"
            titulo="Ocultar valores"
            descricao="Mostra R$ ••••• no lugar dos valores (bom para usar em público)"
            valor={config.ocultarValores}
            onChange={(v) => atualizar({ ocultarValores: v })}
          />
          <View style={styles.divider} />
          <TouchableOpacity style={styles.acao} onPress={sairDeTodos}>
            <Ionicons name="phone-portrait-outline" size={20} color={colors.warning} />
            <Text style={[styles.linhaTitulo, { color: colors.warning }]}>Sair de todos os aparelhos</Text>
          </TouchableOpacity>
        </Card>

        {/* Conta */}
        <SectionTitle title="Conta" />
        <Card style={{ gap: spacing.xs }}>
          <TouchableOpacity style={styles.acao} onPress={sair}>
            <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
            <Text style={styles.linhaTitulo}>Sair deste aparelho</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acao} onPress={excluirConta}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.linhaTitulo, { color: colors.danger }]}>Excluir minha conta</Text>
          </TouchableOpacity>
        </Card>

        <Text style={styles.versao}>Trincash v{versao}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  valor: { color: colors.text, fontSize: 15, fontWeight: '600' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  temas: { flexDirection: 'row', gap: spacing.sm },
  tema: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  temaSel: { borderColor: colors.primary },
  temaText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  linhaTitulo: { color: colors.text, fontWeight: '600', fontSize: 15 },
  sub: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: 36, paddingBottom: spacing.sm },
  aviso: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingBottom: spacing.sm },
  acao: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  versao: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
});
