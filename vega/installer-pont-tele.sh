#!/bin/bash
# Crée (la première fois), compile et installe l'appli « Pont Télé » sur la Fire TV (Vega OS).
# À lancer sur le Mac, dans Terminal :
#   bash -c "$(curl -fsSL https://raw.githubusercontent.com/alexylevesque/panneau-controle/main/vega/installer-pont-tele.sh)"
exec </dev/null   # aucune commande ne doit lire la suite du script au clavier
set -e
DOSSIER="$HOME/pont-tele"
BASE="https://raw.githubusercontent.com/alexylevesque/panneau-controle/main/vega/pont-tele"

[ -f "$HOME/vega/env" ] && source "$HOME/vega/env"
if ! command -v vega >/dev/null 2>&1; then
  echo "❌ L'outil « vega » est introuvable. Fais d'abord l'étape 3 du guide (installer le SDK Vega), puis ferme et rouvre Terminal."
  exit 1
fi

echo "▶ 1/5 Projet"
if [ ! -d "$DOSSIER" ]; then
  cd "$HOME"
  vega project generate --template helloWorld --name "PontTele" --packageId "com.alexy.pontetele" --outputDir "pont-tele"
fi
cd "$DOSSIER"
vega project update-manifest --os-min 2.0 --os-version 2.0 || true

echo "▶ 2/5 Code de l'appli"
APP=$(find . -name 'App.tsx' -not -path './node_modules/*' | head -1)
[ -z "$APP" ] && APP="src/App.tsx" && mkdir -p src
curl -fsSL "$BASE/App.tsx" -o "$APP"
echo "   → $APP"

echo "▶ 3/5 Modules"
npm install
npm install "@amazon-devices/kepler-media-controls@~1.0.0" "@amazon-devices/kepler-media-types@~1.0.0"

echo "▶ 4/5 Compilation"
command -v watchman >/dev/null && { watchman watch-del-all >/dev/null 2>&1; watchman shutdown-server >/dev/null 2>&1; } || true
npm run build:app
VPKG=$(find build -name '*_armv7.vpkg' 2>/dev/null | head -1)
[ -z "$VPKG" ] && VPKG=$(find build -name '*armv7*.vpkg' 2>/dev/null | head -1)
if [ -z "$VPKG" ]; then echo "❌ Pas de fichier .vpkg dans build/. Envoie une capture de l'erreur plus haut."; exit 1; fi
echo "   → $VPKG"

echo "▶ 5/5 Installation sur la Fire TV"
COMP=$(awk '/\[\[components.interactive\]\]/{f=1} f && /^id *=/{gsub(/.*= *"|".*/,""); print; exit}' manifest.toml)
TELE="${TELE:-192.168.2.200:5555}"      # adresse de la Fire TV
export VEGA_SERIAL="$TELE"
vega exec vda connect "$TELE" || true
if ! vega device install-app -d "$TELE" --packagePath "$VPKG"; then
  echo "   (nouvel essai sans -d)"
  vega device install-app --packagePath "$VPKG"
fi
vega device launch-app -d "$TELE" --appName "$COMP" || vega device launch-app --appName "$COMP"
echo "✅ Pont Télé est installée et ouverte sur la télé ($COMP)."
