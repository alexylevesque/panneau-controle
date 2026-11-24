# Panneau de contrôle — guide complet de A à Z

Ce guide transforme ta vieille tablette Samsung en panneau de contrôle mural : télécommande Fire TV,
réveil du Mac mini, et plein d'autres boutons qu'on ajoutera avec le temps.

Le panneau roule **directement sur la tablette**. Le Mac n'a pas besoin d'être allumé.

> Les menus Samsung changent un peu selon la version d'Android (One UI). Si un nom n'est pas exactement
> pareil chez toi, utilise la **loupe 🔍 en haut des Paramètres** et tape le mot en gras : ça le trouve direct.

**Temps total : environ 45 minutes** (plus le temps des mises à jour).

> **Ta tablette : Galaxy Tab A 10.1 (SM-T580), Android 6.0.1.** La mise à jour vers Android 8 n'est plus offerte
> par Samsung, alors on utilise la version de **Termux pour Android 5 et 6** (étape B1) avec **Node.js 13**. Ça marche.
> L'option « Protéger la batterie » n'existe pas sur cette version : suis l'encadré de l'étape A5.

---

## Partie A — Préparer la tablette

### A1. Charger et mettre à jour

1. Branche la tablette sur un **chargeur mural** (pas un port USB d'ordi) et attends **au moins 30 minutes** avant de commencer.
   Une batterie à 0 % rend la tablette super lente au début, c'est normal.
2. Paramètres > **Mise à jour logicielle** > Télécharger et installer. Fais toutes les mises à jour proposées.
   **Recommence** jusqu'à ce qu'il n'y en ait plus : il en faut souvent plusieurs d'affilée pour arriver à Android 8.1.
   Vérifie à la fin dans Paramètres > À propos de la tablette > Informations sur le logiciel : **Version d'Android 8.1.0**.
   Si la tablette ne trouve aucune mise à jour : installe **Smart Switch** sur le Mac (smartswitch.samsung.com ou
   le site de Samsung), branche la tablette par USB et clique **Mettre à jour**.
3. Play Store > ton icône en haut à droite > Gérer les applis > **Tout mettre à jour**.
4. Redémarre la tablette une fois que tout est fini.

### A2. Faire le ménage (le plus gros gain de vitesse)

Moins il y a d'applis, plus la tablette est rapide.

1. Paramètres > **Applis**.
2. Pour chaque appli que tu n'utilises pas : appuie dessus > **Désinstaller**, ou **Désactiver** si le bouton Désinstaller n'existe pas.
3. À enlever sans crainte (si présentes) : Facebook, Netflix, jeux, **Bixby**, **Game Launcher**, **Samsung Free**,
   **Samsung Kids**, **Samsung Notes**, **Samsung Health**, Microsoft Office/OneDrive, Spotify, YouTube Music, AR Zone,
   Galaxy Store (si tu ne t'en sers pas).
4. **À garder** : Chrome, Play Store, Paramètres, Mes fichiers, Clavier Samsung.
5. Écran d'accueil : enlève tous les widgets (garde les doigts appuyés sur un widget > Supprimer). Les widgets mangent de la mémoire.

### A3. Débloquer les options de développement

1. Paramètres > **À propos de la tablette** > **Informations sur le logiciel**.
2. Tape **7 fois** sur **Numéro de version**. Entre ton code si demandé.
   Le message « Le mode développeur a été activé » apparaît.
3. Un nouveau menu **Options de développement** est maintenant tout en bas des Paramètres.

### A4. Réglages de vitesse (Options de développement)

Paramètres > **Options de développement** :

| Réglage | Mets | Pourquoi |
|---|---|---|
| **Échelle d'animation des fenêtres** | Animation désactivée | Tout s'ouvre instantanément |
| **Échelle d'animation des transitions** | Animation désactivée | Pareil |
| **Échelle de durée d'animation** | Animation désactivée | Pareil |
| **Rester activé** (Stay awake) | ✅ Activé | L'écran ne s'éteint jamais pendant la charge |
| **Limite des processus en arrière-plan** | **Limite standard** (ne touche pas!) | Sinon Android tue le panneau |

### A5. Batterie (très important pour une tablette toujours branchée)

Une tablette branchée 24 h/24 à 100 % finit par avoir une **batterie qui gonfle**. Ces réglages l'évitent.

1. Paramètres > **Batterie** (ou Entretien de l'appareil > Batterie) > **Plus de paramètres de batterie** :
   - **Protéger la batterie** (ou **Protection de la batterie**) : ✅ activé. Si on te donne le choix, prends **Maximum 80 %** ou **85 %**.
   - **Charge rapide** : ❌ désactivée. Moins de chaleur = batterie qui dure plus longtemps.
   - **Batterie adaptative** : ❌ désactivée.
2. Paramètres > Batterie > **Mode économie d'énergie** : ❌ désactivé. Il ralentit tout et coupe les applis en arrière-plan.
3. Paramètres > Batterie > **Limites d'utilisation en arrière-plan** :
   - **Mettre en veille les applis inutilisées** : ❌ désactivé.
   - **Applis jamais en veille** > **+** > ajoute **Termux**, **Termux:Boot** et **Fully Kiosk Browser**
     (tu le feras après les avoir installées à la partie B, reviens ici).

> Ta tablette n'a pas « Protéger la batterie »? (vieux modèle) Alors branche-la sur une **prise intelligente**
> qui coupe le courant quelques heures par jour, ou débranche-la une fois par semaine jusqu'à 30 %.
> Et vérifie de temps en temps que l'arrière n'est pas bombé.

### A6. Écran

Paramètres > **Affichage** :

- **Mode sombre** : ✅ activé (le panneau est sombre, ça repose les yeux).
- **Luminosité** : vers **40 %**. **Luminosité adaptative** : ❌ (sinon elle change toute seule).
- **Délai de mise en veille de l'écran** : le plus long possible (Fully Kiosk s'en occupera de toute façon).
- **Résolution de l'écran** (si l'option existe) : prends la plus **basse**. Gros gain de vitesse.
- **Panneaux Edge** : ❌ désactivé.
- Paramètres > Écran de verrouillage > **Always On Display** : ❌ désactivé.
- Paramètres > Écran de verrouillage > **Type de verrouillage** : **Aucun**. Comme ça le panneau apparaît directement.

### A7. Réseau et le reste

- Paramètres > Connexions > **Wi-Fi** > ⋮ > **Avancé** :
  - **Garder le Wi-Fi activé en veille** : **Toujours**.
  - **Basculer vers données mobiles** : ❌.
- Paramètres > Connexions : **Bluetooth** ❌, **NFC** ❌.
- Paramètres > **Localisation** : ❌ désactivée.
- Paramètres > **Comptes et sauvegarde** > Gérer les comptes > ton compte Google > Synchroniser :
  décoche tout sauf ce dont tu as besoin.
- Paramètres > **Notifications** : désactive les notifications des applis (sinon elles s'affichent par-dessus le panneau).
- Paramètres > **Sons et vibrations** : mode **Silencieux**.
- Play Store > icône > Paramètres > Préférences réseau > **Mise à jour automatique des applis** : **Ne pas mettre à jour automatiquement**.
  (Sinon la tablette rame pendant les mises à jour. Fais-les à la main une fois par mois.)

### A8. Redémarrage automatique (une tablette lente adore ça)

Paramètres > **Entretien de l'appareil** > ⋮ > **Automatisation** (ou Redémarrage auto) :
- **Redémarrage automatique** : ✅ activé, **3 h du matin**, tous les jours ou une fois par semaine.
- Le panneau redémarre tout seul après (grâce à Termux:Boot, partie B).

---

## Partie B — Installer le panneau

### B1. Installer Termux et Termux:Boot

Termux est une petite app qui fait rouler le serveur du panneau.

**Android 6 (ta tablette)** : la version F-Droid ne marche pas, il faut celle de GitHub.
1. Dans Chrome, va sur **https://github.com/termux/termux-app/releases**
2. Trouve la version **v0.119.0-beta.3**, section **« Android 5 and 6 only »**.
3. Télécharge le fichier qui finit par **`apt-android-5-github-debug_universal.apk`** et ouvre-le.
   Si « Installation bloquée » apparaît : **Paramètres** > active **Sources inconnues** > OK, puis réessaie.
4. Termux:Boot (démarrage automatique) : prends aussi la version GitHub sur
   **https://github.com/termux/termux-boot/releases** si elle s'installe sur ta tablette. Sinon, saute B4 :
   il faudra juste rouvrir Termux et taper `./demarrer.sh` après un redémarrage.
5. Ouvre **Termux:Boot une fois** (juste l'ouvrir et le fermer). Ça l'active.
6. Retourne à l'étape **A5.3** et ajoute Termux (et Termux:Boot) aux **Applis jamais en veille**.

**Android 7 ou plus** : prends plutôt Termux et Termux:Boot sur F-Droid
(https://f-droid.org/packages/com.termux/ et https://f-droid.org/packages/com.termux.boot/), pas sur le Play Store.

### B2. Préparer Termux

Ouvre **Termux** et tape ces commandes une à la fois (Entrée après chacune). Si on te pose une question, tape `y` puis Entrée.

```
pkg update
pkg install nodejs git nano
termux-setup-storage
```

`termux-setup-storage` demande l'accès aux fichiers : **Autoriser**.

### B3. Mettre le panneau sur la tablette

Le code est sur GitHub. Dans Termux :
```
cd ~
git clone https://github.com/alexylevesque/panneau-controle
cd panneau-controle
cp config.example.json config.json
chmod +x demarrer.sh
```

**Pour mettre à jour plus tard** (quand on ajoute des fonctions) : appuie sur **🔄 Mettre à jour** dans la carte
**Système** du panneau. Il télécharge la nouvelle version, redémarre tout seul et la page se recharge.
Ton `config.json` et le jumelage Fire TV sont gardés. (Le panneau se met aussi à jour à chaque démarrage.)

### B4. Démarrage automatique

Toujours dans Termux :
```
mkdir -p ~/.termux/boot
ln -sf ~/panneau-controle/demarrer.sh ~/.termux/boot/panneau
```
Maintenant, chaque fois que la tablette démarre, le panneau part tout seul.

### B5. Premier lancement

```
./demarrer.sh
```
Tu dois voir `Panneau prêt !`. Laisse Termux ouvert (tu peux revenir à l'accueil, il continue en arrière-plan).
Une notification « Termux - 1 session, wake lock held » reste affichée : c'est normal et c'est voulu.

Ouvre Chrome et va sur **http://localhost:8080** : le panneau s'affiche. 🎉

---

## Partie C — Mode panneau mural (plein écran)

### C1. Fully Kiosk Browser

1. Play Store > installe **Fully Kiosk Browser**.
2. Ouvre-le. Au premier lancement, entre **http://localhost:8080** comme Start URL.
3. Ajoute Fully Kiosk aux **Applis jamais en veille** (étape A5.3).
4. Pour ouvrir ses réglages plus tard : glisse depuis le **bord gauche** de l'écran > Settings.

### C2. Réglages Fully Kiosk recommandés

Dans Settings :

| Menu | Réglage | Mets |
|---|---|---|
| Web Content Settings | Start URL | `http://localhost:8080` |
| Web Auto Reload | Auto Reload on Network Reconnect | ✅ |
| Web Auto Reload | Auto Reload after Page Error | ✅ (10 secondes) |
| Device Management | Keep Screen On | ✅ |
| Device Management | Launch on Boot | ✅ |
| Device Management | Screen Brightness | 40 (ou vide pour garder celle d'Android) |
| Web Zoom and Scaling | Enable Zoom | ❌ |
| Advanced Web Settings | Enable Hardware Acceleration | ✅ |
| Fullscreen Mode (Toolbars) | Fullscreen Mode / Hide Navigation Bar | ✅ |

Version **Plus** (environ 10 $, une seule fois, optionnelle) :
- **Kiosk Mode** : bloque la tablette sur le panneau (personne ne peut sortir sans code).
- **Motion Detection** : l'écran s'allume quand tu passes devant (utilise la caméra).
- **Scheduled Sleep** : éteint l'écran la nuit (ex. 23 h à 7 h) pour sauver l'écran.

Sans Fully Kiosk : dans Chrome, menu ⋮ > **Ajouter à l'écran d'accueil**. Ça l'ouvre en plein écran aussi.

---

## Partie D — Connecter la Fire TV

Pas besoin du mode développeur : le panneau parle à la Fire TV comme l'app officielle « Amazon Fire TV » sur téléphone.

1. Sur la Fire TV : Paramètres > Ma Fire TV > À propos > **Réseau**. Note l'**adresse IP** (ex. `192.168.1.60`).
2. Dans Termux :
   ```
   nano ~/panneau-controle/config.json
   ```
   Change `"ip": "192.168.1.60"` sous `firetv` par la vraie IP. Sauvegarde : **Ctrl+O**, Entrée, puis **Ctrl+X**.
   (La touche Ctrl est dans la barre au-dessus du clavier de Termux.)
3. Redémarre le panneau : dans Termux, **Ctrl+C** puis `./demarrer.sh`.
4. Allume la Fire TV. Sur le panneau, appuie sur **Jumeler** : un code à 4 chiffres apparaît sur la télé.
   Entre-le sur la tablette. C'est fait pour de bon.
5. Conseil : dans ton routeur, **réserve l'adresse IP** de la Fire TV (DHCP / IP fixe) pour qu'elle ne change jamais.

Limites : le volume n'existe pas dans cette API (on le fera par la télé elle-même), et **Réveiller** marche seulement
si la Fire TV est en veille légère. Les apps (Netflix, YouTube…) se règlent dans `plugins.firetv.apps`.

Vieille Fire TV avec mode développeur? Mets `"mode": "adb"` et installe `pkg install android-tools`.

---

## Partie E — Réveiller le Mac mini

La carte **Réveil à distance** envoie un Wake-on-LAN au Mac. Ça marche s'il est **en veille** (pas complètement éteint).

1. Sur le Mac : Réglages Système > **Énergie** (ou Économiseur d'énergie) > **Réactiver pour l'accès au réseau** : ✅.
2. Sur le Mac, dans le Terminal : `networksetup -getmacaddress en0` (câble) ou `en1` (wifi). Note l'adresse genre `a1:b2:c3:d4:e5:f6`.
3. Dans `config.json` (avec `nano`), sous `wol` > `devices`, remplace `AA:BB:CC:DD:EE:FF` par cette adresse.
4. Le Mac branché par **câble Ethernet** se réveille beaucoup plus fiablement qu'en wifi.

---

## Partie F — Si ça marche pas

| Problème | Solution |
|---|---|
| La page dit « Serveur injoignable » | Ouvre Termux. Si rien ne roule : `cd ~/panneau-controle && ./demarrer.sh` |
| Le panneau arrête après un bout de temps | Refais A5.3 (applis jamais en veille) et vérifie que la notif « wake lock held » est là |
| Ne démarre pas tout seul après un redémarrage | Ouvre Termux:Boot une fois, refais B4 |
| Fire TV : « Pas jumelé » | Appuie sur **Jumeler** pendant que la Fire TV est allumée |
| Fire TV : « injoignable » | Vérifie l'IP (partie D), et que la tablette et la Fire TV sont sur le **même wifi** |
| La tablette est encore lente | Redémarre-la, baisse la résolution (A6), désinstalle d'autres applis (A2) |
| Le Mac ne se réveille pas | Vérifie l'adresse MAC (partie E) et qu'il est en veille, pas éteint |

---

## Partie G — Configuration (`config.json`)

- `port` : le port du panneau (8080 par défaut).
- `token` : mot de passe optionnel. Si tu en mets un, ouvre `http://localhost:8080/?token=TONMOTDEPASSE` une fois (il est mémorisé).
- `firetv.ip`, `firetv.apps` : voir partie D.
- `wol.devices` : les appareils à réveiller (Mac, PC…) avec leur adresse MAC.
- `tv` : autres marques de télé (Roku, Sony), désactivé par défaut.

Après chaque changement : **Ctrl+C** dans Termux puis `./demarrer.sh`.

## Partie H — Ajouter une fonctionnalité

1. Copie `plugins/_modele` vers `plugins/mon-truc` : `cp -r plugins/_modele plugins/mon-truc`
2. Modifie `plugins/mon-truc/index.js` : un nom, une icône, des actions (chaque action = un bouton).
3. Ajoute sa config dans `config.json` sous `plugins.mon-truc` si besoin.
4. Redémarre le panneau. Le bouton apparaît tout seul.

## Partie I — (Optionnel) Rouler sur un Mac à la place

`brew install node`, puis `npm start` dans le dossier. Sur un Mac, une carte **Mac mini** de plus apparaît
(écran, volume, verrou, musique). macOS va demander d'autoriser le Terminal dans
Réglages Système > Confidentialité > Accessibilité / Automatisation : dis oui.

## Structure

```
server.js            serveur + chargement automatique des plugins
demarrer.sh          lance le panneau sur la tablette (Termux)
config.example.json  exemple de configuration
plugins/firetv       Fire TV (API de l'app officielle, ou ADB) : télécommande + apps
plugins/wol          Wake-on-LAN pour réveiller le Mac et d'autres appareils
plugins/mac          contrôle du Mac (seulement si le panneau roule sur un Mac)
plugins/tv           autres télés (Roku, Sony), désactivé par défaut
plugins/systeme      bouton « Mettre à jour » (depuis GitHub)
plugins/_modele      modèle à copier pour un nouveau plugin
public/              l'interface (HTML/CSS/JS)
```
