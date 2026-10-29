#!/usr/bin/env bash
# =====================================================================
# TRINCASH — Limpar o servidor e deixar só o necessário para o app web
# Rode NO SERVIDOR, antes do 03:  bash 00_limpar_servidor.sh
#
# Remove o que o app não usa e consome memória/disco:
#   - Docker (dockerd + containerd + plugins e /var/lib/docker)
#   - LXD (snap de containers que vem na imagem)
#   - ModemManager e udisks2 (serviços de desktop/modem)
# Cria 1 GB de swap (o servidor tem só 1 GB de RAM).
#
# Mantém: SSH, atualizações automáticas de segurança, Oracle Cloud Agent
# (e o snapd, de que ele depende) e iscsid/multipathd (discos da Oracle).
# =====================================================================
set -euo pipefail

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

echo "==> Resultado"
free -h | head -3
df -h / | tail -1
echo "==> Limpeza concluída. Próximo: 03_preparar_servidor.sh"
