// Panneau de contrôle iPad — serveur sans dépendances (Node >= 18)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const cfgPath = fs.existsSync(path.join(ROOT, 'config.json'))
  ? path.join(ROOT, 'config.json')
  : path.join(ROOT, 'config.example.json');
const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const PORT = process.env.PORT || config.port || 8080;

// ---- Chargement des plugins (un dossier = un plugin) ----
const plugins = {};
const pluginsDir = path.join(ROOT, 'plugins');
for (const dir of fs.readdirSync(pluginsDir)) {
  if (dir.startsWith('_')) continue; // _modele etc. ignorés
  const file = path.join(pluginsDir, dir, 'index.js');
  if (!fs.existsSync(file)) continue;
  const pcfg = (config.plugins || {})[dir] || {};
  if (pcfg.enabled === false) continue;
  try {
    const mod = require(file);
    const p = typeof mod === 'function' ? mod(pcfg) : mod;
    if (!p) { console.log(`- plugin ignoré sur cet appareil : ${dir}`); continue; }
    p.id = p.id || dir;
    plugins[p.id] = p;
    console.log(`✓ plugin chargé : ${p.id}`);
  } catch (e) {
    console.error(`✗ plugin ${dir} : ${e.message}`);
  }
}

function describe() {
  return Object.values(plugins).map(p => ({
    id: p.id,
    name: p.name,
    icon: p.icon || '🔘',
    actions: Object.entries(p.actions || {}).map(([key, a]) => ({
      key, label: a.label, icon: a.icon || '', color: a.color || '', params: a.params || null,
    })),
    layout: p.layout || 'grid',
    hasStatus: typeof p.status === 'function',
  }));
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.sh': 'text/plain; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname.startsWith('/api/')) {
    if (config.token && req.headers['x-token'] !== config.token && url.searchParams.get('token') !== config.token) {
      return send(res, 401, { error: 'Jeton invalide' });
    }
    if (url.pathname === '/api/plugins') return send(res, 200, describe());

    const m = url.pathname.match(/^\/api\/([\w-]+)\/(status|action\/([\w-]+))$/);
    if (m) {
      const p = plugins[m[1]];
      if (!p) return send(res, 404, { error: 'Plugin inconnu' });
      try {
        if (m[2] === 'status') return send(res, 200, p.status ? await p.status() : {});
        const a = (p.actions || {})[m[3]];
        if (!a) return send(res, 404, { error: 'Action inconnue' });
        const params = req.method === 'POST' ? await readBody(req) : {};
        const result = await a.run(params);
        return send(res, 200, { ok: true, result: result === undefined ? null : result });
      } catch (e) {
        console.error(`[${m[1]}] ${e.message}`);
        return send(res, 500, { ok: false, error: e.message });
      }
    }
    return send(res, 404, { error: 'Route inconnue' });
  }

  // Fichiers statiques
  let file = path.normalize(path.join(ROOT, 'public', url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(path.join(ROOT, 'public'))) return send(res, 403, {});
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Introuvable'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    // Le script du Mac reçoit l'adresse du panneau telle que le Mac l'a utilisée
    if (path.extname(file) === '.sh') data = String(data).replace(/__PANNEAU__/g, 'http://' + String(req.headers.host || '').replace(/[^A-Za-z0-9.:-]/g, ''));
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  let nets = {};
  try { nets = require('os').networkInterfaces(); } catch (e) {}
  const ips = [].concat(...Object.values(nets)).filter(n => n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\nPanneau prêt ! Ouvre : ${[`http://localhost:${PORT}`, ...ips.map(ip => `http://${ip}:${PORT}`)].join('  ou  ')}\n`);
});
