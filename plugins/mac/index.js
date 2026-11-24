// Contrôle du Mac mini lui-même (le serveur tourne dessus)
const { execFile } = require('child_process');
const isMac = process.platform === 'darwin';

function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    if (!isMac) return resolve(`(simulation) ${cmd} ${args.join(' ')}`);
    execFile(cmd, args, (err, out) => (err ? reject(err) : resolve(out.trim())));
  });
}
const osa = script => run('osascript', ['-e', script]);

// Ce plugin ne s'affiche que si le serveur roule SUR le Mac.
module.exports = () => (!isMac ? null : {
  name: 'Mac mini',
  icon: '🖥️',
  actions: {
    wake:     { label: 'Allumer écran', icon: '☀️', run: () => run('caffeinate', ['-u', '-t', '2']) },
    sleepScr: { label: 'Éteindre écran', icon: '🌙', run: () => run('pmset', ['displaysleepnow']) },
    lock:     { label: 'Verrouiller', icon: '🔒', run: () => osa('tell application "System Events" to keystroke "q" using {control down, command down}') },
    volDown:  { label: 'Volume −', icon: '🔉', run: () => osa('set volume output volume ((output volume of (get volume settings)) - 10)') },
    volUp:    { label: 'Volume +', icon: '🔊', run: () => osa('set volume output volume ((output volume of (get volume settings)) + 10)') },
    mute:     { label: 'Muet', icon: '🔇', run: () => osa('set volume output muted not (output muted of (get volume settings))') },
    playPause:{ label: 'Play / Pause', icon: '⏯️', run: () => osa('tell application "Music" to playpause') },
  },
  async status() {
    if (!isMac) return { texte: 'Simulation (pas sur macOS)' };
    const v = await osa('output volume of (get volume settings)').catch(() => '?');
    return { texte: `Volume : ${v}%` };
  },
});
