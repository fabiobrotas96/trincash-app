# =====================================================================
# TRINCASH — Liberar o acesso SSH do Codespace ao servidor Oracle
# Rode NO SERVIDOR (no terminal do PowerShell que está conectado nele).
# Acrescenta a chave pública do Codespace sem apagar as chaves existentes
# e mostra o nome do usuário.
# =====================================================================

echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEGy4Rq/xRxlFieuoHblzEN/CdQ9sG9nI/Yol8WmTMHT trincash-codespace' >> ~/.ssh/authorized_keys && whoami
