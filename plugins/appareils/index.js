// Appareils : les appareils (iPhone, Mac…) qui se signalent au panneau.
// Un appareil envoie POST /api/appareils/action/signal avec { id, nom, type, batterie, enCharge }.
// Sur iPhone, c'est un Raccourci (appli Raccourcis) qui le fait tout seul.
const fs = require('fs');
const path = require('path');
const https = require('https');
const qs = require('querystring');
const os = require('os');

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

// Pochette de la chanson : l'iPhone ne l'envoie pas en Bluetooth. On la cherche sur internet
// (iTunes, sinon Deezer), puis on garde l'image sur la tablette : la prochaine fois, pas besoin d'internet.
const POCH_DIR = path.join(__dirname, '..', '..', 'public', 'pochettes');
const POCH_FILE = path.join(__dirname, '..', '..', 'pochettes.json');
let pochettes = {};   // « artiste|titre » → '/pochettes/xxx.jpg', ou { rien: date } si introuvable
try { pochettes = JSON.parse(fs.readFileSync(POCH_FILE, 'utf8')); } catch (e) {}
const pochEnCours = {};
function lireJson(host, chemin, cb) {
  https.get({ host, path: chemin, timeout: 8000 }, res => {
    let out = ''; res.on('data', c => (out += c));
    res.on('end', () => { let j = null; try { j = JSON.parse(out); } catch (e) {} cb(j); });
  }).on('error', () => cb(null)).on('timeout', function () { this.destroy(); });
}
function telecharger(url, fichier, cb, essais) {
  https.get(url, { timeout: 10000 }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && !(essais > 2)) {
      res.resume(); return telecharger(res.headers.location, fichier, cb, (essais || 0) + 1);
    }
    if (res.statusCode !== 200) { res.resume(); return cb(false); }
    const morceaux = []; res.on('data', c => morceaux.push(c));
    res.on('end', () => { try { fs.mkdirSync(POCH_DIR, { recursive: true }); fs.writeFileSync(fichier, Buffer.concat(morceaux)); cb(true); } catch (e) { cb(false); } });
  }).on('error', () => cb(false)).on('timeout', function () { this.destroy(); });
}
function chercherPochette(artiste, titre) {
  if (!titre) return '';
  const cle = (artiste || '').toLowerCase() + '|' + titre.toLowerCase();
  const v = pochettes[cle];
  if (typeof v === 'string') return v;
  if (v && Date.now() - v.rien < 24 * 3600 * 1000) return '';   // introuvable : on réessaie demain
  if (pochEnCours[cle]) return '';
  pochEnCours[cle] = true;
  const terme = encodeURIComponent((artiste ? artiste + ' ' : '') + titre);
  const fini = (url) => {
    const garder = (ok, chemin) => {
      delete pochEnCours[cle];
      pochettes[cle] = ok ? chemin : { rien: Date.now() };
      try { fs.writeFileSync(POCH_FILE, JSON.stringify(pochettes)); } catch (e) {}
    };
    if (!url) return garder(false);
    const nom = require('crypto').createHash('md5').update(cle).digest('hex').slice(0, 16) + '.jpg';
    telecharger(url, path.join(POCH_DIR, nom), ok => garder(ok, '/pochettes/' + nom));
  };
  lireJson('itunes.apple.com', '/search?country=ca&media=music&entity=song&limit=1&term=' + terme, j => {
    const r = j && j.results && j.results[0];
    if (r && r.artworkUrl100) return fini(String(r.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x600bb.'));
    lireJson('api.deezer.com', '/search?limit=1&q=' + terme, k => {
      const d = k && k.data && k.data[0];
      fini(d && d.album ? d.album.cover_xl || d.album.cover_big || '' : '');
    });
  });
  return '';
}

module.exports = (cfg) => {
  const FILE = path.join(__dirname, '..', '..', 'appareils.json');
  const EN_LIGNE_MS = (cfg.minutesEnLigne || 20) * 60 * 1000;
  let liste = {};
  try { liste = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  // Les noms que le pont a déjà en tête mais qui ont été fusionnés dans un autre appareil (ex. iphone-4456 → iphone16)
  const ALIAS_FILE = path.join(__dirname, '..', '..', 'alias.json');
  let ALIAS = {};
  try { ALIAS = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8')); } catch (e) {}
  if (liste.iphone2 && liste.iphone16) { delete liste.iphone2; ALIAS.iphone2 = 'iphone16'; }
  const saveAlias = () => { try { fs.writeFileSync(ALIAS_FILE, JSON.stringify(ALIAS)); } catch (e) {} };
  saveAlias();
  // Un appareil créé par le pont faute de mieux (« iphone-xxxx », sans raccourci)
  // (le raccourci donne toujours un vrai nom, ex. « iPhone 16 » ; le pont, lui, crée juste « iPhone »)
  const parPont = k => !!liste[k] && !liste[k].raccourci && (liste[k].nom || 'iPhone') === 'iPhone';
  // Les appareils du panneau (avec raccourci) qui peuvent recevoir un iPhone Bluetooth inconnu :
  // pas déjà relié en ce moment, sans Bluetooth d'abord, puis le plus récemment vu
  function candidats(exclure) {
    return Object.keys(liste).filter(k => !parPont(k) && (liste[k].type || 'iphone') === 'iphone' && exclure.indexOf(k) < 0)
      .sort((a, b) => (!!liste[a].btAdresse - !!liste[b].btAdresse) || ((liste[b].vu || 0) - (liste[a].vu || 0)));
  }
  const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(liste, null, 2)); } catch (e) {} };

  const estMac = a => a && (a.type === 'mac' || a.type === 'macmini');   // MacBook, Mac mini…
  const MAC_VERSION = 18;   // à monter quand public/mac/installer.sh change : les Mac se mettent à jour tout seuls

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
  // Arrête TOUTES les sonneries du panneau encore actives (sur tous les iPhone)
  function toutArreter() {
    return pushover('/1/receipts/cancel_by_tag/panneau.json', { token: po.token }).catch(() => {});
  }
  async function sonner(qui) {
    // Chaque iPhone = un appareil dans le même compte Pushover, nommé comme son id (ex. iphone, iphone2)
    qui = String(qui || 'iphone').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 25) || 'iphone';
    // Un Mac sonne lui-même : son petit programme demande au panneau aux 3 s s'il doit sonner
    if (liste[qui] && estMac(liste[qui])) {
      if (po.token) await toutArreter();
      po.receipt = 'mac'; po.depuis = Date.now(); po.qui = qui;
      fs.writeFileSync(PO_FILE, JSON.stringify(po));
      return;
    }
    if (!po.user || !po.token) throw new Error('Configure Pushover d\'abord');
    const msg = { token: po.token, user: po.user, title: 'Panneau', message: '📍 Ton iPhone est ici!',
      priority: 2, retry: 30, expire: 600, sound: 'updown', device: qui, tags: 'panneau' };   // seulement ce cell, pas le Mac
    // Une sonnerie d'avant (même sur l'autre iPhone) continuerait aux 30 s : on l'arrête d'abord
    await toutArreter();
    const r = await pushover('/1/messages.json', msg);
    po.receipt = r.receipt; po.depuis = Date.now(); po.qui = qui;
    fs.writeFileSync(PO_FILE, JSON.stringify(po));
  }

  // L'as-tu arrêtée sur l'iPhone ? On demande à Pushover (au plus aux 5 s)
  let verifie = 0;
  function verifierSonnerie() {
    if (po.receipt === 'mac' && Date.now() - po.depuis > 120000) { delete po.receipt; fs.writeFileSync(PO_FILE, JSON.stringify(po)); }
    if (!po.receipt || po.receipt === 'mac' || Date.now() - verifie < 5000) return;
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
  // Le pont dit de quel iPhone il parle avec « qui » (l'id du panneau). Sans « qui » : ton iPhone.
  function iphone(qui) {
    qui = String(qui || 'iphone');
    if (ALIAS[qui]) qui = ALIAS[qui];
    const a = liste[qui] || (liste[qui] = { nom: 'iPhone', type: 'iphone' });
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
      o.bluetooth = estMac(a) ? now - (a.vu || 0) < 20000 : !!(a.bt && now - pontVu < 15000);
      if (estMac(a)) {   // état de l'interrupteur du Mac
        if (a.ferme && now - a.ferme < 30000 && (a.vu || 0) - a.ferme < 8000) o.bluetooth = false;   // vient de s'éteindre
        o.alim = (a.arret && now - a.arret < 60000) || (a.ferme && now - a.ferme < 30000 && o.bluetooth) ? 'arret' : o.bluetooth ? 'allume' : 'eteint';
        o.erreurArret = a.erreurArret && now - a.erreurArret.t < 120000 ? a.erreurArret.msg : '';
        delete o.arret; delete o.ferme;
      }
      delete o.masques;
      // Coupé depuis plus de 5 min : caché de la liste (on le garde en mémoire, il revient dès qu'il se reconnecte)
      o.cache = !o.bluetooth && now - (a.vu || 0) > 5 * 60 * 1000;
      if (o.musique) {
        o.musique = Object.assign({}, o.musique, { image: chercherPochette(o.musique.artiste, o.musique.titre) });
        o.musique.ecoule = (o.musique.ecoule || 0) + (o.musique.etat === 1 && o.musique.t ? (now - o.musique.t) / 1000 * (o.musique.vitesse || 1) : 0);
        if (o.musique.duree) o.musique.ecoule = Math.min(o.musique.ecoule, o.musique.duree);
        delete o.musique.t;
      }
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
        a.raccourci = true;
        liste[id] = a;
        save();
        return 'OK';
      } },
      // Le Mac (petit programme installé avec mac/installer.sh) : pile aux 3 s, et « dois-je sonner ? »
      mac: { label: 'Mac', run: async (p) => {
        const id = String(p.id || 'mac').toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'mac';
        const a = liste[id] || (liste[id] = { type: 'mac' });
        const typeMac = p.type === 'macmini' ? 'macmini' : 'mac';
        const avant = JSON.stringify([a.nom, a.batterie, a.enCharge]);
        a.type = typeMac; a.raccourci = true;
        if (p.nom) a.nom = String(p.nom).slice(0, 40);
        if (!a.nom) a.nom = 'Mac';
        const b = parseInt(p.batterie, 10);
        if (!isNaN(b)) a.batterie = b; else delete a.batterie;
        a.enCharge = !!p.enCharge;
        a.vu = Date.now();
        const n = k => (isFinite(+p[k]) ? Math.round(+p[k]) : undefined);
        a.stats = { cpu: n('cpu'), ram: n('ram'), disque: n('disque'), libreGo: n('libreGo'), allume: n('allume'), memGo: n('memGo'),
                    ventilos: n('ventilos'), ventilo: n('ventilo'), ventiloMax: n('ventiloMax'), temp: n('temp') };
        if (p.erreurArret) a.erreurArret = { t: Date.now(), msg: String(p.erreurArret).slice(0, 150) };
        if (JSON.stringify([a.nom, a.batterie, a.enCharge]) !== avant) save();
        if ((+p.v || 1) < MAC_VERSION) return 'MAJ';
        if (a.arret && Date.now() - a.arret < 60000) { delete a.arret; a.ferme = Date.now(); return 'ETEINS'; }
        verifierSonnerie();
        return po.receipt === 'mac' && po.qui === id ? 'SONNE' : 'OK';
      } },
      // Faire sonner
      pushover: { label: 'Configurer Pushover', run: async ({ user, token }) => {
        po = { user: String(user || '').trim(), token: String(token || '').trim() };
        await sonner();                     // test : ça sonne tout de suite
        return 'Configuré';
      } },
      sonner: { label: 'Faire sonner', run: async ({ id }) => { await sonner(id); return 'Ça sonne'; } },
      arreter: { label: 'Arrêter la sonnerie', run: async () => {
        if (po.receipt && po.receipt !== 'mac') await pushover(`/1/receipts/${po.receipt}/cancel.json`, { token: po.token }).catch(() => {});
        if (po.token) await toutArreter();
        delete po.receipt; fs.writeFileSync(PO_FILE, JSON.stringify(po));
        return 'Arrêté';
      } },

      // Reçu du pont Bluetooth : { evt: 'ajout'|'modif'|'retrait', uid, appId, titre, sousTitre, texte, date, categorie, batterie? }
      ancs: { label: 'Notification iPhone', run: async (p) => {
        const a = iphone(p.qui);
        a.vu = Date.now();
        // Si on reçoit quelque chose de cet iPhone, c'est qu'il est relié
        a.bt = p.connecte !== undefined ? !!p.connecte : true;
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
        } else if (p.evt && (a.masques || []).indexOf(uid) >= 0) {
          // notif effacée sur le panneau : l'iPhone la renvoie parfois (à la reconnexion), on l'ignore
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
      // Le pont présente un iPhone Bluetooth : à quel appareil du panneau il correspond ?
      // Ton premier iPhone = « iphone ». Un nouveau = le dernier iPhone vu par son raccourci qui n'a pas encore de Bluetooth.
      lier: { label: 'Lier un iPhone', run: async ({ adresse, ancien }) => {
        adresse = String(adresse || '').toUpperCase();
        if (!adresse) throw new Error('adresse manquante');
        for (const id of Object.keys(liste)) if (liste[id].btAdresse === adresse) return id;
        // Adresse inconnue (l'iPhone peut changer d'adresse Bluetooth) : on la donne à un appareil
        // du panneau qui n'est pas relié en ce moment. Les iPhone reliés sont dans « bt ».
        const relies = Object.keys(liste).filter(k => liste[k].bt && Date.now() - pontVu < 15000);
        let id = ancien && !relies.includes('iphone') && liste.iphone && !liste.iphone.btAdresse ? 'iphone' : candidats(relies)[0];
        if (!id) id = 'iphone-' + adresse.replace(/:/g, '').slice(-4).toLowerCase();
        iphone(id).btAdresse = adresse; save();
        return id;
      } },
      // Le pont vient chercher les commandes en attente
      // « prets » = les iPhone vraiment reliés en ce moment (envoyé chaque seconde par le pont 2.1+)
      commandes: { label: 'Commandes', run: async ({ prets } = {}) => {
        pontVu = Date.now();
        if (Array.isArray(prets)) prets = prets.map(q => ALIAS[q] || String(q));
        // Un iPhone relié sous un nom « iphone-xxxx » : on le fusionne dans le bon appareil (celui pas relié)
        if (Array.isArray(prets)) prets = prets.map(q => {
          if (!parPont(q) || !liste[q]) return q;
          const t = candidats(prets)[0];
          if (!t) return q;
          const x = liste[q], a = liste[t];
          a.btAdresse = x.btAdresse; a.bt = true;
          if (x.batterie !== undefined) a.batterie = x.batterie;
          if (x.enCharge !== undefined) a.enCharge = x.enCharge;
          a.notifs = (x.notifs || []).concat(a.notifs || []).slice(0, 40);
          if (x.appel) a.appel = x.appel;
          delete liste[q]; ALIAS[q] = t; saveAlias(); save();
          return t;
        });
        if (Array.isArray(prets)) Object.keys(liste).forEach(k => {
          const on = prets.indexOf(k) >= 0;
          if (on) liste[k].vu = Date.now();
          if (liste[k].bt !== on && (on || liste[k].btAdresse)) { liste[k].bt = on; save(); }
        });
        const c = commandes; commandes = []; return c;
      } },
      // Depuis l'écran : accepter / refuser l'appel
      appel: { label: 'Répondre à l\'appel', run: async ({ accepter, id }) => {
        const a = iphone(id);
        if (!a.appel) throw new Error('Pas d\'appel en cours');
        let q = String(id || 'iphone');
        const vieux = Object.keys(ALIAS).filter(k => ALIAS[k] === q);   // le pont connaît peut-être encore l'ancien nom
        vieux.concat([q]).forEach(qq => commandes.push({ qui: qq, uid: a.appel.uid, action: accepter ? 'positive' : 'negative' }));
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
      // Effacer une notif du panneau (id) ou toutes (tout: true). Elle reste sur l'iPhone.
      effacer: { label: 'Effacer une notification', run: async ({ id, qui, tout }) => {
        const a = iphone(qui);
        const ids = tout ? a.notifs.map(n => n.id) : [String(id)];
        a.masques = (a.masques || []).concat(ids).slice(-300);
        a.notifs = a.notifs.filter(n => ids.indexOf(n.id) < 0);
        save(); return 'OK';
      } },
      // Musique qui joue sur l'iPhone (reçue du pont, service média d'Apple)
      musique: { label: 'Musique iPhone', run: async (p) => {
        const a = iphone(p.qui);
        const m = a.musique || {};
        ['joueur', 'etat', 'vitesse', 'ecoule', 'volume', 'artiste', 'album', 'titre', 'duree', 'repete', 'aleatoire'].forEach(k => {
          if (p[k] !== undefined) m[k] = p[k];
        });
        if (p.ecoule !== undefined || p.etat !== undefined) m.t = Date.now();   // moment où « ecoule » était vrai
        m.vu = Date.now();
        a.musique = m;
        return 'OK';
      } },
      // Depuis l'écran : lecture, pause, suivant… (le pont l'envoie à l'iPhone)
      media: { label: 'Commande musique', run: async ({ id, cmd, n }) => {
        const CODES = { lecture: 0, pause: 1, basculer: 2, suivant: 3, precedent: 4, volPlus: 5, volMoins: 6, avance: 9, recule: 10 };
        if (CODES[cmd] === undefined) throw new Error('Commande inconnue');
        const q = String(id || 'iphone');
        const a = iphone(q);
        if (a.musique && (cmd === 'basculer' || cmd === 'lecture' || cmd === 'pause')) {   // réaction immédiate à l'écran
          const m = a.musique, joue = cmd === 'lecture' || (cmd === 'basculer' && m.etat !== 1);
          if (m.etat === 1 && m.t) m.ecoule = (m.ecoule || 0) + (Date.now() - m.t) / 1000 * (m.vitesse || 1);
          m.etat = joue ? 1 : 0; m.t = Date.now();
        }
        const vieux = Object.keys(ALIAS).filter(k => ALIAS[k] === q);
        // n = combien de fois (le slider du volume envoie plusieurs crans d'un coup ; l'iPhone a 16 crans)
        const fois = Math.max(1, Math.min(16, Math.round(+n || 1)));
        if (a.musique && (cmd === 'volPlus' || cmd === 'volMoins'))
          a.musique.volume = Math.max(0, Math.min(1, (a.musique.volume || 0) + (cmd === 'volPlus' ? fois : -fois) / 16));
        for (let i = 0; i < fois; i++) vieux.concat([q]).forEach(qq => commandes.push({ qui: qq, musique: CODES[cmd] }));
        return 'OK';
      } },
      lu: { label: 'Marquer lu', run: async ({ id, qui }) => {
        const a = iphone(qui); a.notifs.forEach(n => { if (n.id === String(id)) n.nonLu = false; }); save(); return 'OK';
      } },

      // Interrupteur du Mac : l'éteint pour vrai (le Mac reçoit l'ordre à son prochain signal, aux 3 s).
      // Un Mac éteint ne peut pas être rallumé à distance : on le rallume avec son bouton.
      eteindre: { label: 'Éteindre le Mac', run: async ({ id }) => {
        const a = liste[id]; if (!a || !estMac(a)) throw new Error('Mac inconnu');
        if (Date.now() - (a.vu || 0) > 20000) throw new Error('Le Mac est déjà éteint');
        a.arret = Date.now(); delete a.erreurArret; return 'OK';
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
