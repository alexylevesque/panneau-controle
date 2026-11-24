# Ajouter l'iPhone de ta blonde

Ce que ça donne : sa **pile** (roue de charge), **Faire sonner**, ses **notifications** et ses **appels** (accepter / refuser).

> Ses notifs vont s'afficher sur la tablette : assure-toi qu'elle est d'accord 🙂

Une ligne = une action. ✅ = déjà fait.

---

## ✅ Étape 1 : le raccourci Panneau

Le plus simple : lui envoyer **ton** raccourci, puis changer 2 mots.

Sur **ton** iPhone :

1. **Raccourcis** > garde le doigt sur **Panneau** > **Partager**
2. **AirDrop** vers son iPhone (ou **Copier le lien iCloud** et envoie-le-lui par Messages)

Sur **son** iPhone :

3. Ouvre le raccourci reçu > **Ajouter le raccourci**
4. Touche **Panneau** pour l'ouvrir
5. Dans **Obtenir le contenu de l'URL**, touche la flèche pour voir les champs
6. **id** : remplace `iphone` par **iphone16**
7. **nom** : écris le nom à afficher, par exemple **iPhone de** suivi de son prénom
8. **OK**

✔️ Test : touche **Panneau** une fois. Sur la tablette, en haut à droite, son iPhone apparaît dans la liste.

---

## ✅ Étape 2 : l'automatisation du chargeur

Sur **son** iPhone, dans **Raccourcis** :

1. **Automatisation** > **+**
2. **Chargeur** > coche **Est connecté** et **Est déconnecté**
3. **Exécuter immédiatement** > **Suivant**
4. Choisis **Panneau** > **OK**

(Si son iOS est comme le tien, écris plutôt : « Lorsque le chargeur est connecté ou déconnecté, exécuter le raccourci Panneau ».)

✔️ Test : branche son iPhone. La roue tourne sur la tablette.

---

## ✅ Étape 3 : faire sonner son iPhone

Elle utilise **ton** compte Pushover (pas besoin d'en créer un autre).

Sur **son** iPhone :

1. Installe **Pushover** (App Store)
2. **Connecte-toi avec ton compte** Pushover (ton courriel et ton mot de passe)
3. Quand il demande le nom de l'appareil : **iphone16** (exactement)
4. **Settings** > active **Critical Alerts for emergency-priority**
5. Accepte **Autoriser les alertes critiques** si iOS le demande

✔️ Test : sur la tablette, choisis son iPhone en haut à droite > **Faire sonner**. Son iPhone sonne, pas le tien.

> Pushover est gratuit 30 jours, puis c'est un achat unique d'environ 5 $ US. Normalement, une seule licence iOS couvre tous les iPhone du même compte.

---

## 👉 Étape 4 : ses notifications et ses appels (5 min)

Sur la **tablette** :

1. Dans **Chrome**, ouvre (nouvelle version qui accepte plusieurs iPhone) :
   `github.com/alexylevesque/panneau-controle/releases/download/pont/pont-iphone.apk`
2. Ouvre le fichier > **Installer** (par-dessus l'ancienne, rien à effacer)
3. Ouvre **Pont iPhone** : ton iPhone se reconnecte tout seul

Sur **son** iPhone (sur ton Wi-Fi) :

4. Touche son raccourci **Panneau** une fois (c'est ça qui dit à la tablette que le prochain iPhone, c'est le sien)
5. Installe **nRF Connect for Mobile** (App Store, gratuit)
6. Ouvre-le > **SCAN** > à côté de **Panneau** > **CONNECT**
7. Accepte le **jumelage**
8. Accepte **Autoriser les notifications**

✔️ Test : dans Pont iPhone, c'est écrit **« 2 iPhone connectés ✔ (iphone, iphone16) »**. Sur la tablette, choisis son iPhone en haut à droite : pastille verte **Connecté** et ses notifs apparaissent.

> Un 3e iPhone ? Même chose : raccourci (avec un autre id), automatisation, Pushover, puis étapes 4 à 8.

---

## Si ça bloque

Envoie une photo de l'écran où tu es bloqué.
