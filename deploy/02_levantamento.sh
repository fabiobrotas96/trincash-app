# =====================================================================
# TRINCASH — Levantamento do servidor (só leitura, não altera nada)
# Alternativa ao 01: rode NO SERVIDOR e cole a saída no chat.
# Mostra usuário, sistema, arquitetura, CPU, memória, disco, programas
# instalados e as regras de entrada do firewall.
# =====================================================================

whoami; cat /etc/os-release | head -4; uname -m; nproc; free -h; df -h /; for c in docker node nginx caddy git psql; do printf "%s: " $c; command -v $c || echo "não instalado"; done; sudo iptables -L INPUT -n | head -15
