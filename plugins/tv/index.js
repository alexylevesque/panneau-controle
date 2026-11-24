// Télé : un "pilote" par marque. Choisis "brand" dans config.json.
// Pilotes inclus sans dépendance : roku, sony (Bravia), demo.
// Samsung / LG / Android TV : à ajouter dès qu'on connaît la marque.

const drivers = {
  demo: () => ({ send: async key => `(démo) touche ${key}` }),

  // Roku / TCL Roku TV : protocole ECP sur le port 8060
  roku: cfg => {
    const map = { power: 'Power', volUp: 'VolumeUp', volDown: 'VolumeDown', mute: 'VolumeMute', up: 'Up', down: 'Down', left: 'Left', right: 'Right', ok: 'Select', back: 'Back', home: 'Home', play: 'Play' };
    return { send: async key => {
      const r = await fetch(`http://${cfg.ip}:8060/keypress/${map[key]}`, { method: 'POST' });
      if (!r.ok) throw new Error(`Roku a répondu ${r.status}`);
    } };
  },

  // Sony Bravia : IRCC (activer "contrôle IP" + clé pré-partagée sur la télé)
  sony: cfg => {
    const codes = { power: 'AAAAAQAAAAEAAAAVAw==', volUp: 'AAAAAQAAAAEAAAASAw==', volDown: 'AAAAAQAAAAEAAAATAw==', mute: 'AAAAAQAAAAEAAAAUAw==', up: 'AAAAAQAAAAEAAAB0Aw==', down: 'AAAAAQAAAAEAAAB1Aw==', left: 'AAAAAQAAAAEAAAA0Aw==', right: 'AAAAAQAAAAEAAAAzAw==', ok: 'AAAAAQAAAAEAAABlAw==', back: 'AAAAAgAAAJcAAAAjAw==', home: 'AAAAAQAAAAEAAABgAw==', play: 'AAAAAgAAAJcAAAAaAw==' };
    return { send: async key => {
      const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>${codes[key]}</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>`;
      const r = await fetch(`http://${cfg.ip}/sony/IRCC`, { method: 'POST', body, headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"', 'X-Auth-PSK': cfg.psk || '' } });
      if (!r.ok) throw new Error(`Sony a répondu ${r.status}`);
    } };
  },
};

const BUTTONS = [
  ['power', 'Power', '⏻', 'red'], ['volDown', 'Vol −', '🔉'], ['volUp', 'Vol +', '🔊'], ['mute', 'Muet', '🔇'],
  ['up', 'Haut', '▲'], ['left', 'Gauche', '◀'], ['ok', 'OK', '●'], ['right', 'Droite', '▶'], ['down', 'Bas', '▼'],
  ['back', 'Retour', '↩'], ['home', 'Accueil', '🏠'], ['play', 'Play/Pause', '⏯'],
];

module.exports = (cfg) => {
  const make = drivers[cfg.brand] || drivers.demo;
  const drv = make(cfg);
  const actions = {};
  for (const [key, label, icon, color] of BUTTONS) {
    actions[key] = { label, icon, color, run: () => drv.send(key) };
  }
  return { name: `Télé${cfg.brand && cfg.brand !== 'demo' ? ' (' + cfg.brand + ')' : ''}`, icon: '📺', actions };
};
