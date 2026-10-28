import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert que também funciona no navegador. No react-native-web o
 * Alert.alert nativo é uma função vazia: confirmações e mensagens somem e
 * botões que dependem delas parecem não fazer nada. Na web usamos
 * window.confirm / window.alert; no iOS/Android, o Alert nativo.
 */
function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    NativeAlert.alert(title, message, buttons);
    return;
  }

  const texto = message ? `${title}\n\n${message}` : title;
  const cancelar = buttons?.find((b) => b.style === 'cancel');
  const acoes = (buttons ?? []).filter((b) => b.style !== 'cancel');

  if (acoes.length === 0) {
    window.alert(texto);
    cancelar?.onPress?.();
    return;
  }

  // Um único botão sem "Cancelar" é só um aviso com OK.
  if (acoes.length === 1 && !cancelar) {
    window.alert(texto);
    acoes[0].onPress?.();
    return;
  }

  // Cancelar + ação (o caso do app: Confirmar, Excluir, Sair…) → confirm().
  // Com várias ações, oferece cada uma em sequência até o usuário aceitar.
  for (const acao of acoes) {
    const pergunta = acoes.length > 1 ? `${texto}\n\n${acao.text}?` : texto;
    if (window.confirm(pergunta)) {
      acao.onPress?.();
      return;
    }
  }
  cancelar?.onPress?.();
}

export const Alert = { alert };
