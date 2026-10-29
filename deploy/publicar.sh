#!/usr/bin/env bash
# =====================================================================
# TRINCASH — Gerar a versão web e enviar para o servidor
# Rode NO CODESPACE (na pasta do projeto):  bash deploy/publicar.sh ubuntu@147.15.48.165
#
# Gera o build web (as chaves do .env entram no build) e sincroniza a
# pasta dist/ com /var/www/trincash no servidor. Pode rodar a cada
# atualização do app.
# =====================================================================
set -euo pipefail
DESTINO="${1:?Informe usuario@servidor, ex: ubuntu@147.15.48.165}"
CHAVE="$HOME/.ssh/trincash_oracle"

cd "$(dirname "$0")/.."
echo "==> Gerando a versão web"
rm -rf dist
npx expo export --platform web

echo "==> Enviando para $DESTINO:/var/www/trincash"
rsync -az --delete -e "ssh -i $CHAVE" dist/ "$DESTINO:/var/www/trincash/"

echo "==> Publicado."
