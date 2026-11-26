// « En ce moment » : ce qui joue sur la Fire TV, lu par ADB (dumpsys media_session),
// avec l'affiche de la série ou du film trouvée sur internet (TVmaze, sinon iTunes) et gardée sur la tablette.
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..', '..');
const AFF_DIR = path.join(RACINE, 'public', 'affiches');
const AFF_FILE = path.join(RACINE, 'affiches.json');
const MAX_AFFICHES = 300;

// Applis où le titre n'est pas une série ou un film : pas de recherche d'affiche
const PAS_AFFICHE = /youtube|twitch|tiktok|browser|silk|launcher|settings/i;
// Applis de musique : on cherche la pochette sur Deezer
const MUSIQUE = /spotify|deezer|music|tidal|soundcloud|pandora|audible/i;

let affiches = {};   // titre → { url, duree } ou { rien: date }
try { affiches = JSON.parse(fs.readFileSync(AFF_FILE, 'utf8')); } catch (e) {}
const enCours = {};

function lireJson(host, chemin, cb) {
  https.get({ host, path: chemin, timeout: 8000, headers: { 'User-Agent': 'panneau' } }, res => {
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
    res.on('end', () => { try { fs.mkdirSync(AFF_DIR, { recursive: true }); fs.writeFileSync(fichier, Buffer.concat(morceaux)); cb(true); } catch (e) { cb(false); } });
  }).on('error', () => cb(false)).on('timeout', function () { this.destroy(); });
}
function sauver() { try { fs.writeFileSync(AFF_FILE, JSON.stringify(affiches)); } catch (e) {} }
function menage() {
  try {
    const fichiers = fs.readdirSync(AFF_DIR).map(f => ({ f, t: fs.statSync(path.join(AFF_DIR, f)).mtimeMs }));
    if (fichiers.length <= MAX_AFFICHES) return;
    fichiers.sort((a, b) => a.t - b.t).slice(0, fichiers.length - MAX_AFFICHES).forEach(x => {
      fs.unlinkSync(path.join(AFF_DIR, x.f));
      Object.keys(affiches).forEach(k => { if (affiches[k].url === '/affiches/' + x.f) delete affiches[k]; });
    });
    sauver();
  } catch (e) {}
}

// Renvoie { url, duree } si déjà connue ; sinon lance la recherche et renvoie null
function affiche(titre, musique) {
  if (!titre) return null;
  const cle = (musique ? 'dz|' : 'tv|') + titre.toLowerCase();
  const v = affiches[cle];
  if (v && v.url) return v;
  if (v && Date.now() - v.rien < 24 * 3600 * 1000) return null;   // introuvable : on réessaie demain
  if (enCours[cle]) return null;
  enCours[cle] = true;
  const terme = encodeURIComponent(titre);
  const fini = (url, duree) => {
    const garder = ok => {
      delete enCours[cle];
      affiches[cle] = ok ? { url: '/affiches/' + nom, duree: duree || 0 } : { rien: Date.now() };
      if (ok) menage();
      sauver();
    };
    const nom = crypto.createHash('md5').update(cle).digest('hex').slice(0, 16) + '.jpg';
    if (!url) return garder(false);
    telecharger(url, path.join(AFF_DIR, nom), garder);
  };
  if (musique) {
    return lireJson('api.deezer.com', '/search?limit=1&q=' + terme, k => {
      const d = k && k.data && k.data[0];
      fini(d && d.album ? d.album.cover_big : '', d ? d.duration : 0);
    }), null;
  }
  // Séries : TVmaze (gratuit, sans clé). Films : iTunes (donne aussi la durée).
  lireJson('api.tvmaze.com', '/singlesearch/shows?q=' + terme, s => {
    const img = s && s.image && (s.image.original || s.image.medium);
    if (img) return fini(img.replace(/^http:/, 'https:'));
    lireJson('itunes.apple.com', '/search?country=ca&media=movie&entity=movie&limit=1&term=' + terme, j => {
      const r = j && j.results && j.results[0];
      fini(r && r.artworkUrl100 ? String(r.artworkUrl100).replace(/\/\d+x\d+bb\./, '/600x600bb.') : '', r && r.trackTimeMillis ? r.trackTimeMillis / 1000 : 0);
    });
  });
  return null;
}

// Lit la sortie de « dumpsys media_session » + « /proc/uptime » + la fenêtre au premier plan
function lire(sortie) {
  const parts = sortie.split('@@@');
  const lignes = (parts[0] || '').split('\n');
  const sessions = [];
  let s = null;
  lignes.forEach(l => {
    let m;
    if ((m = /^\s*package=(\S+)/.exec(l))) { s = { pkg: m[1] }; sessions.push(s); return; }
    if (!s) return;
    if ((m = /^\s*active=(\w+)/.exec(l))) s.actif = m[1] === 'true';
    else if ((m = /state=PlaybackState \{state=(\d+), position=(-?\d+),.*?speed=([\d.]+), updated=(\d+)/.exec(l))) {
      s.etat = +m[1]; s.position = +m[2]; s.vitesse = +m[3]; s.maj = +m[4];
    } else if ((m = /metadata:\s*size=(\d+), description=(.*)$/.exec(l))) {
      const p = m[2].split(', ').filter(x => x && x !== 'null');
      if (+m[1] > 0 && p.length) { s.titre = p[0]; s.sous = p.slice(1).join(', '); }
    }
  });
  const uptime = parseFloat(parts[1]) * 1000 || 0;
  const focus = /mCurrentFocus=Window\{\S+ \S+ ([\w.]+)\//.exec(parts[2] || '') || /ActivityRecord\{\S+ \S+ ([\w.]+)\//.exec(parts[2] || '');
  // En lecture d'abord (3), puis en pause (2) avec un titre
  const choisie = sessions.filter(x => x.etat === 3)[0] || sessions.filter(x => x.etat === 2 && x.titre)[0];
  const r = { premierPlan: focus ? focus[1] : '' };
  if (choisie) {
    let pos = choisie.position >= 0 ? choisie.position : 0;
    if (choisie.etat === 3 && uptime && choisie.maj) pos += Math.max(0, uptime - choisie.maj) * (choisie.vitesse || 1);
    Object.assign(r, { pkg: choisie.pkg, joue: choisie.etat === 3, titre: choisie.titre || '', sous: choisie.sous || '', ecoule: Math.round(pos / 1000), vitesse: choisie.vitesse || 1 });
  }
  return r;
}

module.exports = { lire, affiche, PAS_AFFICHE, MUSIQUE };
