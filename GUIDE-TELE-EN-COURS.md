# Voir ce qui joue sur la télé (« En ce moment »)

Sur le panneau, **Télé > En ce moment** montre ce qui joue sur la Fire TV : l'appli, le titre, l'épisode, le temps écoulé et l'affiche de la série ou du film.

La télécommande du panneau ne peut pas savoir ce qui joue. Pour ça, le panneau lit la Fire TV par **ADB** (le mode développeur d'Android). Il n'y a rien à installer sur la tablette, il faut seulement l'activer **une fois** sur la Fire TV.

> La tablette et la Fire TV doivent être sur le **même Wi-Fi**. La télécommande doit déjà marcher, avec la bonne adresse IP.

---

## 1. Faire apparaître les options pour les développeurs

Sur les Fire TV récentes, ce menu est caché.

1. Sur la Fire TV : **Paramètres** (l'engrenage) > **Ma Fire TV** > **À propos**.
2. Mets-toi sur la **première ligne**, celle avec le nom de ta Fire TV (ex. « Fire TV Stick 4K »).
3. Appuie **7 fois** sur le bouton du centre de la manette.
4. Le message « **Vous êtes maintenant un développeur** » apparaît en bas.
5. Fais **Retour** : la ligne **Options pour les développeurs** est maintenant dans **Ma Fire TV**.

Si le menu **Options pour les développeurs** est déjà là, passe à l'étape 2.

---

## 2. Activer le débogage ADB

1. **Paramètres** > **Ma Fire TV** > **Options pour les développeurs**.
2. **Débogage ADB** : mets-le sur **ACTIVÉ**.
3. Si la Fire TV affiche un avertissement, choisis **OK** ou **Activer**.

---

## 3. Autoriser la tablette (une seule fois)

1. Mets la **Fire TV allumée** sur l'écran d'accueil.
2. Sur la tablette, mets à jour le panneau : **Réglages > 🔄 Mettre à jour**.
3. Va dans **Télé**. Le panneau essaie de se connecter à la Fire TV.
4. Sur la télé, une fenêtre « **Autoriser le débogage USB ?** » apparaît, avec la clé « panneau@tablette ».
5. Coche **Toujours autoriser depuis cet ordinateur**, puis choisis **OK**.
6. Ouvre Netflix (ou une autre appli) et fais jouer quelque chose. En quelques secondes, la carte **En ce moment** affiche le titre.

Si la fenêtre n'apparaît pas, quitte la page Télé, attends 15 secondes, puis reviens.

---

## Ce que la carte affiche

| Sur la télé | Sur la carte |
|---|---|
| Une série ou un film joue | L'appli, le titre et l'épisode (si l'appli les donne), le temps écoulé et l'affiche |
| Un film trouvé sur iTunes | La barre de progression et le temps qui reste, en plus |
| C'est en pause | « En pause » et le bouton ▶︎ |
| Rien ne joue | L'appli ouverte et « Rien en lecture » |

- Le bouton de l'appli qui joue (Netflix, YouTube…) a le badge **EN COURS**.
- Les affiches viennent de **TVmaze** (séries) ou d'**iTunes** (films). Elles sont gardées sur la tablette, au plus 300 (environ 15 Mo).
- Le fond de la carte prend les couleurs de l'affiche, comme pour la musique.
- Pour YouTube, le panneau ne cherche pas d'affiche (ce sont des vidéos, pas des séries).

> Certaines applis ne disent pas à Android ce qu'elles jouent. Dans ce cas, la carte montre seulement le nom de l'appli et « En lecture », sans titre.

---

## Si ça ne marche pas

| Message sur la carte | Solution |
|---|---|
| « Active le débogage ADB » | Refais l'étape 2. Vérifie que la Fire TV est allumée. |
| « Accepte sur la télé » | La fenêtre d'autorisation attend sur la télé. Coche **Toujours autoriser** puis **OK**. |
| Tu as appuyé sur « Annuler » sur la télé | Quitte la page Télé, attends 15 s et reviens : la fenêtre réapparaît. |
| Le titre n'apparaît jamais | L'appli ne partage pas son titre. Essaie avec une autre appli (ex. Prime Video). |
| Mauvaise affiche | Le titre envoyé par l'appli correspond à une autre série. C'est rare, et ça ne touche que la photo. |
| Après un reset de la Fire TV | Refais les étapes 1 à 3. |

**Sécurité :** la clé de la tablette est gardée dans `firetv-adbkey.pem`, sur la tablette seulement (pas sur GitHub). Pour retirer l'accès : sur la Fire TV, **Options pour les développeurs** > **Débogage ADB** > **DÉSACTIVÉ**.
