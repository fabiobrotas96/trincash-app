# Migrar o Trincash web para uma instância Ubuntu 24.04

Ideia: criar uma instância nova já com o 24.04, o Claude prepara e publica o app nela,
você aponta o Supabase para o novo endereço e só então apaga a instância antiga.
O app atual (http://147.15.63.192) continua no ar até a troca.

---

## Passo 1 — Ver se o IP atual é reservado *(painel da Oracle)*

**Compute → Instances →** instância atual **→ Attached VNICs →** a VNIC **→ IPv4 Addresses**.
Veja a coluna *Public IP*:

- **Reserved** → dá para levar o mesmo IP `147.15.63.192` para a instância nova
  (aí o Supabase não precisa mudar). Me avise, que eu incluo o passo de troca do IP.
- **Ephemeral** (o mais comum) → a instância nova terá outro IP; tudo bem, só muda o
  endereço no Supabase no passo 4.

## Passo 2 — Criar a instância nova *(painel da Oracle)*

**Compute → Instances → Create instance**:

- **Name**: `trincash-web` (ou o que preferir)
- **Image**: clique em *Change image* → **Canonical Ubuntu** → **24.04 Minimal**
  (a versão *Minimal* usa menos memória, ideal para 1 GB)
- **Shape**: o mesmo da atual (ex: `VM.Standard.E2.1.Micro`, do plano gratuito)
- **Networking**: a **mesma VCN e subnet** da instância atual (assim a porta 80 já vem liberada)
  e **Assign a public IPv4 address** marcado
- **Add SSH keys** → *Paste public keys* → cole **as duas** chaves, uma por linha:
  - a sua (a mesma que você usa hoje no PowerShell)
  - a do Claude:
    ```
    ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEGy4Rq/xRxlFieuoHblzEN/CdQ9sG9nI/Yol8WmTMHT trincash-codespace
    ```
- **Create**. Quando ficar *Running*, me mande o **IP público** novo.

> No plano gratuito cabem duas instâncias Micro, então dá para ter a nova e a antiga ao mesmo tempo.

## Passo 3 — Preparar e publicar *(o Claude faz pelo SSH)*

Limpeza + swap, instalação do Caddy, firewall e envio do app — os mesmos scripts de `deploy/`.
Ao final, o app abre em `http://IP-NOVO`.

## Passo 4 — Apontar o Supabase para o novo endereço *(painel do Supabase)*

**Authentication → URL Configuration**:

- **Site URL**: `http://IP-NOVO`
- **Redirect URLs**: adicione `http://IP-NOVO/**` (pode remover o do IP antigo)

## Passo 5 — Desligar a instância antiga *(painel da Oracle)*

Depois de testar o app no IP novo: instância antiga **→ More actions → Terminate**
(marque também *Permanently delete the attached boot volume*).
