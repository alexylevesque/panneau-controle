#!/bin/bash
# Panneau : installe le petit programme du Mac (pile en direct + « Faire sonner »)
# Installer :    curl -s http://ADRESSE:8080/mac/installer.sh | bash
# Désinstaller : curl -s http://ADRESSE:8080/mac/installer.sh | bash -s retirer
# Tout est dans une fonction : bash lit le script en entier avant de commencer (sinon « curl | bash » peut s'arrêter en chemin)
installer() {
PANNEAU="__PANNEAU__"
DOSSIER="$HOME/.panneau"
PLIST="$HOME/Library/LaunchAgents/ca.panneau.mac.plist"

[ "$1" != "maj" ] && launchctl unload "$PLIST" 2>/dev/null
if [ "$1" = "retirer" ]; then
  rm -rf "$DOSSIER" "$PLIST"
  echo "✔ Panneau retiré du Mac."
  return 0
fi

mkdir -p "$DOSSIER" "$HOME/Library/LaunchAgents"
cat > "$DOSSIER/agent.sh" <<AGENT
#!/bin/bash
PANNEAU="$PANNEAU"
AGENT
cat >> "$DOSSIER/agent.sh" <<'AGENT'
NOM=$(scutil --get ComputerName 2>/dev/null || echo Mac)
VERSION=2
NCPU=$(sysctl -n hw.ncpu); MEM=$(sysctl -n hw.memsize); PS=$(pagesize)
BOOT=$(sysctl -n kern.boottime | awk -F'[ ,]+' '{print $4}')
SONNEUR=""
arreter_son() { [ -n "$SONNEUR" ] && kill "$SONNEUR" 2>/dev/null; SONNEUR=""; }
while true; do
  B=$(pmset -g batt)
  PCT=$(echo "$B" | grep -o '[0-9]*%' | head -1 | tr -d '%')
  CHG=false
  echo "$B" | grep -q "AC Power" && ! echo "$B" | grep -q "discharging" && CHG=true
  # Stats : processeur, mémoire, disque, allumé depuis
  CPU=$(ps -A -o %cpu= | awk -v n="$NCPU" '{s+=$1} END {printf "%d", s/n}')
  RAM=$(vm_stat | awk -v ps="$PS" -v m="$MEM" '/Pages active/{a=$3} /Pages wired down/{w=$4} /occupied by compressor/{c=$5} END {printf "%d", (a+w+c)*ps*100/m}')
  DF=$( (df -k /System/Volumes/Data 2>/dev/null || df -k /) | awk 'NR==2{printf "%d %d", $5, $4/1048576}')
  UP=$(( $(date +%s) - BOOT ))
  R=$(curl -s -m 4 -X POST -H 'Content-Type: application/json' \
      -d "{\"id\":\"mac\",\"v\":$VERSION,\"nom\":\"$NOM\",\"batterie\":\"$PCT\",\"enCharge\":$CHG,\"cpu\":${CPU:-0},\"ram\":${RAM:-0},\"disque\":${DF% *},\"libreGo\":${DF#* },\"allume\":$UP,\"memGo\":$((MEM/1073741824))}" \
      "$PANNEAU/api/appareils/action/mac")
  # Nouvelle version du programme sur le panneau : on se met à jour tout seul
  if echo "$R" | grep -q MAJ; then
    curl -s -m 10 "$PANNEAU/mac/installer.sh" -o /tmp/panneau.sh && bash /tmp/panneau.sh maj >/dev/null 2>&1
    exit 0
  fi
  if echo "$R" | grep -q SONNE; then
    if [ -z "$SONNEUR" ] || ! kill -0 "$SONNEUR" 2>/dev/null; then
      (
        VOL=$(osascript -e 'output volume of (get volume settings)')
        fin() { pkill -x afplay 2>/dev/null; pkill -f "Panneau : ton Mac" 2>/dev/null; osascript -e "set volume output volume $VOL"; exit 0; }
        trap fin TERM
        osascript -e 'set volume output volume 60' -e 'set volume without output muted'
        ( osascript -e 'display dialog "📍 Panneau : ton Mac est ici!" buttons {"Arrêter"} default button 1 giving up after 120' >/dev/null &&
            curl -s -m 4 -X POST "$PANNEAU/api/appareils/action/arreter" >/dev/null ) &
        for i in $(seq 1 60); do afplay /System/Library/Sounds/Glass.aiff & wait $!; afplay /System/Library/Sounds/Ping.aiff & wait $!; done
        fin
      ) &
      SONNEUR=$!
    fi
  elif [ -n "$SONNEUR" ]; then
    arreter_son
  fi
  sleep 3
done
AGENT
chmod +x "$DOSSIER/agent.sh"

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ca.panneau.mac</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DOSSIER/agent.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
PL
[ "$1" = "maj" ] && return 0   # mise à jour : le programme redémarre tout seul avec la nouvelle version
launchctl load "$PLIST"
echo "✔ Installé ! Ton Mac apparaît dans le panneau (Appareils) d'ici quelques secondes."
}
installer "$@" < /dev/null
