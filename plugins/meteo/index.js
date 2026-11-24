// Météo (Open-Meteo, gratuit, sans clé) + qualité de la connexion.
const https = require('https');
const net = require('net');

const CODES = {
  0: ['☀️', 'Ensoleillé'], 1: ['🌤️', 'Plutôt ensoleillé'], 2: ['⛅', 'Partiellement nuageux'], 3: ['☁️', 'Nuageux'],
  45: ['🌫️', 'Brouillard'], 48: ['🌫️', 'Brouillard givrant'],
  51: ['🌦️', 'Bruine légère'], 53: ['🌦️', 'Bruine'], 55: ['🌧️', 'Bruine forte'], 56: ['🌧️', 'Bruine verglaçante'], 57: ['🌧️', 'Bruine verglaçante'],
  61: ['🌦️', 'Pluie légère'], 63: ['🌧️', 'Pluie'], 65: ['🌧️', 'Forte pluie'], 66: ['🌧️', 'Pluie verglaçante'], 67: ['🌧️', 'Pluie verglaçante'],
  71: ['🌨️', 'Neige légère'], 73: ['🌨️', 'Neige'], 75: ['❄️', 'Forte neige'], 77: ['🌨️', 'Grains de neige'],
  80: ['🌦️', 'Averses'], 81: ['🌧️', 'Averses'], 82: ['⛈️', 'Fortes averses'], 85: ['🌨️', 'Averses de neige'], 86: ['❄️', 'Averses de neige'],
  95: ['⛈️', 'Orages'], 96: ['⛈️', 'Orages et grêle'], 99: ['⛈️', 'Orages et grêle'],
};

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, res => {
      let d = ''; res.on('data', c => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

// Temps pour ouvrir une connexion vers Internet = qualité du Wi-Fi/Internet.
function ping(host, port) {
  return new Promise(resolve => {
    const t = Date.now();
    const s = net.connect({ host, port, timeout: 3000 }, () => { s.destroy(); resolve(Date.now() - t); });
    s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
  });
}

module.exports = (cfg) => {
  const lat = cfg.latitude || 46.04, lon = cfg.longitude || -73.11, ville = cfg.ville || 'Sorel-Tracy';
  let cache = null, cacheAt = 0;

  async function meteo() {
    if (cache && Date.now() - cacheAt < 10 * 60 * 1000) return cache; // 10 min
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min' +
      '&timezone=America%2FToronto&forecast_days=1';
    const j = await getJSON(url);
    const c = CODES[j.current.weather_code] || ['🌡️', ''];
    cache = {
      ville, icone: c[0], description: c[1],
      temp: Math.round(j.current.temperature_2m),
      max: Math.round(j.daily.temperature_2m_max[0]), min: Math.round(j.daily.temperature_2m_min[0]),
      vent: Math.round(j.current.wind_speed_10m),
    };
    cacheAt = Date.now();
    return cache;
  }

  return {
    name: 'Météo',
    icon: '⛅',
    actions: {},
    async status() {
      const out = {};
      try { out.meteo = await meteo(); } catch (e) { out.meteo = null; }
      const ms = await ping('1.1.1.1', 443);
      out.reseau = ms === null ? { niveau: 0, texte: 'Hors ligne' }
        : ms < 60 ? { niveau: 4, texte: 'Excellent', ms } : ms < 150 ? { niveau: 3, texte: 'Bon', ms }
        : ms < 400 ? { niveau: 2, texte: 'Moyen', ms } : { niveau: 1, texte: 'Faible', ms };
      out.texte = out.meteo ? `${out.meteo.icone} ${out.meteo.temp}° · ${out.meteo.description} · ${ville}` : 'Météo indisponible';
      return out;
    },
  };
};
