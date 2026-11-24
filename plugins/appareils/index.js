// Appareils : les appareils (iPhone, Mac…) qui se signalent au panneau.
// Un appareil envoie POST /api/appareils/action/signal avec { id, nom, type, batterie, enCharge }.
// Sur iPhone, c'est un Raccourci (appli Raccourcis) qui le fait tout seul.
const fs = require('fs');
const path = require('path');
const https = require('https');
const qs = require('querystring');

// Identifiants iOS -> nom d'appli dans le panneau
const APPS = {
  'com.apple.MobileSMS': 'messages', 'com.apple.mobilephone': 'telephone', 'com.apple.mobilemail': 'mail',
  'com.facebook.Messenger': 'messenger', 'com.burbn.instagram': 'instagram', 'com.toyopagroup.picaboo': 'snapchat',
  'com.apple.mobilecal': 'calendrier', 'com.apple.facetime': 'facetime', 'net.whatsapp.WhatsApp': 'whatsapp',
  'com.zhiliaoapp.musically': 'tiktok', 'com.hammerandchisel.discord': 'discord', 'com.facebook.Facebook': 'facebook',
  'com.google.Gmail': 'gmail', 'com.google.ios.youtube': 'youtube',
};

// Vraies icônes des autres applis : demandées à l'App Store depuis la tablette, gardées en cache
const ICONES_FILE = path.join(__dirname, '..', '..', 'icones.json');
let icones = {};
try { icones = JSON.parse(fs.readFileSync(ICONES_FILE, 'utf8')); } catch (e) {}
const enCours = {};
function chercherIcone(appId) {
  if (!appId || /^com\.apple\.(MobileSMS|mobilephone|mobilecal|facetime)$/.test(appId) || icones[appId] !== undefined || enCours[appId]) return;   // Messages, Téléphone, Calendrier : pas sur l'App Store
  enCours[appId] = true;
  https.get({ host: 'itunes.apple.com', path: '/lookup?country=ca&bundleId=' + encodeURIComponent(appId), timeout: 8000 }, res => {
    let out = ''; res.on('data', c => (out += c));
    res.on('end', () => {
      delete enCours[appId];
      let r = null; try { r = JSON.parse(out).results[0]; } catch (e) { return; }
      // 256 px au lieu de 100 px : plus net
      icones[appId] = r ? { url: String(r.artworkUrl512 || r.artworkUrl100 || r.artworkUrl60 || '').replace(/\/\d+x\d+bb\./, '/256x256bb.'), nom: r.trackName } : null;
      try { fs.writeFileSync(ICONES_FILE, JSON.stringify(icones)); } catch (e) {}
    });
  }).on('error', () => { delete enCours[appId]; }).on('timeout', function () { this.destroy(); });
}

module.exports = (cfg) => {
  const FILE = path.join(__dirname, '..', '..', 'appareils.json');
  const EN_LIGNE_MS = (cfg.minutesEnLigne || 20) * 60 * 1000;
  let liste = {};
  try { liste = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(liste, null, 2)); } catch (e) {} };

  // ---- Pushover (faire sonner) ----
  const PO_FILE = path.join(__dirname, '..', '..', 'pushover.json');
  let po = {};
  try { po = JSON.parse(fs.readFileSync(PO_FILE, 'utf8')); } catch (e) {}
  function pushover(pathname, data) {
    return new Promise((resolve, reject) => {
      const body = qs.stringify(data);
      const req = https.request({ host: 'api.pushover.net', path: pathname, method: 'POST', timeout: 10000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let out = ''; res.on('data', c => (out += c));
        res.on('end', () => {
          let j = {}; try { j = JSON.parse(out); } catch (e) {}
          if (res.statusCode >= 400 || j.status !== 1) return reject(new Error('Pushover : ' + ((j.errors || []).join(', ') || res.statusCode)));
          resolve(j);
        });
      });
      req.on('timeout', () => req.destroy(new Error('Pushover ne répond pas')));
      req.on('error', reject);
      req.end(body);
    });
  }
  async function sonner(qui) {
    // Chaque iPhone = un appareil dans le même compte Pushover, nommé comme son id (ex. iphone, iphone2)
    qui = String(qui || 'iphone').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 25) || 'iphone';
    if (!po.user || !po.token) throw new Error('Configure Pushover d\'abord');
    const msg = { token: po.token, user: po.user, title: 'Panneau', message: '📍 Ton iPhone est ici!',
      priority: 2, retry: 30, expire: 600, sound: 'updown', device: qui };   // seulement ce cell, pas le Mac
    const r = await pushover('/1/messages.json', msg);
    po.receipt = r.receipt; po.depuis = Date.now(); po.qui = qui;
    fs.writeFileSync(PO_FILE, JSON.stringify(po));
  }

  // L'as-tu arrêtée sur l'iPhone ? On demande à Pushover (au plus aux 5 s)
  let verifie = 0;
  function verifierSonnerie() {
    if (!po.receipt || Date.now() - verifie < 5000) return;
    verifie = Date.now();
    const recu = po.receipt;
    https.get({ host: 'api.pushover.net', path: `/1/receipts/${recu}.json?token=${encodeURIComponent(po.token)}`, timeout: 8000 }, res => {
      let out = ''; res.on('data', c => (out += c));
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(out); } catch (e) {}
        if (po.receipt === recu && (j.acknowledged === 1 || j.expired === 1 || res.statusCode === 404)) {
          delete po.receipt; fs.writeFileSync(PO_FILE, JSON.stringify(po));
        }
      });
    }).on('error', () => {}).on('timeout', function () { this.destroy(); });
  }

  // ---- Pont Bluetooth (appli Android sur la tablette) ----
  // Notifs et appels arrivent de l'appli ; les commandes (accepter/refuser) attendent qu'elle les ramasse.
  let commandes = [];
  function iphone() {
    const a = liste.iphone || (liste.iphone = { nom: 'iPhone', type: 'iphone' });
    a.notifs = a.notifs || [];
    return a;
  }

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

  let pontVu = 0;
  function vue() {
    const now = Date.now();
    return Object.keys(liste).map(id => {
      const a = liste[id];
      const o = Object.assign({}, a, { id, connecte: now - a.vu < EN_LIGNE_MS, ilYa: Math.round((now - a.vu) / 60000) });
      // Connecté pour vrai : le pont Bluetooth dit que l'iPhone est relié ET le pont répond encore
      if (o.notifs) o.notifs = o.notifs.map(n => {
        const ic = icones[n.appId];
        if (ic === undefined) chercherIcone(n.appId);
        return ic ? Object.assign({}, n, { icone: ic.url, nomApp: ic.nom }) : n;
      });
      o.bluetooth = !!(a.bt && now - pontVu < 15000);
      if (o.airpods) o.airpods = Object.assign({}, o.airpods, { actifs: now - o.airpods.vu < 2 * 60 * 1000 });
      return o;
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
      // Faire sonner
      pushover: { label: 'Configurer Pushover', run: async ({ user, token }) => {
        po = { user: String(user || '').trim(), token: String(token || '').trim() };
        await sonner();                     // test : ça sonne tout de suite
        return 'Configuré';
      } },
      sonner: { label: 'Faire sonner', run: async ({ id }) => { await sonner(id); return 'Ça sonne'; } },
      arreter: { label: 'Arrêter la sonnerie', run: async () => {
        if (po.receipt) await pushover(`/1/receipts/${po.receipt}/cancel.json`, { token: po.token }).catch(() => {});
        delete po.receipt; fs.writeFileSync(PO_FILE, JSON.stringify(po));
        return 'Arrêté';
      } },

      // Reçu du pont Bluetooth : { evt: 'ajout'|'modif'|'retrait', uid, appId, titre, sousTitre, texte, date, categorie, batterie? }
      ancs: { label: 'Notification iPhone', run: async (p) => {
        const a = iphone();
        a.vu = Date.now();
        if (p.connecte !== undefined) a.bt = !!p.connecte;
        if (p.batterie !== undefined) {
          const b = Math.round(+p.batterie);
          // La pile monte = en charge, elle baisse = débranché
          if (a.batterie !== undefined && b !== a.batterie) a.enCharge = b > a.batterie;
          a.batterie = b;
        }
        const uid = String(p.uid);
        if (p.evt === 'retrait') {
          a.notifs = a.notifs.filter(n => n.id !== uid);
          if (a.appel && a.appel.uid === uid) a.appel = null;
        } else if (p.evt) {
          const appel = p.categorie === 'appel' || p.categorie === 1;
          if (appel) a.appel = { uid, de: p.titre || 'Inconnu', numero: p.sousTitre || '' };
          else {
            const n = { id: uid, app: APPS[p.appId] || 'autre', appId: p.appId, titre: p.titre || '', texte: p.texte || p.sousTitre || '',
                        heure: p.heure || new Date().toTimeString().slice(0, 5), nonLu: true };
            a.notifs = [n].concat(a.notifs.filter(x => x.id !== uid)).slice(0, 40);
          }
        }
        save();
        return 'OK';
      } },
      // Le pont vient chercher les commandes en attente
      commandes: { label: 'Commandes', run: async () => { pontVu = Date.now(); const c = commandes; commandes = []; return c; } },
      // Depuis l'écran : accepter / refuser l'appel
      appel: { label: 'Répondre à l\'appel', run: async ({ accepter }) => {
        const a = iphone();
        if (!a.appel) throw new Error('Pas d\'appel en cours');
        commandes.push({ uid: a.appel.uid, action: accepter ? 'positive' : 'negative' });
        a.appel = null; save();
        return accepter ? 'Accepté' : 'Refusé';
      } },
      // Pile des AirPods captée par la tablette
      airpods: { label: 'AirPods', run: async (p) => {
        const a = iphone();
        a.airpods = { nom: p.nom || 'AirPods', gauche: p.gauche, droite: p.droite, etui: p.etui,
                      chargeGauche: !!p.chargeGauche, chargeDroite: !!p.chargeDroite, chargeEtui: !!p.chargeEtui, vu: Date.now() };
        save();
        return 'OK';
      } },
      lu: { label: 'Marquer lu', run: async ({ id }) => {
        const a = iphone(); a.notifs.forEach(n => { if (n.id === String(id)) n.nonLu = false; }); save(); return 'OK';
      } },

      oublier: { label: 'Oublier', run: async ({ id }) => { delete liste[id]; save(); return 'Oublié'; } },
    },
    async status() {
      verifierSonnerie();
      return { appareils: vue(), adresse: adresse(),
               sonnerie: { configure: !!(po.user && po.token), active: !!po.receipt && Date.now() - (po.depuis || 0) < 600000, qui: po.qui || 'iphone' } };
    },
  };
};
