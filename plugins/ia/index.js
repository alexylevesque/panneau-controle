// IA : les vraies icônes des applis (ChatGPT, Claude…), demandées à l'App Store depuis la tablette et gardées en cache.
const fs = require('fs');
const path = require('path');
const https = require('https');

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
    actions: { icones: { label: 'Icônes des IA', run: async () => { charger(); return icones; } } },
  };
};
