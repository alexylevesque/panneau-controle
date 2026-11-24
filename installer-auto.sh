#!/data/data/com.termux/files/usr/bin/sh
# Fait démarrer le panneau automatiquement chaque fois que Termux s'ouvre,
# et avec Termux:Boot (si installé) quand la tablette démarre.
DIR="$(cd "$(dirname "$0")" && pwd)"
LINE="sh $DIR/demarrer.sh"
touch ~/.bashrc
grep -qF "$LINE" ~/.bashrc || echo "$LINE" >> ~/.bashrc
mkdir -p ~/.termux/boot
printf '#!/data/data/com.termux/files/usr/bin/sh\n%s\n' "$LINE" > ~/.termux/boot/panneau
chmod +x ~/.termux/boot/panneau
echo "OK! Le panneau va démarrer tout seul à l'ouverture de Termux."
