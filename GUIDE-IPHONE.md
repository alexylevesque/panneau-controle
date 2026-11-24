# iPhone + panneau : le plan simple

Fais les 4 étapes dans l'ordre. Une ligne = une action.

---

## ✅ Étape 1 : le raccourci Panneau (fait)

## ✅ Étape 2 : l'automatisation du chargeur (fait)

---

## Étape 2b : savoir s'il est en charge (2 min, si pas encore fait)

Sur l'iPhone, dans **Raccourcis** :

1. Ouvre le raccourci **Panneau**
2. Ajoute l'action **Connecté au chargeur** (cherche « chargeur »)
3. Glisse-la juste sous **Obtenir Niveau de la batterie**
4. Dans **Obtenir le contenu de l'URL**, touche **Ajouter un champ** > **Booléen**
5. Clé : **enCharge**. Valeur : la variable **Connecté au chargeur**
6. **OK**

✔️ Test : branche l'iPhone. Sur la tablette (**Appareils**), c'est écrit « ⚡ En charge ». Débranche : le ⚡ disparaît.

> Facultatif : une 2e automatisation **Wi-Fi** (ton réseau > **Rejoint**) > **Exécuter immédiatement** > **Panneau**.

---

## ✅ Étape 3 : faire sonner l'iPhone (fait)

Son : **Up Down** (inclus dans Pushover), seulement sur l'iPhone. Pour l'arrêter sur l'iPhone, ouvre le message dans Pushover > **Acknowledge**.

---

## 👉 Tu es ici : Étape 4 : notifications, appels et AirPods (10 min)

Sur la tablette :

1. **Paramètres** > **Localisation** : **activée**
2. Dans **Chrome**, ouvre :
   `github.com/alexylevesque/panneau-controle/releases/download/pont/pont-iphone.apk`
3. Ouvre le fichier téléchargé > **Installer**
   (si Android bloque : touche **Paramètres** > active **Sources inconnues**, puis reviens)
4. Ouvre **Pont iPhone** > accepte tout (Bluetooth, localisation)

Sur l'iPhone :

5. Installe **nRF Connect for Mobile** (App Store, gratuit)
6. Ouvre-le > **SCAN**
7. À côté de **Panneau** > **CONNECT**
8. Accepte le **jumelage**
9. Accepte **Autoriser les notifications**

✔️ Test : dans Pont iPhone, c'est écrit **« iPhone connecté ✔ »**, et dans le panneau (**Appareils**) tu vois la pastille verte **Connecté**. La pile se met alors à jour toute seule.

---

## Si ça bloque

Envoie une photo de l'écran où tu es bloqué.
