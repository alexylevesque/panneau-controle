// Fire TV (Amazon) via ADB sur le réseau.
// Prérequis : `brew install android-platform-tools` sur le Mac,
// et sur la Fire TV : Paramètres > Ma Fire TV > Options pour les développeurs > Débogage ADB : ON.
const { execFile } = require('child_process');

module.exports = (cfg) => {
  const target = `${cfg.ip}:${cfg.port || 5555}`;
  const adbBin = cfg.adb || 'adb';

  const adb = (...args) => new Promise((resolve, reject) => {
    execFile(adbBin, args, { timeout: 8000 }, (err, out, errOut) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error('adb introuvable : fais « brew install android-platform-tools »'));
        return reject(new Error((errOut || err.message).trim()));
      }
      resolve(out.trim());
    });
  });

  async function connect() {
    const out = await adb('connect', target);
    if (/unauthorized/i.test(out)) throw new Error('Accepte la demande de connexion sur la télé');
    if (/failed|unable|refused/i.test(out)) throw new Error(`Fire TV injoignable (${target}) : ${out}`);
  }

  async function shell(cmd) {
    try {
      return await adb('-s', target, 'shell', cmd);
    } catch (e) {
      await connect();                 // pas connecté ? on (re)connecte une fois
      return adb('-s', target, 'shell', cmd);
    }
  }

  const key = code => () => shell(`input keyevent ${code}`).then(() => null);
  const app = pkg => () => shell(`monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`).then(() => null);

  const actions = {
    on:      { label: 'Allumer', icon: '⏻', color: 'green', run: key(224) },  // KEYCODE_WAKEUP (allume aussi la télé via HDMI-CEC)
    off:     { label: 'Éteindre', icon: '⏻', color: 'red', run: key(223) },   // KEYCODE_SLEEP
    volDown: { label: 'Vol −', icon: '🔉', run: key(25) },
    volUp:   { label: 'Vol +', icon: '🔊', run: key(24) },
    mute:    { label: 'Muet', icon: '🔇', run: key(164) },
    home:    { label: 'Accueil', icon: '🏠', run: key(3) },
    back:    { label: 'Retour', icon: '↩', run: key(4) },
    menu:    { label: 'Menu', icon: '☰', run: key(82) },
    up:      { label: 'Haut', icon: '▲', run: key(19) },
    left:    { label: 'Gauche', icon: '◀', run: key(21) },
    ok:      { label: 'OK', icon: '●', run: key(23) },
    right:   { label: 'Droite', icon: '▶', run: key(22) },
    down:    { label: 'Bas', icon: '▼', run: key(20) },
    rew:     { label: 'Reculer', icon: '⏪', run: key(89) },
    play:    { label: 'Play/Pause', icon: '⏯', run: key(85) },
    ff:      { label: 'Avancer', icon: '⏩', run: key(90) },
  };

  // Raccourcis d'apps, configurables dans config.json
  (cfg.apps || []).forEach((a, i) => {
    actions[`app${i}`] = { label: a.name, icon: a.icon || '📱', run: app(a.package) };
  });

  return {
    name: 'Fire TV',
    icon: '🔥',
    layout: 'remote',
    actions,
    async status() {
      try {
        const out = await shell('dumpsys power | grep -m1 mWakefulness=');
        return { texte: /Awake/.test(out) ? 'Allumée' : 'En veille' };
      } catch (e) {
        return { texte: e.message };
      }
    },
  };
};
