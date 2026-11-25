#!/bin/bash
# Panneau : installe le petit programme du Mac (pile en direct + « Faire sonner »)
# Installer :    curl -s http://ADRESSE:8080/mac/installer.sh | bash
# Désinstaller : curl -s http://ADRESSE:8080/mac/installer.sh | bash -s retirer
PANNEAU="__PANNEAU__"
DOSSIER="$HOME/.panneau"
PLIST="$HOME/Library/LaunchAgents/ca.panneau.mac.plist"

launchctl unload "$PLIST" 2>/dev/null
if [ "$1" = "retirer" ]; then
  rm -rf "$DOSSIER" "$PLIST"
  echo "✔ Panneau retiré du Mac."
  exit 0
fi

mkdir -p "$DOSSIER" "$HOME/Library/LaunchAgents"
cat > "$DOSSIER/agent.sh" <<AGENT
#!/bin/bash
PANNEAU="$PANNEAU"
AGENT
cat >> "$DOSSIER/agent.sh" <<'AGENT'
NOM=$(scutil --get ComputerName 2>/dev/null || echo Mac)
SONNEUR=""
arreter_son() { [ -n "$SONNEUR" ] && kill "$SONNEUR" 2>/dev/null; SONNEUR=""; }
while true; do
  B=$(pmset -g batt)
  PCT=$(echo "$B" | grep -o '[0-9]*%' | head -1 | tr -d '%')
  CHG=false
  echo "$B" | grep -q "AC Power" && ! echo "$B" | grep -q "discharging" && CHG=true
  R=$(curl -s -m 4 -X POST -H 'Content-Type: application/json' \
      -d "{\"id\":\"mac\",\"nom\":\"$NOM\",\"batterie\":\"$PCT\",\"enCharge\":$CHG}" \
      "$PANNEAU/api/appareils/action/mac")
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
launchctl load "$PLIST"
echo "✔ Installé ! Ton Mac apparaît dans le panneau (Appareils) d'ici quelques secondes."
