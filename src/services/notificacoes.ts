import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Config } from './config';
import { supabase } from './supabase';
import { addDays, formatCurrency, formatMesAno, parseISODate, toISODate, today } from '../utils/format';

/**
 * Notificações locais (agendadas no próprio aparelho, sem servidor de push).
 * Sempre que algo muda, reagendar() cancela tudo e agenda de novo a partir
 * dos dados atuais. O iOS permite até 64 agendamentos por app.
 */

const LIMITE_AGENDAMENTOS = 60;
const HORA_AVISOS = 9;

export const notificacoesSuportadas = Platform.OS !== 'web';

if (notificacoesSuportadas) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function temPermissao(): Promise<boolean> {
  if (!notificacoesSuportadas) return false;
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function pedirPermissao(): Promise<boolean> {
  if (!notificacoesSuportadas) return false;
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  if (!atual.canAskAgain) return false;
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

function as(hora: number, d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora, 0, 0);
}

/** Cancela e reagenda todas as notificações conforme as preferências. */
export async function reagendar(config: Config): Promise<void> {
  if (!notificacoesSuportadas) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(await temPermissao())) return;

  const agora = new Date();
  const agendamentos: { titulo: string; corpo: string; quando: Date }[] = [];

  if (config.notifFatura) {
    const { data } = await supabase
      .from('faturas_cartao')
      .select('valor_total, data_vencimento, mes_ano_referencia, status, cartoes_credito(nome)')
      .neq('status', 'PAGA')
      .gt('valor_total', 0)
      .gte('data_vencimento', toISODate(today()))
      .lte('data_vencimento', toISODate(addDays(today(), 90)))
      .order('data_vencimento');
    for (const f of (data ?? []) as unknown as {
      valor_total: number;
      data_vencimento: string;
      mes_ano_referencia: string;
      cartoes_credito: { nome: string } | null;
    }[]) {
      const venc = parseISODate(f.data_vencimento);
      const nome = f.cartoes_credito?.nome ?? 'cartão';
      const valor = formatCurrency(Number(f.valor_total));
      agendamentos.push({
        titulo: `Fatura ${nome} vence em ${config.notifFaturaDias} dia${config.notifFaturaDias > 1 ? 's' : ''}`,
        corpo: `${formatMesAno(f.mes_ano_referencia)}: ${valor}. Programe o pagamento.`,
        quando: as(HORA_AVISOS, addDays(venc, -config.notifFaturaDias)),
      });
      agendamentos.push({
        titulo: `Fatura ${nome} vence hoje`,
        corpo: `${valor} — não esqueça de pagar.`,
        quando: as(HORA_AVISOS, venc),
      });
    }
  }

  if (config.notifPendentes) {
    const { data } = await supabase
      .from('transacoes')
      .select('descricao, valor, data_transacao')
      .eq('status', 'PENDENTE')
      .gte('data_transacao', toISODate(today()))
      .lte('data_transacao', toISODate(addDays(today(), 31)))
      .order('data_transacao');
    for (const t of (data ?? []) as { descricao: string; valor: number; data_transacao: string }[]) {
      agendamentos.push({
        titulo: 'Lançamento previsto para hoje',
        corpo: `${t.descricao || 'Lançamento'}: ${formatCurrency(Number(t.valor), { sign: true })}. Toque em Extrato para efetivar.`,
        quando: as(HORA_AVISOS, parseISODate(t.data_transacao)),
      });
    }
  }

  const futuros = agendamentos
    .filter((a) => a.quando > agora)
    .sort((a, b) => a.quando.getTime() - b.quando.getTime())
    .slice(0, LIMITE_AGENDAMENTOS - 1);

  for (const a of futuros) {
    await Notifications.scheduleNotificationAsync({
      content: { title: a.titulo, body: a.corpo },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.quando },
    });
  }

  if (config.notifLembreteDiario) {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Trincash', body: 'Já registrou os gastos de hoje? Leva só alguns segundos.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: config.notifLembreteHora, minute: 0 },
    });
  }
}

/** Aviso imediato quando uma categoria atinge o percentual de alerta do orçamento. */
export async function notificarOrcamento(categoria: string, percentual: number): Promise<void> {
  if (!(await temPermissao())) return;
  const estourou = percentual >= 1;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: estourou ? `Limite de ${categoria} ultrapassado` : `${categoria}: ${Math.round(percentual * 100)}% do limite`,
      body: estourou ? 'Você passou do teto definido para este mês.' : 'Atenção ao ritmo de gastos nesta categoria.',
    },
    trigger: null,
  });
}
