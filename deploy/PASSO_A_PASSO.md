# Trincash web — o que falta fazer manualmente

O app já está publicado na instância nova (Ubuntu 24.04): **http://147.15.48.165**
e o Supabase já aponta para esse endereço.

## Apagar a instância antiga *(painel da Oracle)*

Depois de testar o app no endereço novo (login, uma conta, um cartão):

**Compute → Instances →** instância antiga (IP `147.15.63.192`, Ubuntu 20.04)
**→ More actions → Terminate**, marcando *Permanently delete the attached boot volume*.

No Supabase (**Authentication → URL Configuration → Redirect URLs**) pode remover
o endereço antigo `http://147.15.63.192/**`, se ainda estiver lá.

Depois de feito, este arquivo pode ser apagado.
