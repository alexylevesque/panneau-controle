# Voir ce qui joue sur la télé (Fire TV Stick 4K Select, Vega OS)

Sur le panneau, **Télé > En ce moment** montre ce qui joue sur la télé : l'appli, le titre, l'épisode, le temps, et l'affiche trouvée sur internet.

Ta Fire TV roule **Vega OS**. Vega ne laisse pas le panneau savoir ce qui joue. On installe donc sur la télé une petite appli maison, **Pont Télé**, qui le lit et l'envoie à la tablette toutes les 2 secondes.

> **C'est un essai.** Le contrôle des médias existe dans la doc de Vega, mais Amazon ne dit pas si une appli maison peut lire ce que jouent Netflix ou les autres. Elle ne dit pas non plus si elle continue de rouler quand Netflix est à l'écran. L'appli affiche tout ce qu'elle voit, pour qu'on le sache vite.

**Ce qu'il te faut :**
- un **Mac** (n'importe lequel), sur le même Wi-Fi que la télé. Toutes les commandes se font sur ce Mac ;
- ton compte Amazon ;
- environ **45 minutes** la première fois.

Sans l'appli, la carte montre seulement l'appli ouverte à partir du panneau.

---

## 1. Créer ton compte développeur Amazon (gratuit)

1. Sur le Mac, va sur **https://developer.amazon.com** et touche **Se connecter** (en haut à droite).
2. Connecte-toi avec **le même compte Amazon que la Fire TV**.
3. Remplis le profil développeur : nom, adresse et pays (Canada). Pour « Nom de l'entreprise », mets ton nom.
4. Accepte l'entente. Tu n'as rien à payer.

---

## 2. Préparer la Fire TV

1. **Paramètres > Ma Fire TV > À propos**. Mets-toi sur **Fire TV Stick 4K Select** et appuie **7 fois** sur le bouton du centre. (C'est déjà fait chez toi.)
2. Fais **Retour**, puis va dans **Options pour les développeurs > Mode développeur**.
3. Choisis **Continuer**. Un **code de 6 lettres** apparaît (ex. `UEV7NQ`). **Laisse cet écran ouvert**, on s'en sert à l'étape 4.
4. Note l'**adresse IP** de la télé : **Paramètres > Ma Fire TV > À propos > Réseau**.

> Si le code a disparu ou a expiré, refais les étapes 2 et 3 : un nouveau code apparaît.

---

## 3. Installer les outils Vega sur le Mac

Ouvre **Terminal** : `⌘ + Espace`, tape « Terminal », puis Entrée. Copie chaque bloc, colle-le dans Terminal et fais Entrée. Attends la fin avant de passer au suivant.

**a) Homebrew** (passe ce bloc si tu l'as déjà) :

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Le Mac demande ton mot de passe. C'est normal que rien ne s'affiche pendant que tu le tapes. À la fin, Homebrew affiche 2 commandes sous « Next steps » : copie-les et lance-les aussi.

**b) Node.js et les outils dont Vega a besoin :**

```bash
brew install node binutils coreutils gawk findutils grep jq lz4 gnu-sed watchman
[[ $(arch) == "arm64" ]] && softwareupdate --install-rosetta --agree-to-license
```

**c) Le SDK Vega :**

```bash
curl -fsSL https://sdk-installer.vega.labcollab.net/get_vvm.sh | bash && source ~/vega/env
```

S'il te propose l'extension « Vega Studio » pour VS Code, réponds **non**, on n'en a pas besoin.

**d) Vérifier :** ferme Terminal, rouvre-le, puis :

```bash
vega --version
```

Tu dois voir « Active SDK Version ». Si tu as « command not found », lance `source ~/vega/env` et réessaie.

---

## 4. Activer le mode développeur sur la télé

```bash
vega devmode login
```

Une page web s'ouvre. Connecte-toi avec ton compte développeur (étape 1), puis reviens dans Terminal.

Ensuite, mets **le code affiché sur la télé** à la place de `XXXXXX` :

```bash
vega devmode enable-device --code XXXXXX
```

La Fire TV **redémarre**. Après, dans **Options pour les développeurs > Mode développeur**, c'est écrit **Activé**.

Vérifie que le Mac voit la télé :

```bash
vega device list
```

**Si la liste est vide :**
1. Sur la télé, va dans **Options pour les développeurs > Mode de connexion**, choisis **TCP/IP**, puis **port standard 5555**. La télé redémarre.
2. Sur le Mac (192.168.2.200 = ta Fire TV) :

```bash
vega exec vda connect 192.168.2.200:5555
vega exec vda devices
```

---

## 5. Installer Pont Télé (une seule commande)

```bash
curl -fsSL https://raw.githubusercontent.com/alexylevesque/panneau-controle/main/vega/installer-pont-tele.sh | bash
```

Le script fait tout tout seul :
- il crée le projet dans `~/pont-tele` ;
- il met le code de Pont Télé ;
- il compile l'appli ;
- il l'installe et l'ouvre sur la télé.

La première fois, ça prend quelques minutes. À la fin, tu vois « ✅ Pont Télé est installée ». Pour mettre l'appli à jour plus tard, relance la même commande.

---

## 6. Essayer

1. Sur la télé, **Pont Télé** est ouverte. Elle affiche « X lecteur(s) trouvé(s) » et une ligne verte « Envoyé au panneau ».
2. Fais **Accueil**, lance **Netflix** et fais jouer quelque chose.
3. Sur la tablette, mets à jour le panneau (**Réglages > 🔄 Mettre à jour**), puis va dans **Télé**. La carte **En ce moment** devrait montrer le titre.
4. Reviens dans **Pont Télé** (elle est dans tes applis, à la fin de la liste) pendant que Netflix est en pause. Prends une **photo de l'écran** et envoie-la-moi. Elle me dit exactement ce que Vega laisse voir.

---

## Ce qu'on va apprendre (et ce que je ferai)

| Ce que Pont Télé affiche | Ce que ça veut dire | Prochaine étape |
|---|---|---|
| Le titre de Netflix, avec la ligne verte | Ça marche 🎉 | Rien, ou peaufiner |
| « Envoyé au panneau » seulement quand Pont Télé est à l'écran | Vega met l'appli en pause en arrière-plan | J'en fais un service qui roule en arrière-plan |
| « 0 lecteur trouvé » pendant que Netflix joue | Vega cache les autres applis à une appli maison | On revient à la version simple |
| Une erreur rouge « getSessionState » | Il manque une permission | J'ajoute la permission |
| « Panneau injoignable » | La télé ne rejoint pas la tablette | Vérifie l'IP de la tablette (en haut de `App.tsx`, `192.168.2.91`) |

---

## Si ça ne marche pas

| Problème | Solution |
|---|---|
| `vega: command not found` | Lance `source ~/vega/env`, ou ferme et rouvre Terminal. |
| Le code de la télé est refusé | Il a expiré. Refais l'étape 2 pour en avoir un nouveau. |
| `npm run build:app` échoue | Copie les 20 dernières lignes rouges et envoie-les-moi. |
| L'installation dit « no device » | Fais la partie « Si la liste est vide » de l'étape 4. |
| La télé a redémarré et le Mac ne la voit plus | Relance `vega exec vda connect 192.168.2.200:5555`. |

**Pour tout enlever :** sur la télé, désinstalle Pont Télé comme une autre appli, puis mets **Mode développeur** sur **Désactivé**.

---

### Pour une Fire TV sous Fire OS (pas la tienne)

Sur les vieilles Fire TV, ce qui joue se lit par **ADB**, sans appli. Active **Options pour les développeurs > Débogage ADB**, puis ajoute `"adb": true` sous `firetv` dans `config.json`. La première fois, accepte « Autoriser le débogage » sur la télé.
