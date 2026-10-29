# Publicar o Trincash (web) na Oracle — passo a passo

Servidor: `ubuntu@147.15.63.192` (Ubuntu 20.04, x86_64, 1 GB de RAM).
O banco e o login continuam no Supabase; o servidor só entrega os arquivos do app.
Sem domínio por enquanto: o app fica em **http://147.15.63.192** (sem HTTPS).

Levantamento (29/10/2026): rsync, curl, gpg e netfilter-persistent já instalados;
nada usando as portas 80/443; o firewall bloqueia tudo exceto SSH (22).

---

## Passo 1 — Abrir a porta 80 no painel da Oracle *(você, no navegador)*

1. No painel da Oracle Cloud: **Compute → Instances →** sua instância.
2. Em **Primary VNIC**, clique na **Subnet** e depois na **Security List** (geralmente "Default Security List").
3. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: `TCP`
   - Destination Port Range: `80`
4. Salve. (A porta 443 só será necessária quando houver domínio/HTTPS.)

## Passo 0 — Limpar o servidor *(você, no terminal conectado ao servidor)*

Remove o que o app não usa (Docker, LXD, ModemManager, udisks2) e cria 1 GB de swap.
Mantém SSH, atualizações de segurança, o agente da Oracle e os serviços de disco.

```bash
curl -fsSL https://raw.githubusercontent.com/fabiobrotas96/trincash-app/main/deploy/00_limpar_servidor.sh -o 00_limpar_servidor.sh && bash 00_limpar_servidor.sh
```

Ao final deve aparecer `==> Limpeza concluída.`

## Passo 2 — Preparar o servidor *(você, no terminal conectado ao servidor)*

Instala o Caddy (servidor web), libera a porta 80/443 no firewall do Ubuntu e cria a pasta do app.
Copie e cole a linha abaixo:

```bash
curl -fsSL https://raw.githubusercontent.com/fabiobrotas96/trincash-app/main/deploy/03_preparar_servidor.sh -o 03_preparar_servidor.sh && bash 03_preparar_servidor.sh
```

Ao final deve aparecer `==> Pronto.`

## Passo 3 — Enviar o app *(no Codespace — o Claude pode rodar)*

Gera a versão web e envia para o servidor. Use também a cada atualização do app:

```bash
bash deploy/04_publicar.sh ubuntu@147.15.63.192
```

## Passo 4 — Ajustar o Supabase *(você, no painel do Supabase)*

**Authentication → URL Configuration**:

- **Site URL**: `http://147.15.63.192`
- **Redirect URLs**: adicione `http://147.15.63.192/**`

Assim os links de confirmação de e-mail e troca de senha abrem o app publicado.

## Passo 5 — Testar

Abra **http://147.15.63.192** no navegador do computador e do celular e faça login.

---

## Observações

- **Sem HTTPS**: o login em si vai criptografado (o app fala com o Supabase por HTTPS),
  mas a página do app chega sem criptografia e o navegador mostra "Não seguro".
  Para uso no dia a dia, vale registrar um domínio (há opções gratuitas, como DuckDNS)
  e rodar o passo 2 de novo com o domínio: `bash 03_preparar_servidor.sh meu.dominio.com`
  — o Caddy emite o certificado sozinho. Aí também é preciso abrir a porta 443 no passo 1.
- **Na versão web** não há biometria nem notificações (só no app Android/iOS).
- **Ubuntu 20.04** não recebe mais atualizações de segurança gratuitas desde abril/2025.
  Funciona para este uso, mas o ideal é migrar a instância para o Ubuntu 22.04 ou 24.04 no futuro.
