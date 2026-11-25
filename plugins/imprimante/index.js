// Imprimante 3D Bambu Lab : le panneau lui parle directement sur le Wi-Fi (MQTT sécurisé, port 8883).
// Rien à installer : petit client MQTT maison. Les réglages (IP, n° de série, code d'accès)
// sont entrés sur la tablette et gardés dans imprimante.json (jamais dans le code).
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const https = require('https');
const qs = require('querystring');

const FILE = path.join(__dirname, '..', '..', 'imprimante.json');
const PO_FILE = path.join(__dirname, '..', '..', 'pushover.json');

module.exports = () => {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}

  let sock = null, buf = Buffer.alloc(0), connecte = false, erreur = '', etat = {}, vuA = 0;
  let ping = null, pushall = null, relance = null, seq = 1;
  const attente = [];   // réponses attendues aux commandes (pause, arrêt…)

  // ---- Petit client MQTT 3.1.1 ----
  function longueur(n) {
    const o = [];
    do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; o.push(b); } while (n > 0);
    return Buffer.from(o);
  }
  function chaine(s) { const b = Buffer.from(s, 'utf8'); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); }
  function paquet(type, corps) { return Buffer.concat([Buffer.from([type]), longueur(corps.length), corps]); }
  function envoyer(objet) {
    if (!sock || !connecte) throw new Error('Imprimante pas connectée');
    sock.write(paquet(0x30, Buffer.concat([chaine('device/' + cfg.serie + '/request'), Buffer.from(JSON.stringify(objet))])));
  }

  function fusion(a, b) {   // l'imprimante n'envoie souvent que ce qui a changé
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) fusion(a[k], b[k]);
      else a[k] = b[k];
    }
  }

  function message(texte) {
    let j; try { j = JSON.parse(texte); } catch (e) { return; }
    vuA = Date.now();
    const p = j.print;
    if (!p) return;
    if (p.command && p.command !== 'push_status' && p.result) {
      for (let i = attente.length - 1; i >= 0; i--) if (attente[i].cmd === p.command) { attente[i].fin(p); attente.splice(i, 1); }
    }
    if (p.command !== 'push_status') return;
    const avant = etat.gcode_state;
    fusion(etat, p);
    alerte(avant, etat.gcode_state);
  }

  function lire(d) {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) return;
      let mult = 1, lg = 0, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; lg += (b & 127) * mult; mult *= 128; } while (b & 128);
      if (buf.length < i + lg) return;
      const tete = buf[0], type = tete >> 4, corps = buf.slice(i, i + lg);
      buf = buf.slice(i + lg);
      if (type === 2) {             // CONNACK
        if (corps[1] === 0) {
          connecte = true; erreur = ''; sock.setTimeout(0);
          sock.write(paquet(0x82, Buffer.concat([Buffer.from([0, 1]), chaine('device/' + cfg.serie + '/report'), Buffer.from([0])])));
          demanderTout();
        } else {
          erreur = corps[1] === 4 || corps[1] === 5 ? 'Code d\'accès ou numéro de série refusé' : 'Connexion refusée (' + corps[1] + ')';
          sock.destroy();
        }
      } else if (type === 3) {      // PUBLISH
        const tl = corps.readUInt16BE(0);
        const qos = (tete >> 1) & 3;
        message(corps.slice(2 + tl + (qos ? 2 : 0)).toString('utf8'));
      }
    }
  }

  function demanderTout() {
    try { envoyer({ pushing: { sequence_id: String(seq++), command: 'pushall', version: 1, push_target: 1 } }); } catch (e) {}
  }

  function arreterConnexion() {
    clearInterval(ping); clearInterval(pushall); clearTimeout(relance);
    if (sock) { sock.removeAllListeners(); sock.on('error', () => {}); sock.destroy(); }
    sock = null; connecte = false; buf = Buffer.alloc(0);
  }

  function connecter() {
    arreterConnexion();
    if (!cfg.ip || !cfg.serie || !cfg.code) return;
    const s = sock = tls.connect({ host: cfg.ip, port: 8883, rejectUnauthorized: false, timeout: 10000 }, () => {
      const corps = Buffer.concat([chaine('MQTT'), Buffer.from([4, 0xC2, 0, 60]),
        chaine('panneau-' + Math.random().toString(16).slice(2, 8)), chaine('bblp'), chaine(cfg.code)]);
      s.write(paquet(0x10, corps));
    });
    s.on('data', lire);
    s.on('timeout', () => { erreur = erreur || 'L\'imprimante ne répond pas (allumée ? bonne IP ?)'; s.destroy(); });
    s.on('error', e => { erreur = /ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH/.test(e.code || '') ? 'L\'imprimante ne répond pas (allumée ? bonne IP ?)' : e.message; });
    s.on('close', () => {
      if (sock !== s) return;
      connecte = false; clearInterval(ping); clearInterval(pushall);
      relance = setTimeout(connecter, 10000);
    });
    ping = setInterval(() => { if (connecte) s.write(Buffer.from([0xC0, 0])); }, 30000);
    pushall = setInterval(demanderTout, 5 * 60000);   // l'état complet de temps en temps
  }

  // ---- Caméra (P1S, P1P, A1) : flux d'images JPEG sur le port 6000, ouvert seulement quand on la regarde ----
  let camSock = null, camBuf = Buffer.alloc(0), image = null, imageA = 0, demandeA = 0, camErreur = '';
  function camera() {
    if (camSock || !cfg.ip || !cfg.code) return;
    const s = camSock = tls.connect({ host: cfg.ip, port: 6000, rejectUnauthorized: false, timeout: 10000 }, () => {
      const auth = Buffer.alloc(80);
      auth.writeUInt32LE(0x40, 0); auth.writeUInt32LE(0x3000, 4);
      auth.write('bblp', 16, 32, 'ascii'); auth.write(cfg.code, 48, 32, 'ascii');
      s.write(auth);
    });
    s.on('data', d => {
      camErreur = '';
      camBuf = Buffer.concat([camBuf, d]);
      while (camBuf.length >= 16) {
        const taille = camBuf.readUInt32LE(0);
        if (taille > 5e6) { camBuf = Buffer.alloc(0); break; }
        if (camBuf.length < 16 + taille) break;
        const img = camBuf.slice(16, 16 + taille);
        camBuf = camBuf.slice(16 + taille);
        if (img[0] === 0xFF && img[1] === 0xD8) { image = img; imageA = Date.now(); }
      }
      if (Date.now() - demandeA > 20000) s.destroy();   // plus personne ne regarde
    });
    s.on('timeout', () => { camErreur = 'La caméra ne répond pas'; s.destroy(); });
    s.on('error', e => { camErreur = 'Caméra : ' + (e.code || e.message); });
    s.on('close', () => { if (camSock === s) { camSock = null; camBuf = Buffer.alloc(0); } });
  }

  // ---- Alerte sur l'iPhone quand l'impression finit ou bloque (Pushover, si configuré) ----
  function alerte(avant, apres) {
    if (!avant || avant === apres) return;
    const nom = etat.subtask_name || 'ton impression';
    let texte = '';
    if (apres === 'FINISH' && (avant === 'RUNNING' || avant === 'PAUSE')) texte = '✅ Impression terminée : ' + nom;
    else if (apres === 'FAILED') texte = '❌ Impression arrêtée : ' + nom;
    else if (apres === 'PAUSE' && avant === 'RUNNING' && etat.print_error) texte = '⏸️ L\'imprimante s\'est mise en pause (' + nom + ')';
    if (!texte) return;
    let po = {}; try { po = JSON.parse(fs.readFileSync(PO_FILE, 'utf8')); } catch (e) {}
    if (!po.user || !po.token) return;
    const body = qs.stringify({ token: po.token, user: po.user, title: 'Imprimante 3D', message: texte });
    const req = https.request({ host: 'api.pushover.net', path: '/1/messages.json', method: 'POST', timeout: 10000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, r => r.resume());
    req.on('error', () => {}); req.on('timeout', () => req.destroy());
    req.end(body);
  }

  // Envoie une commande et attend la réponse de l'imprimante (3 s au plus)
  function commande(objet, nomCmd) {
    return new Promise((resolve, reject) => {
      envoyer(objet);
      const t = setTimeout(() => { for (let i = 0; i < attente.length; i++) if (attente[i].cmd === nomCmd) attente.splice(i, 1); resolve('Envoyé'); }, 3000);
      attente.push({ cmd: nomCmd, fin: p => {
        clearTimeout(t);
        if (p.result === 'success' || p.result === 'SUCCESS') resolve('OK');
        else reject(new Error(/auth|verify|permission/i.test(String(p.reason || p.result))
          ? 'L\'imprimante refuse : active le Mode développeur sur son écran' : 'L\'imprimante refuse (' + (p.reason || p.result) + ')'));
      } });
    });
  }
  const action = cmd => commande({ print: { sequence_id: String(seq++), command: cmd, param: '' } }, cmd);

  connecter();

  const pc = v => v === undefined || v === '' ? undefined : Math.round(100 * (+v) / 15);   // l'imprimante donne 0 à 15
  const h4 = n => ('0000' + (n >>> 0).toString(16).toUpperCase()).slice(-4);
  const code32 = n => h4(n >>> 16) + '_' + h4(n & 0xFFFF);   // ex. 0700_8011, comme sur l'écran et le wiki Bambu
  function couleur(c) { return c && /^[0-9A-Fa-f]{6}/.test(c) ? '#' + c.slice(0, 6) : ''; }

  return {
    name: 'Imprimante',
    icon: '🖨️',
    actions: {
      configurer: { label: 'Configurer l\'imprimante', run: async ({ ip, serie, code }) => {
        ip = String(ip || '').trim(); serie = String(serie || '').trim().toUpperCase(); code = String(code || '').trim();
        if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) throw new Error('Adresse IP invalide (ex. 192.168.2.50)');
        if (!serie) throw new Error('Entre le numéro de série');
        if (!code) throw new Error('Entre le code d\'accès');
        cfg = { ip, serie, code }; etat = {}; erreur = ''; image = null;
        if (camSock) camSock.destroy();
        fs.writeFileSync(FILE, JSON.stringify(cfg));
        connecter();
        return 'Enregistré';
      } },
      camera: { label: 'Caméra', run: async () => {
        demandeA = Date.now(); camera();
        if (!image || Date.now() - imageA > 30000) return { erreur: camErreur || 'Ouverture de la caméra…' };
        return { image: 'data:image/jpeg;base64,' + image.toString('base64') };
      } },
      pause: { label: 'Pause', run: () => action('pause') },
      reprendre: { label: 'Reprendre', run: () => action('resume') },
      arreter: { label: 'Arrêter', run: () => action('stop') },
      vitesse: { label: 'Vitesse', run: ({ niveau }) => {
        const n = Math.max(1, Math.min(4, parseInt(niveau, 10) || 2));
        return commande({ print: { sequence_id: String(seq++), command: 'print_speed', param: String(n) } }, 'print_speed');
      } },
      lumiere: { label: 'Lumière', run: ({ on }) => commande({ system: { sequence_id: String(seq++), command: 'ledctrl', led_node: 'chamber_light',
        led_mode: on ? 'on' : 'off', led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0 } }, 'ledctrl') },
    },
    async status() {
      if (!cfg.ip) return { configure: false };
      const e = etat, lum = (e.lights_report || []).filter(l => l.node === 'chamber_light')[0];
      const ams = [];
      ((e.ams && e.ams.ams) || []).forEach((u, n) => (u.tray || []).forEach(t => {
        ams.push({ fente: 'ABCD'.charAt(n) + (+t.id + 1), type: t.tray_type || '', couleur: couleur(t.tray_color), reste: t.remain >= 0 ? t.remain : undefined, actif: e.ams.tray_now === String(n * 4 + +t.id) });
      }));
      // La bobine externe (Ext) : l'imprimante garde un type par défaut même vide, alors on la montre seulement quand elle sert
      if (e.vt_tray && e.vt_tray.tray_type && e.ams && e.ams.tray_now === '254') ams.push({ fente: 'Ext', type: e.vt_tray.tray_type, couleur: couleur(e.vt_tray.tray_color), actif: e.ams && e.ams.tray_now === '254' });
      return {
        configure: true, ip: cfg.ip, connecte: connecte && Date.now() - vuA < 120000, erreur: connecte ? '' : erreur,
        etat: e.gcode_state || '', fichier: e.subtask_name || '', pourcent: e.mc_percent, restant: e.mc_remaining_time,
        couche: e.layer_num, couches: e.total_layer_num,
        buse: e.nozzle_temper, buseCible: e.nozzle_target_temper, plateau: e.bed_temper, plateauCible: e.bed_target_temper,
        humidite: ((e.ams && e.ams.ams) || []).map(u => ({ pct: u.humidity_raw !== undefined && u.humidity_raw !== '' ? +u.humidity_raw : undefined,
          niveau: u.humidity !== undefined ? +u.humidity : undefined, temp: u.temp !== undefined && +u.temp > 0 ? +u.temp : undefined })),
        vitesse: e.spd_lvl, etape: e.stg_cur, wifi: e.wifi_signal, buseDiametre: e.nozzle_diameter,
        ventilos: { piece: pc(e.cooling_fan_speed), aux: pc(e.big_fan1_speed), caisson: pc(e.big_fan2_speed) },
        hms: (e.hms || []).map(h => code32(h.attr) + '_' + code32(h.code)),
        erreurTexte: e.print_error ? code32(e.print_error) : '',
        caisson: e.chamber_temper, lumiere: lum ? lum.mode === 'on' : undefined, ams, erreurCode: e.print_error || 0,
      };
    },
  };
};
