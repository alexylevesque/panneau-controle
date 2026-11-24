// Wake-on-LAN : réveille d'autres appareils du réseau (PC, NAS, autre Mac...)
const dgram = require('dgram');

function magicPacket(mac) {
  const hex = mac.replace(/[^0-9a-f]/gi, '');
  if (hex.length !== 12) throw new Error(`Adresse MAC invalide : ${mac}`);
  const macBuf = Buffer.from(hex, 'hex');
  const pkt = Buffer.alloc(6 + 16 * 6, 0xff);
  for (let i = 0; i < 16; i++) macBuf.copy(pkt, 6 + i * 6);
  return pkt;
}

function wake(mac, broadcast = '255.255.255.255') {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    sock.once('error', reject);
    sock.bind(() => {
      sock.setBroadcast(true);
      sock.send(magicPacket(mac), 9, broadcast, err => {
        sock.close();
        err ? reject(err) : resolve(`Paquet envoyé à ${mac}`);
      });
    });
  });
}

module.exports = (cfg) => {
  const actions = {};
  (cfg.devices || []).forEach((d, i) => {
    actions[`wake${i}`] = { label: `Réveiller ${d.name}`, icon: '⚡', run: () => wake(d.mac, d.broadcast) };
  });
  return { name: 'Réveil à distance', icon: '⚡', actions };
};
