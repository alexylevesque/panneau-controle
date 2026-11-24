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
        id: a.appId, name: a.name || a.appId, icon,
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
    return list.find(x => x.id === a.package) || list.find(x => norm(x.name) === n) ||
           list.find(x => norm(x.name).indexOf(n) !== -1 || n.indexOf(norm(x.name)) !== -1 && norm(x.name).length > 3);
  }
  async function openApp(a) {
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

  const actions = {
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
    off:   { label: 'Veille', icon: '🌙', color: 'red', run: key('sleep') },
    home:  { label: 'Accueil', icon: '🏠', run: key('home') },
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
    applis: { label: 'Applis installées', run: () => installedApps() },
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
