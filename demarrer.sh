#!/data/data/com.termux/files/usr/bin/sh
# Démarre le panneau sur la tablette (Termux) et le relance tout seul s'il s'arrête
# (par exemple après le bouton « Mettre à jour »). Ctrl+C deux fois pour tout arrêter.
cd "$(dirname "$0")"
[ -f config.json ] || cp config.example.json config.json

# Déjà en marche? On ne le lance pas une 2e fois.
if node -e "require('http').get('http://127.0.0.1:'+(require('./config.json').port||8080)+'/api/plugins',()=>process.exit(0)).on('error',()=>process.exit(1))" 2>/dev/null; then
  echo "Le panneau roule déjà."
  exit 0
fi

termux-wake-lock 2>/dev/null
while true; do
  git pull -q --ff-only 2>/dev/null
  node server.js
  echo "Le panneau redémarre dans 2 secondes... (Ctrl+C pour arrêter)"
  sleep 2 || break
done
