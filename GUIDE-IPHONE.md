# iPhone + panneau : le plan simple

Fais les 4 étapes dans l'ordre. Une ligne = une action.

---

## ✅ Étape 1 : le raccourci Panneau (déjà fait)

Ton raccourci **Panneau** envoie la pile de l'iPhone à la tablette. Il fonctionne.

---

## Étape 2 : l'automatisation du chargeur (2 min)

Sur l'iPhone, dans **Raccourcis** :

1. Si tu vois « Tous les raccourcis », touche **<** en haut à gauche pour revenir à l'écran principal
2. Touche **Automatisation**, puis **+** (en haut à droite)
3. **Chargeur**
4. Coche **Est connecté** et **Est déconnecté**
5. **Exécuter immédiatement**
6. **Suivant**
7. Touche **Panneau**
8. **OK**

✔️ Test : débranche l'iPhone. Sur la tablette (**Appareils**), le ⚡ disparaît.

> Facultatif : refais la même chose en choisissant **Wi-Fi** à l'étape 3 (ton réseau > **Rejoint**).

---

## Étape 3 : faire sonner l'iPhone (5 min)

Sur l'iPhone :

1. Installe **Pushover** (App Store) et crée un compte
2. Dans Pushover : **Settings** > active **Critical Alerts**
3. Copie ta **User Key** (écran principal de Pushover)

Sur un navigateur (iPhone ou ordi) :

4. Va sur **pushover.net** et connecte-toi
5. **Create an Application/API Token**, nom : **Panneau**
6. Copie l'**API Token**

Sur la tablette :

7. **Appareils** > **Faire sonner l'iPhone**
8. Colle la **User Key** et l'**API Token**
9. **Enregistrer et tester**

✔️ Test : l'iPhone sonne.

---

## Étape 4 : notifications, appels et AirPods (10 min)

Sur la tablette :

1. **Paramètres** > **Localisation** : **activée**
2. Dans **Chrome**, ouvre :
   `github.com/alexylevesque/panneau-controle/releases/download/pont/pont-iphone.apk`
3. Ouvre le fichier téléchargé > **Installer**
4. Ouvre **Pont iPhone** > accepte tout (Bluetooth, localisation)

Sur l'iPhone :

5. Installe **nRF Connect for Mobile** (App Store, gratuit)
6. Ouvre-le > **SCAN**
7. À côté de **Panneau** > **CONNECT**
8. Accepte le **jumelage**
9. Accepte **Autoriser les notifications**

✔️ Test : dans Pont iPhone, sur la tablette, c'est écrit **« iPhone connecté ✔ »**.

---

## Si ça bloque

Envoie une photo de l'écran où tu es bloqué.
