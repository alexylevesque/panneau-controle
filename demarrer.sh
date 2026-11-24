#!/data/data/com.termux/files/usr/bin/sh
# Démarre le panneau sur la tablette (Termux) et le relance tout seul s'il s'arrête
# (par exemple après le bouton « Mettre à jour »). Ctrl+C deux fois pour tout arrêter.
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null
[ -f config.json ] || cp config.example.json config.json
while true; do
  git pull -q --ff-only 2>/dev/null
  node server.js
  echo "Le panneau redémarre dans 2 secondes... (Ctrl+C pour arrêter)"
  sleep 2 || break
done
