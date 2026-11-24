// Appareils : les appareils (iPhone, Mac…) qui se signalent au panneau.
// Un appareil envoie POST /api/appareils/action/signal avec { id, nom, type, batterie, enCharge }.
// Sur iPhone, c'est un Raccourci (appli Raccourcis) qui le fait tout seul.
const fs = require('fs');
const path = require('path');

module.exports = (cfg) => {
  const FILE = path.join(__dirname, '..', '..', 'appareils.json');
  const EN_LIGNE_MS = (cfg.minutesEnLigne || 20) * 60 * 1000;
  let liste = {};
  try { liste = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(liste, null, 2)); } catch (e) {} };

  // Adresse de la tablette sur le Wi-Fi (pour configurer le Raccourci de l'iPhone)
  function adresse() {
    try {
      const nets = require('os').networkInterfaces();
      const ips = [].concat.apply([], Object.keys(nets).map(k => nets[k]))
        .filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
      const ip = ips.find(a => /^192\.168\./.test(a)) || ips[0];
      return ip ? `http://${ip}:${process.env.PORT || 8080}` : '';
    } catch (e) { return ''; }
  }

  function vue() {
    const now = Date.now();
    return Object.keys(liste).map(id => {
      const a = liste[id];
      return Object.assign({}, a, { id, connecte: now - a.vu < EN_LIGNE_MS, ilYa: Math.round((now - a.vu) / 60000) });
    }).sort((a, b) => b.vu - a.vu);
  }

  return {
    name: 'Appareils',
    icon: '📱',
    actions: {
      signal: { label: 'Signaler', run: async (p) => {
        const id = String(p.id || p.nom || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
        if (!id) throw new Error('id manquant');
        const a = liste[id] || {};
        a.nom = String(p.nom || a.nom || id).slice(0, 40);
        a.type = String(p.type || a.type || 'iphone').toLowerCase();
        if (p.batterie !== undefined && p.batterie !== '') {
          let b = parseFloat(String(p.batterie).replace(',', '.'));
          if (b > 0 && b <= 1) b = b * 100;            // Raccourcis peut donner 0.85
          if (!isNaN(b)) a.batterie = Math.round(b);
        }
        if (p.enCharge !== undefined) a.enCharge = p.enCharge === true || /^(1|true|oui|yes|vrai)$/i.test(String(p.enCharge));
        a.vu = Date.now();
        liste[id] = a;
        save();
        return 'OK';
      } },
      oublier: { label: 'Oublier', run: async ({ id }) => { delete liste[id]; save(); return 'Oublié'; } },
    },
    async status() { return { appareils: vue(), adresse: adresse() }; },
  };
};
