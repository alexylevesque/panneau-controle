// Maison > Wi-Fi : Internet en direct (latence, gigue, pertes, coupures), appareils branchés sur le réseau, partage du Wi-Fi (code QR).
// Les noms donnés aux appareils et le mot de passe du Wi-Fi restent sur la tablette (reseau.json, jamais dans le code).
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const dns = require('dns');
const https = require('https');

const FILE = path.join(__dirname, '..', '..', 'reseau.json');
const IMP_FILE = path.join(__dirname, '..', '..', 'imprimante.json');

module.exports = () => {
  let data = { noms: {}, vus: {}, ssid: '', mdp: '' };
  try { data = Object.assign(data, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
  const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (e) {} };

  // ---- Où on est sur le réseau ----
  function moi() {
    const ifs = os.networkInterfaces();
    for (const k of Object.keys(ifs)) for (const a of ifs[k]) {
      if (a.family === 'IPv4' && !a.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a.address)) return { ip: a.address, mac: a.mac };
    }
    for (const k of Object.keys(ifs)) for (const a of ifs[k]) if (a.family === 'IPv4' && !a.internal) return { ip: a.address, mac: a.mac };
    return null;
  }
  function routeur(ip) {
    try {
      const l = fs.readFileSync('/proc/net/route', 'utf8').split('\n').map(x => x.trim().split(/\s+/)).filter(x => x[1] === '00000000')[0];
      if (l) { const h = l[2]; return [6, 4, 2, 0].map(i => parseInt(h.substr(i, 2), 16)).join('.'); }
    } catch (e) {}
    return ip ? ip.replace(/\.\d+$/, '.1') : '';
  }

  // ---- Qui est branché : on "cogne" à chaque adresse, puis on lit la table ARP de la tablette ----
  function cogne(ip) {
    return new Promise(resolve => {
      let fini = 0, vivant = false;
      [80, 443, 62078].forEach(port => {
        const s = net.connect({ host: ip, port, timeout: 800 });
        const fin = ok => { if (ok) vivant = true; s.destroy(); if (++fini === 3) resolve(vivant); };
        s.on('connect', () => fin(true));
        s.on('error', e => fin(e.code === 'ECONNREFUSED'));
        s.on('timeout', () => fin(false));
      });
    });
  }
  function tableArp() {
    const t = {};
    try {
      fs.readFileSync('/proc/net/arp', 'utf8').split('\n').slice(1).forEach(l => {
        const c = l.trim().split(/\s+/);
        if (c.length >= 4 && c[2] === '0x2' && c[3] !== '00:00:00:00:00:00') t[c[0]] = c[3].toLowerCase();
      });
    } catch (e) {}
    return t;
  }
  function nomDns(ip, serveur) {
    return new Promise(resolve => {
      const r = new dns.Resolver(); try { r.setServers([serveur]); } catch (e) {}
      const t = setTimeout(() => { try { r.cancel(); } catch (e) {} resolve(''); }, 1500);
      r.reverse(ip, (err, noms) => { clearTimeout(t); resolve(!err && noms && noms[0] ? noms[0].replace(/\.(home|lan|local|localdomain)$/i, '') : ''); });
    });
  }

  let scan = { enCours: false, fini: 0, appareils: [] }, premierScan = !Object.keys(data.vus).length;
  async function scanner() {
    if (scan.enCours) return;
    const m = moi(); if (!m) return;
    scan.enCours = true;
    const base = m.ip.replace(/\.\d+$/, '.'), gw = routeur(m.ip), vivants = {};
    try {
      const ips = []; for (let i = 1; i < 255; i++) if (base + i !== m.ip) ips.push(base + i);
      for (let i = 0; i < ips.length; i += 32) {
        const lot = ips.slice(i, i + 32);
        (await Promise.all(lot.map(cogne))).forEach((ok, j) => { if (ok) vivants[lot[j]] = true; });
      }
      const arp = tableArp();
      Object.keys(arp).forEach(ip => { if (ip.indexOf(base) === 0) vivants[ip] = true; });
      let imp = ''; try { imp = JSON.parse(fs.readFileSync(IMP_FILE, 'utf8')).ip; } catch (e) {}
      const maintenant = Date.now(), liste = [];
      for (const ip of Object.keys(vivants)) {
        const mac = arp[ip] || '';
        const cle = mac || ip;
        const v = data.vus[cle] || (data.vus[cle] = { premier: premierScan ? 0 : maintenant });
        v.ip = ip; v.dernier = maintenant;
        const d = await nomDns(ip, gw);
        if (d) v.dns = d;
        liste.push({ cle, ip, mac, nom: data.noms[cle] || (ip === gw ? 'Routeur' : ip === imp ? 'Imprimante 3D' : v.dns || ''),
          nouveau: !!v.premier && maintenant - v.premier < 24 * 3600e3 && !data.noms[cle], role: ip === gw ? 'routeur' : ip === imp ? 'imprimante' : '' });
      }
      liste.push({ cle: m.mac, ip: m.ip, mac: m.mac, nom: 'Tablette (ce panneau)', role: 'tablette' });
      liste.sort((a, b) => +a.ip.split('.')[3] - +b.ip.split('.')[3]);
      scan.appareils = liste; scan.fini = maintenant; premierScan = false;
      save();
    } finally { scan.enCours = false; }
  }
  setTimeout(scanner, 5000);
  setInterval(scanner, 3 * 60000);

  // ---- Internet en direct : une mesure aux 2 s (latence Internet et routeur), gigue, pertes, coupures ----
  function tcpMs(host, port) {
    return new Promise(resolve => {
      const t = Date.now();
      const s = net.connect({ host, port, timeout: 2000 });
      s.on('connect', () => { s.destroy(); resolve(Date.now() - t); });
      s.on('error', e => resolve(e.code === 'ECONNREFUSED' ? Date.now() - t : null));
      s.on('timeout', () => { s.destroy(); resolve(null); });
    });
  }
  const hist = [];          // [{t, net, gw}]
  let horsLigneDepuis = 0;
  data.coupures = data.coupures || [];
  async function echantillon() {
    const m = moi(), gw = routeur(m && m.ip);
    const [a, b] = await Promise.all([tcpMs('1.1.1.1', 443), gw ? tcpMs(gw, 80) : Promise.resolve(null)]);
    hist.push({ t: Date.now(), net: a, gw: b });
    if (hist.length > 90) hist.shift();
    if (a === null) { if (!horsLigneDepuis) horsLigneDepuis = Date.now(); }
    else if (horsLigneDepuis) {
      if (Date.now() - horsLigneDepuis > 3000) { data.coupures.unshift({ debut: horsLigneDepuis, fin: Date.now() }); data.coupures = data.coupures.slice(0, 30); save(); }
      horsLigneDepuis = 0;
    }
  }
  setInterval(echantillon, 2000); echantillon();
  function resume() {
    const ok = hist.map(h => h.net).filter(x => x !== null), gw = hist.map(h => h.gw).filter(x => x !== null);
    let gigue = 0; for (let i = 1; i < ok.length; i++) gigue += Math.abs(ok[i] - ok[i - 1]);
    const moy = l => l.length ? Math.round(l.reduce((x, y) => x + y, 0) / l.length) : null;
    const jour = Date.now() - 24 * 3600e3;
    return {
      enLigne: hist.length ? hist[hist.length - 1].net !== null : true,
      latence: hist.length ? hist[hist.length - 1].net : null, latenceMoy: moy(ok), latenceRouteur: moy(gw.slice(-5)),
      gigue: ok.length > 1 ? Math.round(gigue / (ok.length - 1)) : null,
      pertes: hist.length ? Math.round(100 * (hist.length - ok.length) / hist.length) : 0,
      historique: hist.map(h => h.net),
      coupures24h: data.coupures.filter(c => c.fin > jour).length, derniereCoupure: data.coupures[0] || null, horsLigneDepuis,
    };
  }

  let ipPublique = '', fai = '', ipPubA = 0;
  function majIpPublique() {
    if (Date.now() - ipPubA < 10 * 60000) return;
    ipPubA = Date.now();
    https.get({ host: 'speed.cloudflare.com', path: '/meta', timeout: 6000 }, r => {
      let d = ''; r.on('data', c => (d += c));
      r.on('end', () => { try { const j = JSON.parse(d); ipPublique = j.clientIp || ''; fai = j.asOrganization || ''; } catch (e) {} });
    }).on('error', () => {}).on('timeout', function () { this.destroy(); });
  }

  return {
    name: 'Wi-Fi',
    icon: '📶',
    actions: {
      scanner: { label: 'Rechercher les appareils', run: async () => { await scanner(); return 'OK'; } },
      nommer: { label: 'Nommer un appareil', run: async ({ cle, nom }) => {
        cle = String(cle || ''); nom = String(nom || '').trim().slice(0, 40);
        if (!cle) throw new Error('Appareil inconnu');
        if (nom) data.noms[cle] = nom; else delete data.noms[cle];
        scan.appareils.forEach(a => { if (a.cle === cle && !a.role) { a.nom = nom || (data.vus[cle] && data.vus[cle].dns) || ''; a.nouveau = false; } });
        save(); return 'OK';
      } },
      partage: { label: 'Wi-Fi à partager', run: async ({ ssid, mdp }) => {
        data.ssid = String(ssid || '').trim(); data.mdp = String(mdp || '');
        if (!data.ssid) throw new Error('Entre le nom du Wi-Fi');
        save(); return 'OK';
      } },
    },
    async status() {
      majIpPublique();
      const m = moi();
      return Object.assign(resume(), {
        ipPublique, fai, tablette: m ? m.ip : '', routeur: routeur(m && m.ip),
        ssid: data.ssid, mdp: data.mdp,
        scan: { enCours: scan.enCours, fini: scan.fini }, appareils: scan.appareils,
      });
    },
  };
};
