// Petit client ADB écrit en Node (pas besoin d'installer « adb » sur la tablette).
// Sert à lire ce qui joue sur la Fire TV (dumpsys media_session).
// La première fois, la télé demande « Autoriser le débogage USB ? » : coche « Toujours autoriser » et OK.
// La clé de la tablette est gardée dans firetv-adbkey.pem (pas dans le dépôt).
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');

const CNXN = 0x4e584e43, AUTH = 0x48545541, OPEN = 0x4e45504f, OKAY = 0x59414b4f, CLSE = 0x45534c43, WRTE = 0x45545257;
const SHA1_PREFIX = Buffer.from('3021300906052b0e03021a05000414', 'hex');

// Lit n et e dans une clé publique RSA PKCS#1 (DER)
function lireCle(der) {
  let i = 0;
  function longueur() {
    let l = der[i++];
    if (l & 0x80) { const n = l & 0x7f; l = 0; for (let k = 0; k < n; k++) l = l * 256 + der[i++]; }
    return l;
  }
  i++; longueur();                       // SEQUENCE
  i++; let l = longueur(); let n = der.slice(i, i + l); i += l;
  i++; l = longueur(); const e = der.slice(i, i + l);
  while (n[0] === 0) n = n.slice(1);
  return { n: BigInt('0x' + n.toString('hex')), e: parseInt(e.toString('hex'), 16) };
}

// Format de clé publique propre à Android (RSAPublicKey de mincrypt), en base64
function cleAndroid(pem, nom) {
  const pub = crypto.createPublicKey(pem).export({ type: 'pkcs1', format: 'der' });
  const k = lireCle(pub);
  const MOTS = 64, b32 = BigInt(2) ** BigInt(32);
  const buf = Buffer.alloc(4 + 4 + MOTS * 4 + MOTS * 4 + 4);
  buf.writeUInt32LE(MOTS, 0);
  // n0inv = -1 / n[0] mod 2^32
  const n0 = k.n % b32;
  let inv = BigInt(1);
  for (let j = 0; j < 32; j++) inv = (inv * (BigInt(2) - n0 * inv)) % b32;   // Newton
  buf.writeUInt32LE(Number((b32 - inv) % b32), 4);
  let n = k.n;
  for (let j = 0; j < MOTS; j++) { buf.writeUInt32LE(Number(n % b32), 8 + j * 4); n = n / b32; }
  let rr = (BigInt(2) ** BigInt(4096)) % k.n;
  for (let j = 0; j < MOTS; j++) { buf.writeUInt32LE(Number(rr % b32), 8 + MOTS * 4 + j * 4); rr = rr / b32; }
  buf.writeUInt32LE(k.e, 8 + MOTS * 8);
  return buf.toString('base64') + ' ' + nom + '\0';
}

function cle(fichier) {
  try { return fs.readFileSync(fichier, 'utf8'); } catch (e) {}
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, publicExponent: 65537,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  fs.writeFileSync(fichier, privateKey, { mode: 0o600 });
  return privateKey;
}

function paquet(cmd, a0, a1, data) {
  data = data ? Buffer.from(data) : Buffer.alloc(0);
  const h = Buffer.alloc(24);
  let somme = 0; for (let i = 0; i < data.length; i++) somme += data[i];
  h.writeUInt32LE(cmd, 0); h.writeUInt32LE(a0 >>> 0, 4); h.writeUInt32LE(a1 >>> 0, 8);
  h.writeUInt32LE(data.length, 12); h.writeUInt32LE(somme >>> 0, 16); h.writeUInt32LE((cmd ^ 0xffffffff) >>> 0, 20);
  return Buffer.concat([h, data]);
}

module.exports = function (opts) {
  const pem = cle(opts.cleFichier);
  const pubAndroid = cleAndroid(crypto.createPublicKey(pem).export({ type: 'spki', format: 'pem' }), 'panneau@tablette');
  let sock = null, pret = null, prochainId = 1;
  const flux = {};               // id local → { distant, morceaux, fin }
  let etat = '';                 // '', 'attente' (attend l'autorisation sur la télé), 'ok'

  function fermer(err) {
    if (sock) { try { sock.destroy(); } catch (e) {} }
    sock = null; pret = null;
    Object.keys(flux).forEach(id => { flux[id].fin(err || new Error('connexion fermée')); delete flux[id]; });
  }

  function connecter() {
    if (pret) return pret;
    pret = new Promise((resolve, reject) => {
      let tampon = Buffer.alloc(0), signe = false, fini = false;
      const s = net.connect({ host: opts.ip, port: opts.port || 5555 });
      sock = s;
      const echec = e => { if (!fini) { fini = true; reject(e); } fermer(e); };
      s.setTimeout(opts.attente || 20000, () => echec(new Error(etat === 'attente'
        ? 'Accepte « Autoriser le débogage » sur la télé (coche Toujours autoriser)'
        : 'Fire TV injoignable sur le port 5555 : active le débogage ADB')));
      s.on('error', e => echec(new Error(/ECONNREFUSED/.test(e.message)
        ? 'ADB refusé : active le débogage ADB sur la Fire TV' : 'Fire TV injoignable (' + e.message + ')')));
      s.on('close', () => echec(new Error('connexion fermée')));
      s.on('connect', () => s.write(paquet(CNXN, 0x01000000, 256 * 1024, 'host::\0')));
      s.on('data', d => {
        tampon = Buffer.concat([tampon, d]);
        while (tampon.length >= 24) {
          const lg = tampon.readUInt32LE(12);
          if (tampon.length < 24 + lg) break;
          const cmd = tampon.readUInt32LE(0), a0 = tampon.readUInt32LE(4), a1 = tampon.readUInt32LE(8);
          const data = tampon.slice(24, 24 + lg);
          tampon = tampon.slice(24 + lg);
          if (cmd === AUTH && a0 === 1) {
            if (!signe) {
              signe = true;
              const sig = crypto.privateEncrypt({ key: pem, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.concat([SHA1_PREFIX, data]));
              s.write(paquet(AUTH, 2, 0, sig));
            } else {
              etat = 'attente';             // clé inconnue : la télé va demander l'autorisation
              s.write(paquet(AUTH, 3, 0, pubAndroid));
            }
          } else if (cmd === CNXN) {
            etat = 'ok'; s.setTimeout(0);
            if (!fini) { fini = true; resolve(); }
          } else if (cmd === OKAY) {
            const f = flux[a1]; if (f) f.distant = a0;
          } else if (cmd === WRTE) {
            const f = flux[a1];
            s.write(paquet(OKAY, a1, a0));
            if (f) f.morceaux.push(data);
          } else if (cmd === CLSE) {
            const f = flux[a1];
            if (f) { delete flux[a1]; s.write(paquet(CLSE, a1, a0)); f.fin(null, Buffer.concat(f.morceaux).toString('utf8')); }
          }
        }
      });
    });
    return pret;
  }

  async function shell(cmd) {
    await connecter();
    return new Promise((resolve, reject) => {
      const id = prochainId++;
      const t = setTimeout(() => { delete flux[id]; fermer(); reject(new Error('Fire TV ne répond pas')); }, 10000);
      flux[id] = { distant: 0, morceaux: [], fin: (err, out) => { clearTimeout(t); err ? reject(err) : resolve(out); } };
      sock.write(paquet(OPEN, id, 0, 'shell:' + cmd + '\0'));
    });
  }

  return { shell, fermer, etat: () => etat, _pubAndroid: pubAndroid };
};
