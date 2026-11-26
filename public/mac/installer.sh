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

# Chaque Mac a son nom dans le panneau. Ton premier Mac (déjà installé) reste « mac ».
if [ ! -s "$DOSSIER/id" ]; then
  mkdir -p "$DOSSIER"
  if [ -f "$DOSSIER/agent.sh" ]; then echo mac > "$DOSSIER/id"
  else
    MODELE=$(system_profiler SPHardwareDataType 2>/dev/null | awk -F': ' '/Model Name/{print $2; exit}')
    case "$MODELE" in *"Mac mini"*) T=macmini; BASE=macmini ;; *) T=mac; BASE=mac ;; esac
    echo "$T" > "$DOSSIER/type"
    # « mac » est déjà pris par ton premier Mac : on ajoute un bout de son nom
    SUFFIXE=$(scutil --get LocalHostName 2>/dev/null | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-' | cut -c1-20)
    if [ "$BASE" = "macmini" ]; then echo macmini > "$DOSSIER/id"; else echo "mac-${SUFFIXE:-2}" > "$DOSSIER/id"; fi
  fi
fi
mkdir -p "$DOSSIER" "$HOME/Library/LaunchAgents"
cat > "$DOSSIER/agent.sh" <<AGENT
#!/bin/bash
PANNEAU="$PANNEAU"
AGENT
cat >> "$DOSSIER/agent.sh" <<'AGENT'
NOM=$(scutil --get ComputerName 2>/dev/null || echo Mac)
ID=$(cat "$HOME/.panneau/id" 2>/dev/null); [ -z "$ID" ] && ID=mac
TYPE=$(cat "$HOME/.panneau/type" 2>/dev/null); [ -z "$TYPE" ] && TYPE=mac
VERSION=14
NCPU=$(sysctl -n hw.ncpu); MEM=$(sysctl -n hw.memsize); PS=$(pagesize)
BOOT=$(sysctl -n kern.boottime | awk -F'[ ,]+' '{print $4}')
SMC="$HOME/.panneau/smc"; CLES=""
[ -x "$SMC" ] && CLES=$("$SMC" cles 2>/dev/null)
# (Terminal et Fichiers retirés : on arrête l'ancien serveur de fichiers et on efface ses liens)
pkill -f "panneau/serveur.py" 2>/dev/null
rm -rf "$HOME/.panneau/liens" "$HOME/.panneau/serveur.py" "$HOME/.panneau/cwd" "$HOME/.panneau/essais"

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
  CAPT=""; [ -x "$SMC" ] && CAPT=$("$SMC" $CLES 2>/dev/null)
  # Si l'arrêt demandé par le panneau a échoué, on le dit au panneau (une fois)
  ERRA=$(head -c 150 "$HOME/.panneau/erreur" 2>/dev/null | tr -d '"\\\n\r'); rm -f "$HOME/.panneau/erreur"
  R=$(curl -s -m 4 -X POST -H 'Content-Type: application/json' \
      -d "{\"id\":\"$ID\",\"type\":\"$TYPE\",\"v\":$VERSION,\"nom\":\"$NOM\",\"batterie\":\"$PCT\",\"enCharge\":$CHG,\"cpu\":${CPU:-0},\"ram\":${RAM:-0},\"disque\":${DF% *},\"libreGo\":${DF#* },\"allume\":$UP,\"memGo\":$((MEM/1073741824)),\"erreurArret\":\"$ERRA\"$CAPT}" \
      "$PANNEAU/api/appareils/action/mac")
  # Nouvelle version du programme sur le panneau : on se met à jour tout seul
  if echo "$R" | grep -q MAJ; then
    curl -s -m 10 "$PANNEAU/mac/installer.sh" -o /tmp/panneau.sh && bash /tmp/panneau.sh maj >/dev/null 2>&1
    # On repart tout de suite avec la nouvelle version (sans attendre que macOS relance le programme)
    exec /bin/bash "$HOME/.panneau/agent.sh"
  fi
  # Interrupteur du panneau : on éteint le Mac pour vrai (comme  > Éteindre, sans la question « Voulez-vous… »)
  if echo "$R" | grep -q ETEINS; then
    arreter_son
    if ! E=$(osascript -e 'tell application "loginwindow" to «event aevtrsdn»' 2>&1); then
      E=$(osascript -e 'tell application "System Events" to shut down' 2>&1) || echo "$E" > "$HOME/.panneau/erreur"
    fi
    sleep 20; continue
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

# Ventilateurs + température : petit outil compilé sur place (il faut les outils de développement d'Apple)
cat > "$DOSSIER/smc.c" <<'SMCSRC'
// Panneau : lit les ventilateurs et la température du Mac (puce SMC), sans mot de passe
// smc cles        -> liste des capteurs de température du processeur
// smc [cles...]   -> ,"ventilos":N,"ventilo":tr/min,"ventiloMax":tr/min,"temp":°C
#include <IOKit/IOKitLib.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct { char major, minor, build, reserved[1]; uint16_t release; } Vers;
typedef struct { uint16_t version, length; uint32_t cpuPLimit, gpuPLimit, memPLimit; } PLimit;
typedef struct { uint32_t dataSize; uint32_t dataType; char dataAttributes; } KeyInfo;
typedef struct {
  uint32_t key; Vers vers; PLimit pLimit; KeyInfo keyInfo;
  char result, status, data8; uint32_t data32; unsigned char bytes[32];
} Param;

static io_connect_t con;

static uint32_t cc(const char *s) { return ((uint32_t)s[0] << 24) | ((uint32_t)s[1] << 16) | ((uint32_t)s[2] << 8) | (uint32_t)s[3]; }

static int appel(Param *in, Param *out) {
  size_t n = sizeof(Param);
  return IOConnectCallStructMethod(con, 2, in, sizeof(Param), out, &n) == kIOReturnSuccess && out->result == 0;
}

// Lit une clé ; renvoie 1 et met la valeur dans *v si c'est un nombre connu
static int lire(uint32_t cle, double *v) {
  Param in, out;
  memset(&in, 0, sizeof in); memset(&out, 0, sizeof out);
  in.key = cle; in.data8 = 9;
  if (!appel(&in, &out)) return 0;
  uint32_t taille = out.keyInfo.dataSize, type = out.keyInfo.dataType;
  memset(&in, 0, sizeof in); in.key = cle; in.keyInfo.dataSize = taille; in.data8 = 5;
  memset(&out, 0, sizeof out);
  if (!appel(&in, &out)) return 0;
  unsigned char *b = out.bytes;
  if (type == cc("flt ") && taille == 4) { float f; memcpy(&f, b, 4); *v = f; return 1; }
  if (type == cc("fpe2") && taille == 2) { *v = ((b[0] << 8) | b[1]) / 4.0; return 1; }
  if (type == cc("sp78") && taille == 2) { *v = (int16_t)((b[0] << 8) | b[1]) / 256.0; return 1; }
  if (type == cc("ui8 ") && taille == 1) { *v = b[0]; return 1; }
  if (type == cc("ui16") && taille == 2) { *v = (b[0] << 8) | b[1]; return 1; }
  if (type == cc("ui32") && taille == 4) { *v = ((uint32_t)b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]; return 1; }
  return 0;
}

int main(int argc, char **argv) {
  io_service_t s = IOServiceGetMatchingService(0, IOServiceMatching("AppleSMC"));
  if (!s || IOServiceOpen(s, mach_task_self(), 0, &con) != kIOReturnSuccess) return 1;

  if (argc > 1 && !strcmp(argv[1], "cles")) {
    // Toutes les clés « Tp… » (puces Apple) et « TC… » (Intel) qui donnent une température plausible
    double n;
    if (!lire(cc("#KEY"), &n)) return 1;
    for (uint32_t i = 0; i < (uint32_t)n; i++) {
      Param in, out; memset(&in, 0, sizeof in); memset(&out, 0, sizeof out);
      in.data8 = 8; in.data32 = i;
      if (!appel(&in, &out)) continue;
      char k[5] = { (char)(out.key >> 24), (char)(out.key >> 16), (char)(out.key >> 8), (char)out.key, 0 };
      if (!(k[0] == 'T' && (k[1] == 'p' || k[1] == 'C'))) continue;
      double t;
      if (lire(out.key, &t) && t > 15 && t < 115) printf("%s ", k);
    }
    printf("\n");
    return 0;
  }

  double nb = 0, v, total = 0, max = 0;
  lire(cc("FNum"), &nb);
  int fans = (int)nb;
  for (int i = 0; i < fans && i < 4; i++) {
    char k[5];
    snprintf(k, 5, "F%dAc", i); if (lire(cc(k), &v)) total += v;
    snprintf(k, 5, "F%dMx", i); if (lire(cc(k), &v) && v > max) max = v;
  }
  printf(",\"ventilos\":%d", fans);
  if (fans > 0) printf(",\"ventilo\":%d,\"ventiloMax\":%d", (int)(total / fans), (int)max);

  double somme = 0; int compte = 0;
  for (int i = 1; i < argc; i++) {
    if (strlen(argv[i]) != 4) continue;
    if (lire(cc(argv[i]), &v) && v > 15 && v < 115) { if (v > somme) somme = v; compte++; }
  }
  // Le cœur le plus chaud (comme les apps de stats) : la moyenne cachait les pointes
  if (compte) printf(",\"temp\":%d", (int)(somme + 0.5));
  printf("\n");
  return 0;
}
SMCSRC
if xcode-select -p >/dev/null 2>&1; then
  cc -O2 -o "$DOSSIER/smc" "$DOSSIER/smc.c" -framework IOKit -framework CoreFoundation 2>/dev/null || rm -f "$DOSSIER/smc"
fi

cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ca.panneau.mac</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DOSSIER/agent.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StartInterval</key><integer>60</integer>
</dict></plist>
PL
[ "$1" = "maj" ] && return 0   # mise à jour : le programme redémarre tout seul avec la nouvelle version
launchctl load "$PLIST"
echo "✔ Installé ! Ton Mac apparaît dans le panneau (Appareils) d'ici quelques secondes."
}
installer "$@" < /dev/null
