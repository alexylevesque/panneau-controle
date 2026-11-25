// Appareils : les appareils (iPhone, Mac…) qui se signalent au panneau.
// Un appareil envoie POST /api/appareils/action/signal avec { id, nom, type, batterie, enCharge }.
// Sur iPhone, c'est un Raccourci (appli Raccourcis) qui le fait tout seul.
const fs = require('fs');
const path = require('path');
const https = require('https');
const qs = require('querystring');
const os = require('os');
const dgram = require('dgram');

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
  const MAC_VERSION = 13;   // à monter quand public/mac/installer.sh change : les Mac se mettent à jour tout seuls

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

  // Wake-on-LAN : le « paquet magique » envoyé à tout le réseau, quelques fois au cas où
  function reveiller(adr) {
    const mac = Buffer.from(adr.replace(/[^0-9a-f]/gi, ''), 'hex');
    const pkt = Buffer.alloc(102, 0xff); for (let i = 0; i < 16; i++) mac.copy(pkt, 6 + i * 6);
    const dest = ['255.255.255.255'];
    const ifs = os.networkInterfaces();
    Object.keys(ifs).forEach(k => ifs[k].forEach(x => {
      if (x.family !== 'IPv4' || x.internal || !x.netmask) return;
      const ip = x.address.split('.').map(Number), m = x.netmask.split('.').map(Number);
      dest.push(ip.map((o, i) => (o | (~m[i] & 255))).join('.'));
    }));
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket('udp4');
      s.once('error', reject);
      s.bind(() => {
        s.setBroadcast(true);
        let n = 0; const total = dest.length * 2 * 3;
        for (let r = 0; r < 3; r++) dest.forEach(d => [9, 7].forEach(port => setTimeout(() => s.send(pkt, port, d, () => { if (++n === total) { s.close(); resolve(); } }), r * 300)));
      });
    });
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
        if (a.endormi && now - a.endormi < 25000 && (a.vu || 0) - a.endormi < 6000) o.bluetooth = false;   // vient de s'endormir
        o.alim = a.dodo && now - a.dodo < 60000 ? 'dodo' : o.bluetooth ? 'allume' : a.reveil && now - a.reveil < 90000 ? 'reveil' : 'eteint';
        if (o.alim === 'allume' && a.reveil) delete a.reveil;
        delete o.dodo; delete o.reveil; delete o.endormi;
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
        const avant = JSON.stringify([a.nom, a.batterie, a.enCharge, a.adr]);
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
        if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(String(p.adr || ''))) a.adr = String(p.adr).toLowerCase();
        a.reveilReseau = p.womp === undefined ? undefined : String(p.womp) === '1';
        if (JSON.stringify([a.nom, a.batterie, a.enCharge, a.adr]) !== avant) save();
        if ((+p.v || 1) < MAC_VERSION) return 'MAJ';
        if (a.dodo && Date.now() - a.dodo < 60000) { delete a.dodo; a.endormi = Date.now(); return 'DORS'; }
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
      lu: { label: 'Marquer lu', run: async ({ id, qui }) => {
        const a = iphone(qui); a.notifs.forEach(n => { if (n.id === String(id)) n.nonLu = false; }); save(); return 'OK';
      } },

      // Interrupteur du Mac : « éteindre » = mise en veille (le Mac la reçoit à son prochain signal, aux 3 s),
      // « allumer » = Wake-on-LAN (un Mac éteint pour vrai ne peut pas être rallumé à distance, un Mac en veille oui)
      eteindre: { label: 'Mettre le Mac en veille', run: async ({ id }) => {
        const a = liste[id]; if (!a || !estMac(a)) throw new Error('Mac inconnu');
        if (Date.now() - (a.vu || 0) > 20000) throw new Error('Le Mac est déjà éteint ou en veille');
        a.dodo = Date.now(); delete a.reveil; return 'OK';
      } },
      allumer: { label: 'Réveiller le Mac', run: async ({ id }) => {
        const a = liste[id]; if (!a || !estMac(a)) throw new Error('Mac inconnu');
        if (!a.adr) throw new Error('Le panneau ne connaît pas encore l\'adresse réseau du Mac : allume-le une fois à la main');
        await reveiller(a.adr);
        a.reveil = Date.now(); delete a.dodo; return 'OK';
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
