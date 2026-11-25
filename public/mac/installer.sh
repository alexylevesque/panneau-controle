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
VERSION=10
NCPU=$(sysctl -n hw.ncpu); MEM=$(sysctl -n hw.memsize); PS=$(pagesize)
BOOT=$(sysctl -n kern.boottime | awk -F'[ ,]+' '{print $4}')
SMC="$HOME/.panneau/smc"; CLES=""
[ -x "$SMC" ] && CLES=$("$SMC" cles 2>/dev/null)
# Même PATH que ton Terminal (Homebrew, ~/.local/bin, etc.), sinon plein de commandes sont « not found »
P=$(/bin/zsh -lic 'printf %s "$PATH"' 2>/dev/null </dev/null | tail -1); [ -n "$P" ] && export PATH="$P"
# ---- Terminal : le panneau envoie des commandes, protégées par ton code (~/.panneau/code) ----
CODE_F="$HOME/.panneau/code"; ESSAIS_F="$HOME/.panneau/essais"; CWD_F="$HOME/.panneau/cwd"
enb64() { base64 | tr -d '\n'; }
repondre() {   # id statut sortie dossier (par l'entrée standard : les images peuvent être grosses)
  { printf '{"id":%s,"statut":"%s","sortie":"' "$1" "$2"; printf '%s' "$3" | enb64
    printf '","cwd":"'; printf '%s' "$4" | enb64; printf '"}'; } |
  curl -s -m 20 -X POST -H 'Content-Type: application/json' --data-binary @- "$PANNEAU/api/appareils/action/macResultat" >/dev/null
}
# ---- Fichiers : opérations spéciales envoyées par la page Fichiers (ne touchent pas au dossier du Terminal) ----
chemin() {   # « ~ » et « ~/… » = ton dossier maison
  case "$1" in ''|'~') printf '%s' "$HOME" ;; '~/'*) printf '%s/%s' "$HOME" "${1#\~/}" ;; *) printf '%s' "$1" ;; esac
}
fichiers() {   # op chemin -> sortie
  local op="$1" p mime taille
  p=$(chemin "$2")
  case "$op" in
    liste)
      cd "$p" 2>/dev/null || { echo "ERREUR Dossier introuvable ou protégé : $p"; return; }
      pwd -P
      # type<TAB>taille<TAB>date<TAB>nom (les fichiers cachés sont omis)
      for f in * ; do [ -e "$f" ] || [ -L "$f" ] || continue; stat -f '%HT%t%z%t%m%t%N' -- "$f" 2>/dev/null; done ;;
    lire)
      [ -f "$p" ] || { echo "ERREUR Fichier introuvable : $p"; return; }
      mime=$(file -b --mime-type -- "$p" 2>/dev/null); taille=$(stat -f %z -- "$p" 2>/dev/null)
      case "$mime" in
        image/*) if [ "${taille:-0}" -le 1500000 ]; then echo "IMAGE $mime"; base64 < "$p" | tr -d '\n'; else echo "GROS $mime $taille"; fi ;;
        text/*|application/json|application/xml|application/javascript|inode/x-empty) echo "TEXTE $mime $taille"; head -c 40000 -- "$p" ;;
        *) echo "BINAIRE $mime $taille" ;;
      esac ;;
    lien)   # lien secret (6 h) vers le serveur de fichiers du Mac
      [ -f "$p" ] || { echo "ERREUR Fichier introuvable : $p"; return; }
      mkdir -p "$HOME/.panneau/liens"
      find "$HOME/.panneau/liens" -type f -mmin +360 -delete 2>/dev/null
      local j ip
      j=$(openssl rand -hex 16); printf '%s' "$p" > "$HOME/.panneau/liens/$j"
      ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
      echo "LIEN http://$ip:8091/f/$j $(file -b --mime-type -- "$p" 2>/dev/null) $(stat -f %z -- "$p" 2>/dev/null)" ;;
    ouvrir)
      [ -e "$p" ] || { echo "ERREUR Introuvable : $p"; return; }
      open -- "$p" 2>&1 && echo "OUVERT" ;;
  esac
}
executer() {   # id code commande
  local id="$1" code="$2" cmd="$3" cwd out nouveau essais n depuis now
  cwd=$(cat "$CWD_F" 2>/dev/null); [ -d "$cwd" ] || cwd="$HOME"
  if [ ! -s "$CODE_F" ]; then repondre "$id" pascode "" "$cwd"; return; fi
  essais=$(cat "$ESSAIS_F" 2>/dev/null); [ -z "$essais" ] && essais="0 0"
  n=${essais% *}; depuis=${essais#* }; now=$(date +%s)
  # 5 mauvais codes = bloqué 10 minutes
  if [ "$n" -ge 5 ] && [ $((now - depuis)) -lt 600 ]; then repondre "$id" bloque "" "$cwd"; return; fi
  if [ "$code" != "$(cat "$CODE_F")" ]; then
    [ $((now - depuis)) -ge 600 ] && n=0
    echo "$((n + 1)) $now" > "$ESSAIS_F"; repondre "$id" refus "" "$cwd"; return
  fi
  echo "0 0" > "$ESSAIS_F"
  case "$cmd" in
    "@fichiers "*)   # page Fichiers : « @fichiers op chemin »
      local reste="${cmd#@fichiers }"
      out=$(perl -e '$p = fork; if (!$p) { setpgrp(0, 0); exec @ARGV; exit 127 } $SIG{ALRM} = sub { kill 9, -$p; print "ERREUR Trop long (le Mac demande peut-être une permission)\n"; exit 124 }; alarm 20; waitpid($p, 0); exit($? >> 8)' \
            /bin/bash -c "$(declare -f chemin fichiers); fichiers \"\$1\" \"\$2\"" _ "${reste%% *}" "${reste#* }" 2>&1 < /dev/null)
      repondre "$id" ok "$out" "$cwd"; return ;;
  esac
  # Le Terminal a été retiré du panneau : on refuse toute commande qui n'est pas pour la page Fichiers
  repondre "$id" ok "Le Terminal est désactivé." "$cwd"; return
  # 30 s max par commande ; on retient le dossier (pour que « cd » marche)
  # (au bout de 30 s on arrête la commande ET tout ce qu'elle a lancé, sinon ça reste pris)
  out=$(cd "$cwd" && perl -e '$p = fork; if (!$p) { setpgrp(0, 0); exec @ARGV; exit 127 }
      $SIG{ALRM} = sub { kill 9, -$p; print "\n⏱ Arrêté après 30 s. Si c\x27est dans Bureau, Documents ou Téléchargements, regarde si le Mac demande une permission.\n"; exit 124 };
      alarm 30; waitpid($p, 0); exit($? >> 8)' /bin/bash -c "$cmd"$'\n''printf "\n__PWD__%s" "$PWD"' 2>&1 < /dev/null | head -c 60000)
  nouveau=$(printf '%s\n' "$out" | sed -n 's/^__PWD__//p' | tail -1)
  out=$(printf '%s\n' "$out" | sed '/^__PWD__/d')
  if [ -n "$nouveau" ] && [ -d "$nouveau" ]; then cwd="$nouveau"; echo "$cwd" > "$CWD_F"; fi
  repondre "$id" ok "$out" "$cwd"
}
ecoute() {
  while true; do
    R=$(curl -s -m 35 -X POST -H 'Content-Type: application/json' -d '{}' "$PANNEAU/api/appareils/action/macAttente")
    if [ -z "$R" ]; then sleep 3; continue; fi
    L=$(printf '%s' "$R" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p')
    for e in $L; do
      id=${e%%:*}; r=${e#*:}
      c=$(printf '%s' "${r%%:*}" | base64 -D); m=$(printf '%s' "${r#*:}" | base64 -D)
      executer "$id" "$c" "$m" &
    done
  done
}
ecoute &
ECOUTE=$!
# Serveur de fichiers
pkill -f "panneau/serveur.py" 2>/dev/null
python3 "$HOME/.panneau/serveur.py" >/dev/null 2>&1 &
SERVEUR=$!
trap 'kill $ECOUTE $SERVEUR 2>/dev/null' EXIT

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
  R=$(curl -s -m 4 -X POST -H 'Content-Type: application/json' \
      -d "{\"id\":\"mac\",\"v\":$VERSION,\"nom\":\"$NOM\",\"batterie\":\"$PCT\",\"enCharge\":$CHG,\"cpu\":${CPU:-0},\"ram\":${RAM:-0},\"disque\":${DF% *},\"libreGo\":${DF#* },\"allume\":$UP,\"memGo\":$((MEM/1073741824))$CAPT}" \
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

# Serveur de fichiers (vidéos, PDF, images… pour la page Fichiers), port 8091
cat > "$DOSSIER/serveur.py" <<'PYSRC'
# Panneau : sert les fichiers du Mac à la tablette (vidéo, audio, PDF, images…), avec reprise (Range).
# Un fichier n'est servi que par un lien secret créé par la page Fichiers (après ton code), valide 6 h.
import os, time, mimetypes, subprocess, tempfile, urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

LIENS = os.path.expanduser('~/.panneau/liens')
mimetypes.add_type('video/mp4', '.mov')      # les .mov de l'iPhone (H.264) jouent comme des mp4
mimetypes.add_type('video/mp4', '.m4v')
mimetypes.add_type('audio/mp4', '.m4a')

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_HEAD(self): self.servir(True)
    def do_GET(self): self.servir(False)
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Range')
        self.end_headers()

    def servir(self, tete):
        u = urllib.parse.urlparse(self.path)
        parts = u.path.split('/')
        if len(parts) < 3 or parts[1] != 'f' or not parts[2].isalnum():
            return self.send_error(404)
        jeton = parts[2]
        f = os.path.join(LIENS, jeton)
        try:
            if time.time() - os.path.getmtime(f) > 6 * 3600:
                return self.send_error(410)
            with open(f, encoding='utf-8') as x:
                original = x.read().strip()
        except OSError:
            return self.send_error(404)
        q = urllib.parse.parse_qs(u.query)
        chemin = original
        tmpd = tempfile.gettempdir()
        if 'jpg' in q:   # HEIC, TIFF… : converti en JPEG par macOS (sips)
            tmp = os.path.join(tmpd, 'panneau-' + jeton + '.jpg')
            if not os.path.exists(tmp):
                subprocess.run(['sips', '-s', 'format', 'jpeg', '-Z', '2400', original, '--out', tmp],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            chemin = tmp
        elif 'html' in q:   # Word, RTF, Pages… : converti en page web par macOS (textutil)
            tmp = os.path.join(tmpd, 'panneau-' + jeton + '.html')
            if not os.path.exists(tmp):
                subprocess.run(['textutil', '-convert', 'html', original, '-output', tmp],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            chemin = tmp
        elif 'ql' in q:   # tout le reste (Excel, PowerPoint, Keynote…) : aperçu Quick Look en image
            dossier = os.path.join(tmpd, 'panneau-ql-' + jeton)
            tmp = os.path.join(dossier, os.path.basename(original) + '.png')
            if not os.path.exists(tmp):
                os.makedirs(dossier, exist_ok=True)
                subprocess.run(['qlmanage', '-t', '-s', '1600', '-o', dossier, original],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
            chemin = tmp
        try:
            taille = os.path.getsize(chemin)
            fh = open(chemin, 'rb')
        except OSError:
            return self.send_error(404)
        with fh:
            mime = mimetypes.guess_type(chemin)[0] or 'application/octet-stream'
            if mime.startswith('text/') or mime in ('application/json', 'application/javascript'):
                mime += '; charset=utf-8'
            debut, fin, code = 0, max(taille - 1, 0), 200
            r = self.headers.get('Range')
            if r and r.startswith('bytes=') and taille:
                a, _, b = r[6:].split(',')[0].strip().partition('-')
                try:
                    if a:
                        debut = int(a); fin = int(b) if b else taille - 1
                    else:
                        debut = max(0, taille - int(b))
                    fin = min(fin, taille - 1); code = 206
                except ValueError:
                    pass
                if debut > fin:
                    self.send_response(416)
                    self.send_header('Content-Range', 'bytes */%d' % taille)
                    self.end_headers()
                    return
            longueur = fin - debut + 1 if taille else 0
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(longueur))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')
            if code == 206:
                self.send_header('Content-Range', 'bytes %d-%d/%d' % (debut, fin, taille))
            self.end_headers()
            if tete:
                return
            fh.seek(debut)
            reste = longueur
            try:
                while reste > 0:
                    bloc = fh.read(min(262144, reste))
                    if not bloc:
                        break
                    self.wfile.write(bloc)
                    reste -= len(bloc)
            except (BrokenPipeError, ConnectionResetError):
                pass

ThreadingHTTPServer.daemon_threads = True
ThreadingHTTPServer(('0.0.0.0', 8091), H).serve_forever()
PYSRC

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
</dict></plist>
PL
[ "$1" = "maj" ] && return 0   # mise à jour : le programme redémarre tout seul avec la nouvelle version
launchctl load "$PLIST"
echo "✔ Installé ! Ton Mac apparaît dans le panneau (Appareils) d'ici quelques secondes."
}
installer "$@" < /dev/null
