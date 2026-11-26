# Envoyer tes pas de l'iPhone au panneau

Le panneau affiche tes pas dans **Appareils > iPhone > Santé**. L'iPhone ne les partage pas en Bluetooth, alors un petit raccourci les envoie à la tablette, tout seul, quelques fois par jour.

> L'iPhone doit être sur le **Wi-Fi de la maison** pour que ça marche.

---

## 1. Créer le raccourci « Pas au panneau »

1. Ouvre l'app **Raccourcis**, onglet **Raccourcis**, puis touche **+**.
2. Renomme-le **Pas au panneau** (touche le nom en haut).
3. Ajoute l'action **Trouver des échantillons de santé** (cherche « santé »).
   - Touche **Type** et choisis **Pas**.
   - Touche **Ajouter un filtre** : **Date de début** · **est aujourd'hui**.
4. Ajoute l'action **Calculer les statistiques**.
   - Statistique : **Somme**.
5. Ajoute l'action **Obtenir le contenu de l'URL**.
   - URL : `http://192.168.2.91:8080/api/sante/action/pas`
   - Touche **Afficher plus** :
     - **Méthode** : `POST`
     - **En-têtes** : rien
     - **Corps de la requête** : `JSON`
     - Touche **Ajouter un nouveau champ** > **Nombre**.
       - Clé : `n`
       - Valeur : touche le champ, puis choisis la variable **Statistiques** (le résultat de l'étape 4).
6. Touche **▶︎** en bas pour tester. La première fois, autorise l'accès à **Santé**.
7. Sur la tablette, dans Appareils > iPhone > Santé, tes pas doivent apparaître (« màj à l'instant »).

---

## 2. Le faire rouler tout seul

1. Dans Raccourcis, onglet **Automatisation**, puis touche **+**.
2. Choisis **Heure de la journée**.
   - Heure : par exemple **12:00**.
   - Répéter : **Quotidiennement**.
   - Coche **Exécuter immédiatement**, et décoche **Avertir lors de l'exécution**.
3. Touche **Suivant** et choisis le raccourci **Pas au panneau**.
4. Refais la même chose pour d'autres heures, par exemple **15:00**, **18:00** et **21:00**.

Astuce : ajoute aussi une automatisation **Wi-Fi** > « Se connecte à » ton réseau de la maison. Tes pas seront envoyés dès que tu rentres chez toi.

---

## Si ça ne marche pas

| Problème | Solution |
|---|---|
| « Impossible de se connecter au serveur » | L'iPhone n'est pas sur le Wi-Fi de la maison, ou la tablette est éteinte. |
| Le panneau affiche 0 pas | Vérifie l'étape 3 : le filtre doit être **Date de début est aujourd'hui**. |
| Ça demande la permission chaque fois | Dans l'automatisation, coche **Exécuter immédiatement**. |
| L'adresse de la tablette a changé | Regarde la nouvelle adresse dans Réglages du panneau et corrige l'URL de l'étape 5. |
