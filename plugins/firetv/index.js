// Fire TV — deux modes :
//  "app" (défaut) : même API que l'app officielle « Amazon Fire TV » sur téléphone.
//                   Pas besoin du mode développeur. Jumelage une fois avec un code PIN affiché sur la télé.
//  "adb"          : via ADB (anciennes Fire TV avec mode développeur). Voir adb.js.
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

module.exports = (cfg) => {
  if (cfg.mode === 'adb') return require('./adb.js')(cfg);

  const TOKEN_FILE = path.join(__dirname, '..', '..', 'firetv-token.json');
  let token = '';
  try { token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).token || ''; } catch {}

  // La Fire TV utilise un certificat auto-signé : on l'accepte, seulement pour elle.
  const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

  const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });

  function call(pathname, body, method) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const req = https.request({
        host: cfg.ip, port: 8080, path: '/v1/' + pathname, method: method || 'POST', agent, timeout: 8000,
        headers: {
          'x-amzn-request-id': uuid(),
          'X-Api-Key': '0987654321',
          'X-Client-Token': token,
          'User-Agent': 'okhttp/4.10.0',
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(data),
        },
      }, res => {
        let out = '';
        res.on('data', c => (out += c));
        res.on('end', () => {
          if (res.statusCode === 401 || res.statusCode === 403) return reject(new Error('Pas jumelé : appuie sur « Jumeler »'));
          if (res.statusCode >= 400) return reject(new Error(`Fire TV a répondu ${res.statusCode}`));
          try { resolve(out ? JSON.parse(out) : null); } catch { resolve(out); }
        });
      });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end(data);
    });
  }

  // Réveille le service de télécommande de la Fire TV (DIAL, port 8009)
  function wakeService() {
    return new Promise(resolve => {
      const req = http.request({ host: cfg.ip, port: 8009, path: '/apps/FireTVRemote', method: 'POST', timeout: 3000 }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', () => resolve()); req.on('timeout', () => { req.destroy(); resolve(); });
      req.end();
    });
  }

  async function send(pathname, body, method) {
    try { return await call(pathname, body, method); }
    catch (e) {
      if (!/ECONNREFUSED|ECONNRESET|timeout|EHOSTUNREACH/.test(e.message)) throw e;
      await wakeService();
      await new Promise(r => setTimeout(r, 1500));
      try { return await call(pathname, body, method); }
      catch (e2) { throw new Error(`Fire TV injoignable (${cfg.ip}) : ${e2.message}`); }
    }
  }

  const key = k => () => send(`FireTV?action=${k}`).then(() => null);
  // Comme l'appli officielle : on « enfonce » la touche puis on la relâche (corps plat keyActionType)
  const hold = k => async () => {
    await send(`FireTV?action=${k}`, { keyActionType: 'keyDown' });
    await new Promise(r => setTimeout(r, 150));
    await send(`FireTV?action=${k}`, { keyActionType: 'keyUp' }).catch(() => {});
    return null;
  };

  // Liste des applis installées, lue directement sur la Fire TV (vrais identifiants + vrais logos)
  let appsCache = null, appsTime = 0;
  async function installedApps() {
    if (appsCache && Date.now() - appsTime < 10 * 60 * 1000) return appsCache;
    let list;
    try { list = await send('FireTV/appsV2', null, 'GET'); }
    catch (e) { list = await send('FireTV/apps', null, 'GET'); }
    if (!Array.isArray(list)) throw new Error('Liste d\'applis illisible');
    appsCache = list.filter(a => a && a.appId).map(a => {
      let icon = a.tvIconArt ? String(a.tvIconArt).replace(/(\.[a-z]+)$/i, '._SX210_$1') : (a.iconArtSmallUri || '');
      return {
        id: a.appId, name: a.name || a.appId, icon, installee: a.isInstalled !== false,
        shortcut: a.isShortcutApp ? (a.appShortcutLaunchIntent || a.appId) : null,
      };
    });
    appsTime = Date.now();
    return appsCache;
  }
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  async function findApp(a) {
    const list = await installedApps();
    const n = norm(a.name);
    return list.find(x => norm(x.name) === n) || list.find(x => x.id === a.package) ||
           list.find(x => norm(x.name).indexOf(n) !== -1 || n.indexOf(norm(x.name)) !== -1 && norm(x.name).length > 3);
  }
  // Dernière appli ouverte à partir du panneau (les Fire TV Vega ne disent pas ce qui joue)
  let derniere = null;
  let vega = null;      // dernières nouvelles de l'appli Pont Télé
  async function openApp(a) {
    derniere = { nom: a.name, quand: Date.now() };
    let found = null;
    try { found = await findApp(a); } catch (e) {}
    if (found && found.shortcut) return send('FireTV/shortcut/' + encodeURIComponent(found.shortcut)).then(() => null);
    return send('FireTV/app/' + encodeURIComponent(found ? found.id : a.package)).then(() => null);
  }

  const scan = dir => async () => {
    await send('media?action=scan', { direction: dir, keyAction: { keyActionType: 'keyDown' } });
    await send('media?action=scan', { direction: dir, keyAction: { keyActionType: 'keyUp' } }).catch(() => {});
    return null;
  };

  // ---- En ce moment : ce qui joue, lu par ADB (voir GUIDE-TELE-EN-COURS.md) ----
  const EnCours = require('./encours');
  let adbc = null, dernier = null, dernierT = 0, enLecture = null, pause = 0;
  const COMMANDE = "dumpsys media_session; echo @@@; cat /proc/uptime; echo @@@; dumpsys window windows | grep -E 'mCurrentFocus|mFocusedApp'";
  async function lireEnCours() {
    // Par défaut : seulement l'appli ouverte à partir du panneau.
    // « "adb": true » dans config.json (Fire TV sous Fire OS seulement) : vrai titre, temps et affiche.
    // Fire TV Vega : l'appli « Pont Télé » (dossier vega/) envoie ce qui joue toutes les 2 secondes
    if (vega && Date.now() - vega.recu < 12000 && vega.ok && vega.app) {
      const v = vega, pkg = String(v.app);
      const n = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cfgApp = (cfg.apps || []).filter(a => a.package === pkg || n(pkg).indexOf(n(a.name)) !== -1)[0];
      const r = {
        pkg, joue: !!v.joue, titre: v.titre || '', sous: v.sous || '', vitesse: v.vitesse || 1,
        ecoule: (v.ecoule || 0) + (v.joue ? Math.round((Date.now() - v.recu) / 1000) : 0),
        duree: v.duree || 0, bouton: cfgApp ? cfgApp.name : (derniere ? derniere.nom : ''),
        appNom: cfgApp ? cfgApp.name : pkg.split('.').pop(), appIcone: '',
      };
      if (r.titre && !EnCours.PAS_AFFICHE.test(pkg)) {
        const musique = EnCours.MUSIQUE.test(pkg);
        const a = EnCours.affiche(musique ? r.titre + ' ' + r.sous.split(' · ')[0] : r.titre, musique);
        if (a) { r.image = a.url; if (!r.duree) r.duree = a.duree || 0; }
      }
      if (!r.image && v.image) r.image = v.image;   // l'image donnée par l'appli qui joue
      return r;
    }
    // Vega en mode développeur : on lit l'appli à l'écran par vda (sauf « "vega": false » dans config.json)
    if (cfg.vega !== false && cfg.adb !== true) return lireVega();
    if (cfg.adb !== true) return derniere ? { bouton: derniere.nom, appNom: derniere.nom, ouvert: derniere.quand } : {};
    if (dernier && Date.now() - dernierT < 2000) return dernier;
    if (enLecture) return enLecture;
    if (dernier && dernier.erreur && Date.now() < pause) return dernier;   // ADB pas prêt : on réessaie dans 15 s
    enLecture = (async () => {
      if (!adbc) adbc = require('./adbnode')({ ip: cfg.ip, port: cfg.adbPort || 5555, cleFichier: path.join(__dirname, '..', '..', 'firetv-adbkey.pem') });
      let r;
      try { r = EnCours.lire(await adbc.shell(COMMANDE)); }
      catch (e) {
        pause = Date.now() + 15000;
        return { erreur: e.message, attente: adbc.etat() === 'attente' };
      }
      const pkg = r.pkg || r.premierPlan;
      let apps = [];
      try { apps = await installedApps(); } catch (e) {}
      const app = apps.filter(a => a.id === pkg)[0];
      r.pkg = pkg;
      r.appNom = app ? app.name : '';
      r.appIcone = app ? app.icon : '';
      // Le bouton d'appli du panneau qui correspond (pour le badge « EN COURS »)
      const n = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cfgApp = (cfg.apps || []).filter(a => a.package === pkg || (app && n(a.name) === n(app.name)))[0];
      r.bouton = cfgApp ? cfgApp.name : '';
      if (r.titre && !EnCours.PAS_AFFICHE.test(pkg)) {
        const musique = EnCours.MUSIQUE.test(pkg);
        const a = EnCours.affiche(musique ? r.titre + ' ' + r.sous.split(', ')[0] : r.titre, musique);
        if (a) { r.image = a.url; r.duree = a.duree || 0; }
      }
      return r;
    })();
    try { dernier = await enLecture; dernierT = Date.now(); } finally { enLecture = null; }
    return dernier;
  }

  // Fire TV Vega en mode développeur : « vda » sur le port 5555 parle ADB.
  // vlcm list donne l'appli à l'écran (VISIBLE), vlcm dump-state sessions dit si elle a une session média.
  const COMMANDE_VEGA = 'vlcm list; echo @@@; vlcm dump-state sessions';
  const ACCUEIL = /launcher|smplighthouse/i;
  async function lireVega() {
    if (dernier && Date.now() - dernierT < 2000) return dernier;
    if (enLecture) return enLecture;
    if (dernier && dernier.erreurVega && Date.now() < pause) {
      const r = derniere ? { bouton: derniere.nom, appNom: derniere.nom, ouvert: derniere.quand } : {};
      r.erreurVega = dernier.erreurVega; return r;
    }
    enLecture = (async () => {
      if (!adbc) adbc = require('./adbnode')({ ip: cfg.ip, port: cfg.adbPort || 5555, cleFichier: path.join(__dirname, '..', '..', 'firetv-adbkey.pem') });
      let sortie;
      try { sortie = await adbc.shell(COMMANDE_VEGA); }
      catch (e) {
        // vda pas joignable (mode développeur éteint, télé en veille…) : on garde l'appli ouverte depuis le panneau
        pause = Date.now() + 15000;
        const r = derniere ? { bouton: derniere.nom, appNom: derniere.nom, ouvert: derniere.quand } : {};
        r.erreurVega = e.message; r.erreur = undefined;
        return r;
      }
      const [liste, sessions] = String(sortie).split('@@@');
      let pkg = '', pid = '';
      String(liste || '').split('\n').forEach(l => {
        const c = l.trim().split(/\s+/);
        if (c.length > 4 && c[1] === 'I' && c[4] === 'VISIBLE' && !pkg) { pkg = c[0]; pid = c[2]; }
      });
      if (!pkg || ACCUEIL.test(pkg)) return { ecran: true, accueil: !!pkg };
      const media = !!pid && new RegExp('Session Pid: ' + pid + '\\b').test(sessions || '');
      const n = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cfgApp = (cfg.apps || []).filter(a => a.package === pkg || n(pkg).indexOf(n(a.name)) !== -1)[0];
      const nom = cfgApp ? cfgApp.name : pkg.replace(/\.main$/, '').split('.').filter(x => !/^(com|amazon|kepler|tv|app)$/.test(x))[0] || pkg;
      return { ecran: true, pkgVega: pkg, media, bouton: cfgApp ? cfgApp.name : '', appNom: nom.charAt(0).toUpperCase() + nom.slice(1) };
    })();
    try { dernier = await enLecture; dernierT = Date.now(); } finally { enLecture = null; }
    return dernier;
  }

  const actions = {
    encours: { label: 'En ce moment', run: () => lireEnCours() },
    // Reçu de l'appli Pont Télé sur la Fire TV (Vega). On garde aussi le dernier envoi pour le diagnostic.
    vega: { label: 'Pont Télé', run: async (d) => {
      vega = Object.assign({}, d, { recu: Date.now() });
      try { fs.writeFileSync(path.join(__dirname, '..', '..', 'vega-dernier.json'), JSON.stringify(vega, null, 2)); } catch (e) {}
      return 'OK';
    } },
    vegaDiag: { label: 'Pont Télé (diagnostic)', run: async () => vega || { rien: 'Pas encore de nouvelles de Pont Télé' } },
    pair:  { label: 'Jumeler', icon: '🔗', run: async ({ pin }) => {
      if (!pin) {
        await send('FireTV/pin/display', { friendlyName: 'Panneau' });
        return { askPin: true, message: 'Entre le code affiché sur la télé' };
      }
      const r = await send('FireTV/pin/verify', { pin: String(pin) });
      token = r && r.description;
      if (!token) throw new Error('Code refusé');
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token }));
      return 'Jumelé ✔';
    } },
    on:    { label: 'Réveiller', icon: '☀️', color: 'green', run: async () => { await wakeService(); return key('home')(); } },
    off:   { label: 'Veille', icon: '🌙', color: 'red', run: () => { derniere = null; return key('sleep')(); } },
    home:  { label: 'Accueil', icon: '🏠', run: () => { derniere = null; return key('home')(); } },
    back:  { label: 'Retour', icon: '↩', run: key('back') },
    menu:  { label: 'Menu', icon: '☰', run: key('menu') },
    up:    { label: 'Haut', icon: '▲', run: key('dpad_up') },
    left:  { label: 'Gauche', icon: '◀', run: key('dpad_left') },
    ok:    { label: 'OK', icon: '●', run: key('select') },
    right: { label: 'Droite', icon: '▶', run: key('dpad_right') },
    down:  { label: 'Bas', icon: '▼', run: key('dpad_down') },
    rew:   { label: 'Reculer', icon: '⏪', run: scan('back') },
    play:  { label: 'Play/Pause', icon: '⏯', run: () => send('media?action=play').then(() => null) },
    ff:    { label: 'Avancer', icon: '⏩', run: scan('forward') },
    vdown: { label: 'Volume -', icon: '🔉', run: hold('volume_down') },
    mute:  { label: 'Muet', icon: '🔇', run: hold('mute') },
    vup:   { label: 'Volume +', icon: '🔊', run: hold('volume_up') },
    // Logos des applis favorites (config.json > firetv.apps), pris sur la Fire TV
    logos: { label: 'Logos', run: async () => {
      const out = {};
      for (const a of (cfg.apps || [])) {
        const f = await findApp(a).catch(() => null);
        if (f && f.icon) out[a.name] = f.icon;
      }
      return out;
    } },
    // Toutes les applis installées (pour plus tard)
    applis: { label: 'Applis installées', run: () => { appsTime = 0; return installedApps(); } },
    ouvrir: { label: 'Ouvrir une appli', run: ({ id, shortcut }) => {
      if (!id) throw new Error('Appli manquante');
      return send(shortcut ? 'FireTV/shortcut/' + encodeURIComponent(shortcut) : 'FireTV/app/' + encodeURIComponent(id)).then(() => null);
    } },
  };
  (cfg.apps || []).forEach((a, i) => {
    actions[`app${i}`] = { label: a.name, icon: a.icon || '📱', run: () => openApp(a) };
  });

  return {
    name: 'Fire TV',
    icon: '🔥',
    layout: 'remote',
    actions,
    async status() { return { texte: token ? 'Jumelée' : 'Pas encore jumelée : appuie sur « Jumeler »' }; },
  };
};
