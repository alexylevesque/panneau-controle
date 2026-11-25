// IA : les vraies icônes des applis (ChatGPT, Claude…), demandées à l'App Store depuis la tablette et gardées en cache.
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const FILE = path.join(__dirname, '..', '..', 'ia-icones.json');
// nom dans le panneau -> recherche App Store + éditeur attendu (pour ne pas prendre une copie)
const APPS = {
  ChatGPT: { terme: 'ChatGPT', editeur: /openai/i },
  Claude: { terme: 'Claude by Anthropic', editeur: /anthropic/i },
  Gemini: { terme: 'Google Gemini', editeur: /google/i, titre: /gemini/i },
  Copilot: { terme: 'Microsoft Copilot', editeur: /microsoft/i, titre: /copilot/i },
  Grok: { terme: 'Grok', editeur: /x\.?ai|x corp/i, titre: /grok/i },
  Muse: { terme: 'muse.ai', editeur: /muse/i },
};

function recherche(terme) {
  return new Promise((resolve, reject) => {
    https.get({ host: 'itunes.apple.com', path: '/search?entity=software&country=ca&limit=15&term=' + encodeURIComponent(terme), timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (panneau)' } }, r => {
      let d = ''; r.on('data', c => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d).results || []); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

module.exports = () => {
  let icones = {};
  try { icones = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  let essaiA = 0;
  async function charger() {
    const manque = Object.keys(APPS).filter(n => !icones[n]);
    if (!manque.length || Date.now() - essaiA < 10 * 60000) return;
    essaiA = Date.now();
    for (const n of manque) {
      try {
        const a = APPS[n];
        const r = (await recherche(a.terme)).filter(x => a.editeur.test(x.sellerName || x.artistName || '') && (!a.titre || a.titre.test(x.trackName || '')))[0];
        if (r) icones[n] = String(r.artworkUrl512 || r.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/256x256bb.');
      } catch (e) {}
    }
    try { fs.writeFileSync(FILE, JSON.stringify(icones)); } catch (e) {}
  }
  setTimeout(charger, 3000);
  return {
    name: 'IA',
    icon: '✨',
    actions: {
      icones: { label: 'Icônes des IA', run: async () => { charger(); return icones; } },
      // Sur la tablette : Termux ouvre Firefox lui-même (Fully Kiosk bloque les liens vers d'autres applis)
      ouvrir: { label: 'Ouvrir dans Firefox', run: async ({ url }) => {
        url = String(url || '');
        if (!/^https:\/\/([a-z0-9-]+\.)*(chatgpt\.com|claude\.ai|google\.com|microsoft\.com|grok\.com|muse\.ai)(\/[^\s"']*)?$/i.test(url)) throw new Error('Lien refusé');
        const am = args => new Promise((resolve, reject) => execFile('am', args, { timeout: 10000 }, (err, out, errOut) => {
          const txt = String(out || '') + String(errOut || '');
          if (err || /Error|Exception/i.test(txt)) reject(new Error(txt.trim() || (err && err.message) || 'am a échoué')); else resolve(txt);
        }));
        const base = ['start', '-a', 'android.intent.action.VIEW', '-d', url];
        try { await am(base.concat(['-p', 'org.mozilla.firefox'])); }
        catch (e) {
          try { await am(base.concat(['-n', 'org.mozilla.firefox/org.mozilla.fenix.IntentReceiverActivity'])); }
          catch (e2) { await am(base); }   // dernier recours : le navigateur par défaut
        }
        return 'OK';
      } },
    },
  };
};
