#!/usr/bin/env bash
# =====================================================================
# TRINCASH — Preparar o servidor Oracle (Ubuntu) para servir o app web
# Rode NO SERVIDOR uma única vez:  bash 03_preparar_servidor.sh [dominio]
#
#   Sem domínio:  o app fica em http://IP-DO-SERVIDOR (sem HTTPS)
#   Com domínio:  o Caddy emite o certificado HTTPS sozinho (Let's Encrypt).
#                 O domínio precisa apontar (registro A) para o IP antes.
#
# O que faz: instala o Caddy (servidor web), libera as portas 80/443 no
# firewall do Ubuntu e cria a pasta /var/www/trincash para os arquivos.
# Também é preciso liberar 80 e 443 nas regras de entrada da VCN no painel
# da Oracle (Networking > Security Lists / NSG).
# =====================================================================
set -euo pipefail
DOMINIO="${1:-}"

echo "==> Instalando o Caddy (repositório oficial)"
sudo apt-get update -y
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y caddy

echo "==> Liberando as portas 80 e 443 no firewall do servidor"
# As imagens Ubuntu da Oracle trazem uma regra REJECT no fim do INPUT;
# as regras de liberação precisam ficar antes dela.
for porta in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$porta" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$porta" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

echo "==> Criando a pasta do app"
sudo mkdir -p /var/www/trincash
sudo chown "$USER":"$USER" /var/www/trincash

echo "==> Configurando o Caddy"
ENDERECO="${DOMINIO:-:80}"
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$ENDERECO {
	root * /var/www/trincash
	encode zstd gzip

	# Arquivos com hash no nome podem ficar em cache por 1 ano;
	# o index.html nunca, para as atualizações aparecerem na hora.
	@estaticos path /_expo/* /assets/*
	header @estaticos Cache-Control "public, max-age=31536000, immutable"
	header /index.html Cache-Control "no-cache"

	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		X-Frame-Options DENY
	}

	# App de página única: qualquer caminho cai no index.html
	try_files {path} /index.html
	file_server
}
CADDY
sudo systemctl enable --now caddy
sudo systemctl reload caddy

echo "==> Pronto. Envie os arquivos com o 04_publicar.sh (no Codespace)."
