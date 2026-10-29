# Trincash web — o que falta fazer manualmente

O app já está publicado em **http://147.15.63.192** (servidor limpo, Caddy instalado,
firewall liberado). Só falta um ajuste que precisa ser feito no painel do Supabase:

## Supabase: endereço do app *(você, no navegador)*

Em **Authentication → URL Configuration**:

- **Site URL**: `http://147.15.63.192`
- **Redirect URLs**: adicione `http://147.15.63.192/**`

Sem isso, os links de confirmação de e-mail e de troca de senha apontam para o
endereço antigo em vez do app publicado.

Depois de feito, este arquivo pode ser apagado.
