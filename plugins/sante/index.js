// Santé : pas (envoyés par un raccourci de l'iPhone), objectif, créatine, plan d'entraînement du jour, sommeil et réveil.
// Les données vivent dans sante.json sur la tablette (pas dans le dépôt).
const fs = require('fs');
const path = require('path');
const PROGRAMME = require('./programme');

const FILE = path.join(__dirname, '..', '..', 'sante.json');

function jour(d) {   // « 2026-11-26 » à l'heure locale
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function heure(d) { d = d || new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function hhmm(v) { return /^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : null; }

module.exports = () => {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
  s.objectif = s.objectif || 10000;
  s.creatine = s.creatine || {};       // { '2026-11-26': '08:12' }
  s.pas = s.pas || {};                 // { date, n, maj }
  s.coucher = s.coucher || '22:30';
  s.reveil = s.reveil || '06:45';
  if (s.reveilActif === undefined) s.reveilActif = true;
  // Jour de la semaine (0 = dimanche) → jour du programme (null = repos)
  s.semaine = s.semaine || { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: null, 0: null };
  const save = () => { try { fs.writeFileSync(FILE, JSON.stringify(s, null, 2)); } catch (e) {} };

  function plan(d) {
    const i = s.semaine[d.getDay()];
    return i === null || i === undefined || !PROGRAMME.jours[i] ? null : PROGRAMME.jours[i];
  }

  return {
    name: 'Santé',
    icon: '❤️',
    actions: {
      // Le raccourci de l'iPhone envoie le total de pas du jour
      pas: { label: 'Pas (iPhone)', run: async ({ n, pas }) => {
        const v = Math.round(+(n !== undefined ? n : pas));
        if (!(v >= 0)) throw new Error('nombre de pas manquant');
        s.pas = { date: jour(), n: v, maj: Date.now() }; save();
        return 'OK';
      } },
      objectif: { label: 'Objectif de pas', run: async ({ n }) => {
        s.objectif = Math.max(1000, Math.min(50000, Math.round(+n / 500) * 500 || 10000)); save();
        return s.objectif;
      } },
      // Touche : prise / pas prise aujourd'hui
      creatine: { label: 'Créatine', run: async () => {
        const j = jour();
        if (s.creatine[j]) delete s.creatine[j]; else s.creatine[j] = heure();
        // on garde 60 jours
        Object.keys(s.creatine).sort().slice(0, -60).forEach(k => delete s.creatine[k]);
        save();
        return s.creatine[j] || '';
      } },
      sommeil: { label: 'Sommeil', run: async ({ coucher, reveil, actif }) => {
        if (hhmm(coucher)) s.coucher = hhmm(coucher);
        if (hhmm(reveil)) s.reveil = hhmm(reveil);
        if (actif !== undefined) s.reveilActif = !!actif;
        save();
        return 'OK';
      } },
      // Le réveil a sonné et a été arrêté aujourd'hui (pour ne pas le refaire sonner)
      reveilFini: { label: 'Réveil arrêté', run: async () => { s.reveilFini = jour(); save(); return 'OK'; } },
    },
    async status() {
      const maintenant = new Date(), j = jour(maintenant);
      const demain = new Date(maintenant.getTime() + 24 * 3600 * 1000);
      // Semaine en cours (lundi → dimanche) pour la créatine
      const lundi = new Date(maintenant); lundi.setDate(maintenant.getDate() - ((maintenant.getDay() + 6) % 7));
      const semaine = [];
      for (let k = 0; k < 7; k++) {
        const d = new Date(lundi); d.setDate(lundi.getDate() + k);
        semaine.push({ l: 'LMMJVSD'[k], pris: !!s.creatine[jour(d)], auj: jour(d) === j, futur: d > maintenant && jour(d) !== j });
      }
      return {
        jour: j,
        pas: s.pas.date === j ? s.pas.n : 0,
        pasMaj: s.pas.date === j ? s.pas.maj : 0,
        objectif: s.objectif,
        creatine: s.creatine[j] || '',
        semaine,
        programme: PROGRAMME.nom,
        aujourdhui: plan(maintenant),
        demain: plan(demain),
        coucher: s.coucher, reveil: s.reveil, reveilActif: s.reveilActif,
        reveilFini: s.reveilFini === j,
      };
    },
  };
};
