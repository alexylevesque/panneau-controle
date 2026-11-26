// Pont Télé : petite appli pour la Fire TV (Vega OS).
// Elle regarde ce qui joue (contrôle des médias de Vega) et l'envoie au panneau toutes les 2 secondes.
// L'écran affiche ce qu'elle voit, pour vérifier que ça marche.
import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import * as KMC from '@amazon-devices/kepler-media-controls';

// Adresse du panneau (la tablette). Change-la ici si l'adresse de la tablette change.
const PANNEAU = 'http://192.168.2.91:8080/api/firetv/action/vega';
const DELAI = 2000;

const K: any = KMC;
const PS: any = K.PlaybackStatus || {};

function sec(t: any): number {
  if (t === null || t === undefined) return 0;
  if (typeof t === 'number') return t > 1e6 ? t / 1000 : t;          // nombre en ms ou en s
  return (Number(t.seconds) || 0) + (Number(t.nanoseconds) || 0) / 1e9;
}
function joue(st: any): boolean {
  if (PS.PLAYING !== undefined && st === PS.PLAYING) return true;
  const s = String(st);
  return /PLAYING/i.test(s) && !/NOT/i.test(s);
}
function enPause(st: any): boolean {
  if (PS.PAUSED !== undefined && st === PS.PAUSED) return true;
  return /PAUSED/i.test(String(st));
}
function nomPaquet(p: any): string {
  if (!p) return '';
  if (typeof p === 'string') return p;
  return p.id || p.packageId || p.name || p.value || JSON.stringify(p);
}
function premiereImage(meta: any): string {
  const a = (meta && meta.artwork) || [];
  for (let i = 0; i < a.length; i++) if (a[i] && a[i].url) return a[i].url;
  return '';
}
function court(o: any, n: number): string {
  let s = '';
  try { s = JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? String(v) : v)); } catch (e) { s = String(o); }
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function lire(loc: any) {
  if (!loc || typeof loc.getMediaControlEndpoints !== 'function') throw new Error('locator sans getMediaControlEndpoints : ' + Object.getOwnPropertyNames(Object.getPrototypeOf(loc) || {}).join(','));
  const eps: any[] = (await loc.getMediaControlEndpoints()) || [];
  const vus: any[] = [];
  let choisi: any = null;
  for (let i = 0; i < eps.length; i++) {
    const ep = eps[i];
    let pkg = '';
    try { pkg = nomPaquet(ep.getEndpointPackageId()); } catch (e) {}
    let etats: any[] = [];
    try { etats = (await ep.getSessionState()) || []; }
    catch (e: any) { vus.push({pkg, erreur: 'getSessionState : ' + (e && e.message)}); continue; }
    for (let j = 0; j < etats.length; j++) {
      const s = etats[j] || {};
      const ps = s.playbackState || {};
      const info = s.mediaInfo || {};
      let meta: any = null;
      const id = info.mediaId !== undefined ? info.mediaId : info.id;
      if (id !== undefined) { try { meta = await ep.getMetadata(id); } catch (e) {} }
      const pos = ps.position || {};
      let ecoule = sec(pos.position !== undefined ? pos.position : pos);
      const maj = sec(pos.updatedAtTime);
      if (joue(ps.playbackStatus) && maj > 1e9) ecoule += Math.max(0, Date.now() / 1000 - maj) * (ps.playbackSpeed || 1);
      const m = meta || {};
      const r = {
        app: pkg,
        joue: joue(ps.playbackStatus),
        pause: enPause(ps.playbackStatus),
        titre: m.title || info.title || '',
        sous: m.description || [m.album, (m.artists || []).join(', ')].filter(Boolean).join(' · ') || '',
        ecoule: Math.round(ecoule),
        duree: Math.round(sec(info.duration || m.duration || ps.duration)),
        image: premiereImage(m),
        vitesse: ps.playbackSpeed || 1,
        brut: court({session: s, meta}, 1500),
      };
      vus.push(r);
      if (!choisi || (r.joue && !choisi.joue)) choisi = r;
    }
    if (!etats.length) vus.push({app: pkg, vide: true});
  }
  return {choisi, vus, nb: eps.length};
}

// Ce que le module de Vega contient vraiment (pour le diagnostic)
function cles(): string {
  const out: string[] = [];
  Object.keys(K).forEach(k => {
    const v = K[k];
    let sous = '';
    if (v && (typeof v === 'object' || typeof v === 'function')) {
      try { sous = Object.getOwnPropertyNames(v).filter(x => !/^(length|name|prototype|caller|arguments)$/.test(x)).slice(0, 12).join(','); } catch (e) {}
    }
    out.push(k + (sous ? '{' + sous + '}' : ''));
  });
  return out.join('  ');
}
// Trouve la fonction qui donne le « locator », peu importe son nom exact
async function trouverLocator(): Promise<any> {
  const sources = [K.MediaControlComponentAsync, K.MediaControlComponent, K.default, K];
  const noms = ['makeMediaControlEndpointLocator', 'getMediaControlEndpointLocator', 'createMediaControlEndpointLocator', 'makeMediaControlEndpointLocatorAsync'];
  for (const src of sources) {
    if (!src) continue;
    for (const n of noms) if (typeof src[n] === 'function') return await src[n].call(src);
    for (const n of Object.getOwnPropertyNames(src)) {
      if (/locator/i.test(n) && typeof src[n] === 'function') return await src[n].call(src);
    }
  }
  if (typeof K.MediaControlComponentAsync === 'function') {
    const inst = new K.MediaControlComponentAsync();
    for (const n of noms) if (typeof inst[n] === 'function') return await inst[n]();
  }
  throw new Error('aucune fonction « locator » trouvée');
}

export const App = () => {
  const [texte, setTexte] = useState('Démarrage…');
  const [envoi, setEnvoi] = useState('');
  const [brut, setBrut] = useState('');
  const loc = useRef<any>(null);
  const occupe = useRef(false);
  const etape = useRef('');

  useEffect(() => {
    const tour = async () => {
      if (occupe.current) return;
      occupe.current = true;
      let data: any = {};
      try {
        etape.current = 'locator';
        if (!loc.current) loc.current = await trouverLocator();
        etape.current = 'lecture';
        const r = await lire(loc.current);
        data = {ok: true, nb: r.nb, ...(r.choisi || {}), autres: r.vus.map((v: any) => v.app + (v.erreur ? ' (' + v.erreur + ')' : v.joue ? ' ▶' : v.pause ? ' ⏸' : ''))};
        const c = r.choisi;
        setTexte(r.nb + ' lecteur(s) trouvé(s)\n' + (c ? (c.joue ? '▶ ' : c.pause ? '⏸ ' : '') + (c.titre || '(pas de titre)') + '\n' + c.app + '\n' + c.ecoule + ' s / ' + (c.duree || '?') + ' s' : 'Rien en lecture') +
          '\n\n' + r.vus.map((v: any) => '• ' + (v.app || '?') + (v.erreur ? ' : ' + v.erreur : v.vide ? ' : aucune session' : v.joue ? ' : en lecture' : v.pause ? ' : en pause' : ' : arrêté')).join('\n'));
        setBrut(c ? c.brut : '');
      } catch (e: any) {
        data = {ok: false, erreur: '[' + etape.current + '] ' + String((e && e.message) || e), cles: cles()};
        setTexte('Erreur ' + data.erreur);
        setBrut('Module : ' + data.cles);
      }
      try {
        const res = await fetch(PANNEAU, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
        setEnvoi('Envoyé au panneau ' + new Date().toLocaleTimeString() + ' (' + res.status + ')');
      } catch (e: any) {
        setEnvoi('Panneau injoignable : ' + String((e && e.message) || e));
      }
      occupe.current = false;
    };
    tour();
    const t = setInterval(tour, DELAI);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={s.fond}>
      <Text style={s.titre}>📺 Pont Télé</Text>
      <Text style={s.aide}>Laisse cette appli ouverte une fois, puis fais Accueil et lance Netflix : le panneau devrait voir ce qui joue.</Text>
      <Text style={s.texte}>{texte}</Text>
      <Text style={s.envoi}>{envoi}</Text>
      <ScrollView style={s.brut}><Text style={s.brutT}>{brut}</Text></ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  fond: {flex: 1, backgroundColor: '#0e1224', padding: 60},
  titre: {color: '#fff', fontSize: 48, fontWeight: '700'},
  aide: {color: '#9aa3c7', fontSize: 24, marginTop: 10, marginBottom: 30},
  texte: {color: '#fff', fontSize: 30, lineHeight: 42},
  envoi: {color: '#46e39a', fontSize: 24, marginTop: 24},
  brut: {marginTop: 24, maxHeight: 260},
  brutT: {color: '#6b7398', fontSize: 18},
});

export default App;
