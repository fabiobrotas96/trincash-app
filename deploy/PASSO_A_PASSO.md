# Trincash web — o que falta fazer manualmente

O app agora abre com HTTPS (sem o aviso "Não seguro") em:

**https://147-15-48-165.sslip.io**

O endereço antigo `http://147.15.48.165` redireciona para ele automaticamente.

## Supabase: trocar para o endereço seguro *(painel do Supabase)*

Em **Authentication → URL Configuration**:

- **Site URL**: `https://147-15-48-165.sslip.io`
- **Redirect URLs**: adicione `https://147-15-48-165.sslip.io/**`
  (pode remover os endereços `http://...` antigos)

Sem isso, os links de confirmação de e-mail e de troca de senha abrem o endereço sem HTTPS.

Depois de feito, este arquivo pode ser apagado.
