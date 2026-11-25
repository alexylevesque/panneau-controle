// IA : un vrai chat dans le panneau, avec l'API gratuite de Gemini (Google).
// La clé et les conversations restent sur la tablette (ia.json, ia-convos.json : jamais dans le code).
const fs = require('fs');
const path = require('path');
const https = require('https');

const CFG = path.join(__dirname, '..', '..', 'ia.json');
const CONV = path.join(__dirname, '..', '..', 'ia-convos.json');
const [HOTE, PORT] = (process.env.IA_HOTE || 'generativelanguage.googleapis.com:443').split(':');   // IA_HOTE : pour les tests seulement
const CONSIGNE = 'Tu es l\'assistant IA d\'un panneau de contrôle à la maison, affiché sur une tablette. ' +
  'Réponds en français (Québec), de façon claire, naturelle et plutôt concise. Utilise du Markdown simple (gras, listes, blocs de code) quand ça aide.';

function lire(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } }

function requete(methode, chemin, cle, corps) {
  return new Promise((resolve, reject) => {
    const data = corps ? Buffer.from(JSON.stringify(corps)) : null;
    const req = https.request({ host: HOTE, port: +PORT || 443, method: methode, path: chemin, timeout: 90000,
      headers: Object.assign({ 'x-goog-api-key': cle, 'User-Agent': 'panneau' }, data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}) }, r => {
      let d = ''; r.setEncoding('utf8'); r.on('data', c => (d += c));
      r.on('end', () => {
        let j = null; try { j = JSON.parse(d); } catch (e) {}
        if (r.statusCode >= 200 && r.statusCode < 300 && j) return resolve(j);
        const e = new Error((j && j.error && j.error.message) || ('Erreur ' + r.statusCode));
        e.code = r.statusCode; e.statut = j && j.error && j.error.status; reject(e);
      });
    });
    req.on('error', reject).on('timeout', () => req.destroy(new Error('Gemini ne répond pas (délai dépassé)')));
    if (data) req.write(data);
    req.end();
  });
}

function messageClair(e) {
  const m = String(e.message || e);
  if (/API key not valid|API_KEY_INVALID/i.test(m) || e.code === 401 || e.code === 403) return 'Clé Gemini refusée : vérifie-la dans les réglages de l\'IA';
  if (e.code === 429) return 'Limite gratuite de Gemini atteinte pour l\'instant, réessaie dans une minute (ou demain si c\'est la limite du jour)';
  if (e.code === 503 || e.code === 500) return 'Gemini est surchargé en ce moment, réessaie dans un instant';
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ENETUNREACH/.test(m)) return 'Pas d\'Internet sur la tablette';
  return m;
}

module.exports = () => {
  let cfg = Object.assign({ cle: '' }, lire(CFG, {}));
  let convos = lire(CONV, []);
  const saveCfg = () => { try { fs.writeFileSync(CFG, JSON.stringify(cfg)); } catch (e) {} };
  const saveConv = () => { try { fs.writeFileSync(CONV, JSON.stringify(convos)); } catch (e) {} };

  // Les modèles changent souvent : on demande à Google la liste et on prend le meilleur "flash" (gratuit)
  let modeles = [], modelesA = 0;
  async function choisirModeles(cle) {
    if (modeles.length && Date.now() - modelesA < 6 * 3600e3) return modeles;
    try {
      let tous = [], page = '';
      for (let i = 0; i < 5; i++) {
        const j = await requete('GET', '/v1beta/models?pageSize=200' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), cle);
        tous = tous.concat(j.models || []); page = j.nextPageToken; if (!page) break;
      }
      const ok = tous.filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') > -1)
        .map(m => String(m.name || '').replace(/^models\//, ''))
        .map(n => { const x = n.match(/^gemini-(\d+(?:\.\d+)?)-flash(-lite)?$/); return x ? { n, v: parseFloat(x[1]), lite: !!x[2] } : null; })
        .filter(Boolean)
        .sort((a, b) => (a.lite - b.lite) || (b.v - a.v));
      if (ok.length) { modeles = ok.map(x => x.n); modelesA = Date.now(); return modeles; }
    } catch (e) { if (e.code === 400 || e.code === 401 || e.code === 403) throw e; }
    return ['gemini-flash-latest', 'gemini-flash-lite-latest'];
  }
  let dernierModele = '';

  async function demander(historique) {
    if (!cfg.cle) throw new Error('Ajoute d\'abord ta clé Gemini');
    const liste = await choisirModeles(cfg.cle);
    const corps = {
      systemInstruction: { parts: [{ text: CONSIGNE }] },
      contents: historique.slice(-30).map(m => ({ role: m.r === 'model' ? 'model' : 'user', parts: [{ text: m.t }] })),
    };
    let derniere;
    for (const m of liste.slice(0, 4)) {
      try {
        const j = await requete('POST', '/v1beta/models/' + encodeURIComponent(m) + ':generateContent', cfg.cle, corps);
        const c = (j.candidates || [])[0];
        const texte = c && c.content && (c.content.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('');
        if (texte) { dernierModele = m; return { texte, modele: m }; }
        if ((c && c.finishReason === 'SAFETY') || (j.promptFeedback && j.promptFeedback.blockReason)) throw new Error('Gemini a refusé de répondre à ce message');
        throw new Error('Gemini n\'a rien répondu');
      } catch (e) {
        derniere = e;
        if (!(e.code === 429 || e.code === 404 || e.code === 500 || e.code === 503)) break;   // essayer le modèle suivant seulement dans ces cas
      }
    }
    throw new Error(messageClair(derniere));
  }

  const resumeConv = c => ({ id: c.id, titre: c.titre, maj: c.maj, n: c.messages.length });

  return {
    name: 'IA',
    icon: '✨',
    actions: {
      cle: { label: 'Clé Gemini', run: async ({ cle }) => {
        cle = String(cle || '').trim();
        if (!cle) throw new Error('Colle ta clé Gemini');
        modeles = [];
        try { await choisirModeles(cle); } catch (e) { throw new Error(messageClair(e)); }
        cfg.cle = cle; saveCfg(); return 'OK';
      } },
      liste: { label: 'Conversations', run: async () => convos.map(resumeConv) },
      lire: { label: 'Lire une conversation', run: async ({ id }) => {
        const c = convos.find(x => x.id === id); if (!c) throw new Error('Conversation introuvable');
        return c;
      } },
      envoyer: { label: 'Envoyer un message', run: async ({ id, texte }) => {
        texte = String(texte || '').trim().slice(0, 8000);
        if (!texte) throw new Error('Message vide');
        let c = id && convos.find(x => x.id === id);
        if (!c) {   // nouvelle conversation créée automatiquement, titrée avec le début du message
          const t = texte.replace(/\s+/g, ' ');
          c = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), titre: t.length > 48 ? t.slice(0, 46).replace(/\s+\S*$/, '') + '…' : t, cree: Date.now(), messages: [] };
        }
        const essai = c.messages.concat([{ r: 'user', t: texte, d: Date.now() }]);
        const rep = await demander(essai);   // si Gemini échoue, rien n'est sauvegardé : on peut renvoyer
        c.messages = essai.concat([{ r: 'model', t: rep.texte, d: Date.now() }]);
        c.maj = Date.now();
        convos = [c].concat(convos.filter(x => x.id !== c.id)).slice(0, 100);
        saveConv();
        return { id: c.id, titre: c.titre, reponse: rep.texte, modele: rep.modele };
      } },
      supprimer: { label: 'Supprimer une conversation', run: async ({ id }) => {
        convos = convos.filter(x => x.id !== id); saveConv(); return 'OK';
      } },
    },
    async status() {
      return { cle: !!cfg.cle, modele: dernierModele || modeles[0] || '' };
    },
  };
};
