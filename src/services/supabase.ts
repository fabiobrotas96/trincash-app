import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Trincash] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY não configuradas. Copie .env.example para .env.',
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Mantém o refresh do token ativo apenas com o app em primeiro plano.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

// Mesmas categorias criadas por handle_new_user() no supabase_schema.sql.
const CATEGORIAS_PADRAO: { nome: string; tipo: 'DESPESA' | 'RECEITA'; icone: string }[] = [
  { nome: 'Alimentação', tipo: 'DESPESA', icone: '🍽️' },
  { nome: 'Transporte', tipo: 'DESPESA', icone: '🚌' },
  { nome: 'Moradia', tipo: 'DESPESA', icone: '🏠' },
  { nome: 'Lazer', tipo: 'DESPESA', icone: '🎮' },
  { nome: 'Saúde', tipo: 'DESPESA', icone: '🏥' },
  { nome: 'Compras', tipo: 'DESPESA', icone: '🛒' },
  { nome: 'Educação', tipo: 'DESPESA', icone: '📚' },
  { nome: 'Assinaturas', tipo: 'DESPESA', icone: '📺' },
  { nome: 'Outros', tipo: 'DESPESA', icone: '📦' },
  { nome: 'Salário', tipo: 'RECEITA', icone: '💰' },
  { nome: 'Freelance', tipo: 'RECEITA', icone: '💻' },
  { nome: 'Investimentos', tipo: 'RECEITA', icone: '📈' },
  { nome: 'Outras receitas', tipo: 'RECEITA', icone: '💵' },
];

// Uma verificação por usuário enquanto o app estiver aberto.
const perfilGarantido = new Map<string, Promise<void>>();

/**
 * Garante que o usuário tem linha em public.usuarios (e categorias padrão).
 * Normalmente a trigger on_auth_user_created cuida disso; este é o fallback
 * para contas criadas no Auth antes da trigger existir, que de outro modo
 * falhariam em todas as FKs para usuarios.
 */
async function garantirPerfil(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const { data: perfil, error } = await supabase.from('usuarios').select('id').eq('id', user.id).maybeSingle();
  if (error) throw error;
  if (perfil) return;

  const meta = user.user_metadata ?? {};
  const nome =
    (typeof meta.nome === 'string' && meta.nome.trim()) ||
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (user.email ?? '').split('@')[0];

  const { error: insErr } = await supabase
    .from('usuarios')
    .upsert({ id: user.id, nome, email: user.email ?? '' }, { onConflict: 'id', ignoreDuplicates: true });
  if (insErr) throw insErr;

  const { count, error: countErr } = await supabase
    .from('categorias')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', user.id);
  if (countErr) throw countErr;
  if (!count) {
    const { error: catErr } = await supabase
      .from('categorias')
      .insert(CATEGORIAS_PADRAO.map((c) => ({ ...c, usuario_id: user.id })));
    if (catErr) throw catErr;
  }
}

/** Retorna o id do usuário autenticado (com perfil garantido) ou lança erro se não houver sessão. */
export async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  if (!user) throw new Error('Sessão expirada. Faça login novamente.');

  let pending = perfilGarantido.get(user.id);
  if (!pending) {
    pending = garantirPerfil(user);
    perfilGarantido.set(user.id, pending);
    // Se falhar, permite nova tentativa na próxima chamada.
    pending.catch(() => perfilGarantido.delete(user.id));
  }
  await pending;
  return user.id;
}

/** Extrai uma mensagem legível de qualquer erro (Supabase, Error, string). */
export function errorMessage(err: unknown): string {
  if (!err) return 'Erro desconhecido';
  if (typeof err === 'string') return err;
  // Tabela (PGRST205/42P01), coluna (42703/PGRST204) ou função (PGRST202) inexistente:
  // o banco está numa versão anterior do supabase_schema.sql.
  const code = typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  if (['PGRST205', '42P01', '42703', 'PGRST204', 'PGRST202'].includes(code)) {
    return 'Banco de dados desatualizado: execute novamente o supabase_schema.sql no SQL Editor do Supabase.';
  }
  if (typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return 'Erro inesperado';
}
