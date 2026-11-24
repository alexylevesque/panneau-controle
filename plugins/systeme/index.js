// Système : mise à jour du panneau depuis GitHub, en un bouton.
const { execFile } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, timeout: 60000 }, (err, out, errOut) => {
      if (err) return reject(new Error((errOut || err.message).trim()));
      resolve(out.trim());
    });
  });
}

module.exports = () => ({
  name: 'Système',
  icon: '⚙️',
  actions: {
    update: {
      label: 'Mettre à jour',
      icon: '🔄',
      run: async () => {
        const before = await git(['rev-parse', 'HEAD']);
        await git(['pull', '--ff-only']);
        const after = await git(['rev-parse', 'HEAD']);
        if (before === after) return 'Déjà à jour ✔';
        // demarrer.sh relance le serveur automatiquement après cette sortie
        setTimeout(() => process.exit(0), 500);
        return { reload: true, message: 'Mis à jour! Redémarrage…' };
      },
    },
    reload: { label: 'Recharger', icon: '↻', run: async () => ({ reload: true, message: 'Rechargement…' }) },
  },
  async status() {
    try {
      const d = await git(['log', '-1', '--format=%cd', '--date=format:%Y-%m-%d %H:%M']);
      return { texte: `Version du ${d}` };
    } catch (e) { return { texte: '' }; }
  },
});
