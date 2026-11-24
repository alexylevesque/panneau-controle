# Brancher l'iPhone au panneau

Trois parties, dans l'ordre. Compte environ 20 minutes.

Avant de commencer : sur la tablette, va dans **Réglages** > 🔄 **Mettre à jour**.

---

## 1. La pile de l'iPhone (appli Raccourcis) — 5 min

Sur la tablette, va dans **Appareils** > **Connecter mon iPhone** pour voir l'adresse exacte à utiliser (exemple : `http://192.168.2.45:8080/api/appareils/action/signal`).

Sur l'iPhone :

1. Ouvre **Raccourcis** > onglet **Raccourcis** > **+**. Nomme-le **Panneau**.
2. Ajoute l'action **Obtenir le niveau de la batterie**.
3. Ajoute l'action **Obtenir le contenu de l'URL** et colle l'adresse de la tablette.
4. Touche la petite flèche de cette action :
   - **Méthode** : POST
   - **Corps de la requête** : JSON
   - Ajoute 3 champs **Texte** :
     - `id` = `iphone`
     - `nom` = `iPhone`
     - `batterie` = la variable **Niveau de la batterie** (choisis-la dans la barre au-dessus du clavier)
5. Touche ▶ pour tester. Sur la tablette, ton iPhone et sa pile apparaissent dans **Appareils**.

**Pour que ça se mette à jour tout seul** : onglet **Automatisation** > **+** :

- **Chargeur** > « Est connecté » et « Est déconnecté » > **Exécuter immédiatement** > raccourci **Panneau**.
- **Wi-Fi** > ton réseau > **Exécuter immédiatement** > **Panneau**.
- (Optionnel) **Niveau de la batterie** > « Descend sous 50 % », puis « 20 % », pareil.

> Si l'adresse de la tablette change un jour (après un redémarrage du routeur), mets la nouvelle adresse dans le raccourci.
> Pour l'éviter : dans ton routeur, réserve une adresse IP fixe pour la tablette.

---

## 2. Faire sonner l'iPhone (appli Pushover) — 5 min

1. Sur l'iPhone, installe **Pushover** (App Store) et crée un compte. Il y a 30 jours d'essai gratuit, puis environ 7 $ une seule fois.
2. Dans Pushover sur l'iPhone, copie ta **User Key** (elle est sur l'écran principal).
3. Sur **pushover.net**, connecte-toi > **Create an Application/API Token** > nom : **Panneau** > copie l'**API Token**.
4. Dans Pushover sur l'iPhone : **Settings** > active **Critical Alerts**. C'est ce qui permet de sonner même en mode silencieux.
5. Sur la tablette : **Appareils** > **Faire sonner l'iPhone**. Colle les deux codes > **Enregistrer et tester**. L'iPhone sonne!

Pour arrêter la sonnerie : touche l'alerte sur l'iPhone, ou **Arrêter la sonnerie** sur la tablette.

---

## 3. Notifications et appels (appli Pont iPhone) — 10 min

C'est une petite appli Android pour la tablette. Elle se connecte à l'iPhone en Bluetooth, comme une montre intelligente.

**Sur la tablette :**

1. Dans **Chrome**, va à :
   `github.com/alexylevesque/panneau-controle/releases/download/pont/pont-iphone.apk`
2. Ouvre le fichier téléchargé > **Installer**. Si Android bloque : **Paramètres** > autorise les **Sources inconnues** le temps de l'installer.
3. Ouvre **Pont iPhone**. Si le Bluetooth est éteint, accepte de l'allumer. Tu dois voir « Prêt : connecte l'iPhone à « Panneau » ».

**Sur l'iPhone (une seule fois) :**

4. Installe l'appli gratuite **nRF Connect for Mobile** (App Store).
5. Ouvre-la > **SCAN** > trouve **Panneau** > **CONNECT**.
6. L'iPhone demande de **jumeler** : accepte. Puis il demande d'**autoriser les notifications** pour « Panneau » : accepte.
7. Dans Pont iPhone, sur la tablette, tu dois voir **« iPhone connecté ✔ »**.

Ensuite tu peux fermer nRF Connect. Le Bluetooth de l'iPhone garde le lien, et la tablette se reconnecte toute seule quand l'iPhone revient à la maison.

**Ce que ça donne dans le panneau (onglet Appareils) :**

- Tes notifications arrivent en direct. Touche-en une pour la lire.
- Quand quelqu'un t'appelle, l'écran d'appel s'affiche : **Accepter** ou **Refuser**. Si tu acceptes, tu parles dans ton iPhone.

**Si ça ne marche pas :** ouvre Pont iPhone et envoie-moi une photo de l'écran. Le journal en bas dit ce qui bloque.
Si c'est écrit « Mode périphérique non supporté », la tablette ne peut pas jouer le rôle de montre. Dis-le-moi et on essaiera autrement.
