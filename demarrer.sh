#!/data/data/com.termux/files/usr/bin/sh
# Démarre le panneau sur la tablette (Termux). Empêche Android de l'endormir.
cd "$(dirname "$0")"
termux-wake-lock 2>/dev/null
[ -f config.json ] || cp config.example.json config.json
exec node server.js
