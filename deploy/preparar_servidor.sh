#!/usr/bin/env bash
# =====================================================================
# TRINCASH — Preparar um servidor Ubuntu da Oracle para servir o app web
# Rode NO SERVIDOR uma única vez:  bash preparar_servidor.sh [dominio]
# (Testado no Ubuntu 20.04 e 24.04 Minimal da Oracle.)
#
#   Sem domínio:  o app fica em http://IP-DO-SERVIDOR (sem HTTPS)
#   Com domínio:  o Caddy emite o certificado HTTPS sozinho (Let's Encrypt)
#                 e redireciona http://IP para https://dominio.
#                 O domínio precisa apontar (registro A) para o IP antes.
#                 Sem domínio próprio, use o sslip.io: para o IP 1.2.3.4,
#                 o nome 1-2-3-4.sslip.io já aponta para ele (grátis, sem conta).
#
# 1. Limpa o que o app não usa: Docker, LXD, ModemManager, udisks2.
#    Mantém SSH, atualizações de segurança, Oracle Cloud Agent (e snapd)
#    e iscsid/multipathd (discos da Oracle).
# 2. Cria 1 GB de swap (as instâncias gratuitas têm 1 GB de RAM).
# 3. Instala o Caddy (servidor web) e o rsync, libera 80/443 no firewall
#    do Ubuntu e cria /var/www/trincash.
# 4. Segurança: SSH só por chave (sem root, sem X11, 3 tentativas),
#    fail2ban contra força bruta no SSH, rpcbind desligado e atualizações
#    de segurança aplicadas.
# No painel da Oracle, a porta 80 (e 443, com domínio) precisa estar
# liberada nas regras de entrada da subnet (Security List).
# =====================================================================
set -euo pipefail
DOMINIO="${1:-}"

echo "==> Docker"
if command -v docker >/dev/null; then
  if [ -n "$(sudo docker ps -aq)" ] || [ -n "$(sudo docker volume ls -q)" ]; then
    echo "   Há containers ou volumes no Docker; não removi. Apague-os antes se não forem necessários."
  else
    sudo systemctl disable --now docker.service docker.socket containerd.service 2>/dev/null || true
    sudo apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin docker-ce-rootless-extras 2>/dev/null || true
    sudo rm -rf /var/lib/docker /var/lib/containerd /etc/apt/sources.list.d/docker.list
    echo "   Docker removido."
  fi
else
  echo "   Não instalado."
fi

echo "==> LXD"
if snap list lxd >/dev/null 2>&1; then sudo snap remove --purge lxd; else echo "   Não instalado."; fi

echo "==> Serviços sem uso em servidor"
for s in ModemManager udisks2; do
  sudo systemctl disable --now "$s" 2>/dev/null && echo "   $s desativado." || true
done

echo "==> Swap de 1 GB"
if swapon --show | grep -q .; then
  echo "   Já existe swap."
else
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  # Usa a swap só quando a RAM aperta.
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-trincash-swap.conf >/dev/null
  sudo sysctl -q -p /etc/sysctl.d/99-trincash-swap.conf
  echo "   Swap criada."
fi

echo "==> Limpando pacotes e caches que sobraram"
sudo apt-get autoremove --purge -y
sudo apt-get clean
sudo journalctl --vacuum-size=100M >/dev/null



echo "==> Instalando o Caddy (repositório oficial) e o rsync"
sudo apt-get update -y
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl rsync
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y caddy

echo "==> Liberando as portas 80 e 443 no firewall do servidor"
# As imagens Ubuntu da Oracle trazem uma regra REJECT no fim do INPUT;
# as regras de liberação precisam ficar antes dela.
for porta in 80 443; do
  regra=(-p tcp -m state --state NEW --dport "$porta" -j ACCEPT)
  sudo iptables -C INPUT "${regra[@]}" 2>/dev/null || sudo iptables -I INPUT 5 "${regra[@]}"
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
	@pagina not path /_expo/* /assets/*
	header @pagina Cache-Control "no-cache"

	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		X-Frame-Options DENY
		# Com HTTPS, o navegador passa a usar sempre https neste endereço
		# (ignorado quando o site é servido só por http).
		Strict-Transport-Security "max-age=31536000"
		# O app não usa câmera, microfone nem localização
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		# Não anuncia qual servidor web está rodando
		-Server
	}

	# App de página única: qualquer caminho cai no index.html
	try_files {path} /index.html
	file_server
}
CADDY
if [ -n "$DOMINIO" ]; then
  # Quem acessar pelo IP (http://IP) é levado para o endereço com HTTPS.
  sudo tee -a /etc/caddy/Caddyfile >/dev/null <<CADDY

:80 {
	redir https://$DOMINIO{uri} permanent
}
CADDY
fi
sudo caddy validate --config /etc/caddy/Caddyfile >/dev/null
sudo systemctl enable --now caddy
sudo systemctl reload caddy

echo "==> Segurança: SSH só por chave"
sudo tee /etc/ssh/sshd_config.d/10-trincash-hardening.conf >/dev/null <<'CONF'
# Endurecimento do SSH (Trincash) — acesso só por chave, usuário ubuntu
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
CONF
sudo sshd -t && sudo systemctl reload ssh

echo "==> Segurança: fail2ban (bloqueia IPs que erram o login do SSH)"
sudo apt-get install -y fail2ban
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'CONF'
[sshd]
enabled  = true
backend  = systemd
maxretry = 5
findtime = 10m
bantime  = 1h
# Reincidentes ficam bloqueados por mais tempo (até 1 semana)
bantime.increment = true
bantime.maxtime   = 1w
CONF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban

echo "==> Segurança: rpcbind (compartilhamento NFS, sem uso aqui)"
sudo systemctl disable --now rpcbind.socket rpcbind.service 2>/dev/null || true

echo "==> Segurança: atualizações"
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -o Dpkg::Options::=--force-confold upgrade
[ -f /var/run/reboot-required ] && echo "   Reinicie o servidor (sudo reboot) para aplicar as atualizações do sistema."

echo "==> Resultado"
free -h | head -3
df -h / | tail -1
echo "==> Pronto. Envie o app com: bash deploy/publicar.sh ubuntu@IP (no Codespace)."
