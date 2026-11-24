# Mode panneau — Galaxy Tab A (SM-T580, Android 6)

But : quand tu prends la tablette, il n'y a **que le panneau**, en plein écran, et ça répond vite.

Fais les étapes dans l'ordre. Compte environ 30 minutes.

> Sur Android 6, les menus Samsung s'appellent un peu différemment. Si tu ne trouves pas un menu,
> appuie sur **RECHERCHER** en haut des Paramètres et tape le mot en gras.

---

## Étape 1 — Démarrage automatique du panneau (2 min)

Dans **Termux** :

1. **CTRL** puis **c** pour arrêter le panneau.
2. Tape une ligne à la fois :
   ```
   git pull
   sh installer-auto.sh
   ```
   Tu dois voir `OK!`.
3. Pour tester : dans la notification Termux, appuie sur **Exit**, puis rouvre Termux.
   Le panneau doit repartir tout seul (« Panneau prêt ! »).

À partir de maintenant, **ouvrir Termux = démarrer le panneau**. Si tu l'ouvres alors qu'il roule déjà,
il te le dit et ne fait rien de plus.

Tu peux glisser Termux hors des applis récentes sans crainte : il continue de rouler en arrière-plan
(c'est la notification « Termux » qui le garde en vie). Le seul moyen de l'arrêter, c'est **Exit** dans cette notification.

---

## Étape 2 — Fully Kiosk Browser (la page en plein écran) (10 min)

Fully Kiosk remplace Chrome : il ouvre le panneau en plein écran, sans barre d'adresse, et le recharge tout seul.

1. Play Store > installe **Fully Kiosk Browser**.
2. Ouvre-le. Comme **Start URL**, mets exactement :
   ```
   http://127.0.0.1:8080
   ```
3. Ouvre ses réglages : glisse depuis le **bord gauche** de l'écran > **Settings**. Règle :

| Menu | Réglage | Mets |
|---|---|---|
| Web Content Settings | Start URL | `http://127.0.0.1:8080` |
| Web Auto Reload | Auto Reload on Network Reconnect | ✅ |
| Web Auto Reload | Auto Reload after Page Error | ✅ (10 secondes) |
| Web Zoom and Scaling | Enable Zoom | ❌ |
| Web Browsing Settings | Enable Pull to Refresh | ❌ |
| Toolbars and Appearance | Show Status Bar / Show Navigation Bar | ❌ |
| Device Management | Keep Screen On | ✅ |
| Device Management | Launch on Boot | ✅ |
| Device Management | Screen Brightness | 100 (échelle de 0 à 255; vide = luminosité d'Android) |
| Advanced Web Settings | Enable Hardware Acceleration | ✅ |

### Faire de Fully Kiosk l'écran d'accueil

Comme ça, le bouton **Accueil** (le bouton physique du milieu) ramène toujours au panneau.

1. Appuie sur le bouton **Accueil** de la tablette.
2. Android demande quelle appli utiliser : choisis **Fully Kiosk Browser** > **Toujours**.
3. Si Android ne demande rien : Paramètres > **Applications** > **Applications par défaut** > **Écran d'accueil** > **Fully Kiosk Browser**.

Pour revenir au vrai écran d'accueil Samsung plus tard : même menu, choisis **TouchWiz** (ou Accueil Samsung).

---

## Étape 3 — Ménage des applis (le plus gros gain de vitesse) (10 min)

Paramètres > **Applications** > **Gestionnaire d'applications**.
Pour chaque appli inutile : appuie dessus > **Désinstaller**, ou **Désactiver** si Désinstaller n'existe pas.

À enlever : Facebook, jeux, Microsoft (Word, Excel, OneDrive, Skype), Samsung Notes / S Note,
S Health, Samsung Music, Samsung Vidéo, Galaxy Apps, Dropbox, Hancom, Smart Manager si tu veux,
Google Play Musique / Films / Livres, Google+, Hangouts, Duo, Gmail (si tu ne t'en sers pas ici).

**À garder** : Termux, Fully Kiosk Browser, Chrome, Play Store, Services Google Play, Paramètres,
**Android System WebView** (Fully Kiosk en a besoin), Clavier Samsung.

Ensuite : Play Store > ☰ > **Mes applis et jeux** > mets à jour **Android System WebView** et **Fully Kiosk**.
Une WebView à jour = page plus rapide.

---

## Étape 4 — Animations et écran allumé (3 min)

1. Paramètres > **À propos de l'appareil** > **Informations sur le logiciel** > tape **7 fois** sur **Numéro de version**.
2. Paramètres > **Options de développement** :

| Réglage | Mets |
|---|---|
| **Échelle animation fenêtres** | Animation désactivée |
| **Échelle animation transitions** | Animation désactivée |
| **Échelle durée animation** | Animation désactivée |
| **Rester activé** | ✅ (écran toujours allumé pendant la charge) |
| **Limite processus en arrière-plan** | Limite standard (**ne touche pas**, sinon le panneau s'arrête) |

---

## Étape 5 — Pile (3 min)

1. Paramètres > **Pile** > **Mode économie d'énergie** : ❌ désactivé.
2. Paramètres > **Pile** > **Optimisation de la pile** (ou Utilisation de la pile > Plus > Optimiser) :
   choisis « Toutes les applis », puis mets **Termux** et **Fully Kiosk** à **Ne pas optimiser**.
3. Paramètres > **Pile** > **Applications en veille** (si présent) : retire Termux et Fully Kiosk.

**Protéger la pile** (pas d'option automatique sur cette tablette) :
- Le mieux : brancher le chargeur sur une **prise intelligente** qui coupe le courant 2 à 3 h par nuit.
- Sinon : une fois par semaine, débranche jusqu'à ~30 %, puis rebranche.
- Si l'arrière de la tablette se met à **bomber**, débranche-la et arrête de l'utiliser.

---

## Étape 6 — Écran et le reste (3 min)

- Paramètres > **Affichage** : Luminosité ~40 %, **Luminosité auto** ❌, **Mise en veille de l'écran** : 10 minutes (Fully garde l'écran allumé de toute façon).
- Paramètres > **Écran verr. et sécurité** > **Type de verrouillage** : **Aucun**.
- Paramètres > **Écran verr. et sécurité** > **Sources inconnues** : ❌ (on n'en a plus besoin).
- Paramètres > **Notifications** : coupe les notifications de toutes les applis.
- Paramètres > **Sons et vibrations** : **Muet**.
- Paramètres > **Connexions** > **Bluetooth** ❌, **Localisation** ❌.
- Paramètres > **Connexions** > **Wi-Fi** > **PLUS** > **Avancé** > **Garder le Wi-Fi activé en veille** : **Toujours**.
- Play Store > ☰ > Paramètres > **Mise à jour automatique des applis** : **Ne pas mettre à jour automatiquement**.

---

## Si la tablette redémarre

Sur Android 6, Termux ne peut pas toujours se lancer tout seul au démarrage. Après un redémarrage :

1. Fully Kiosk s'ouvre tout seul et affiche « Serveur injoignable ». C'est normal.
2. Ouvre **Termux** une fois (glisse depuis le bord gauche dans Fully > Settings > Exit, ou par la liste des applis).
   Le panneau démarre tout seul.
3. Appuie sur le bouton **Accueil** : tu reviens au panneau, qui se recharge tout seul.

Comme la tablette reste toujours branchée, ça ne devrait arriver que rarement.

---

## Mises à jour du panneau

Carte **⚙️ Système** > **🔄 Mettre à jour**. C'est tout.
