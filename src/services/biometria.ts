import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface InfoBiometria {
  disponivel: boolean;
  /** Ex: "Face ID", "digital" — para os textos da tela. */
  nome: string;
  motivo?: string;
}

export async function infoBiometria(): Promise<InfoBiometria> {
  if (Platform.OS === 'web') return { disponivel: false, nome: 'biometria', motivo: 'Não disponível no navegador.' };
  const [hardware, cadastrada, tipos] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const T = LocalAuthentication.AuthenticationType;
  const nome = tipos.includes(T.FACIAL_RECOGNITION)
    ? Platform.OS === 'ios'
      ? 'Face ID'
      : 'reconhecimento facial'
    : tipos.includes(T.FINGERPRINT)
      ? Platform.OS === 'ios'
        ? 'Touch ID'
        : 'digital'
      : 'biometria';
  if (!hardware) return { disponivel: false, nome, motivo: 'Este aparelho não tem biometria.' };
  if (!cadastrada) return { disponivel: false, nome, motivo: `Cadastre ${nome} nos ajustes do aparelho primeiro.` };
  return { disponivel: true, nome };
}

/** Pede a biometria; se falhar, o sistema oferece a senha do aparelho. */
export async function autenticar(mensagem = 'Desbloquear o Trincash'): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage: mensagem,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar senha do aparelho',
    disableDeviceFallback: false,
  });
  return r.success;
}
