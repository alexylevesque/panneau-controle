const token = new URLSearchParams(location.search).get('token') || localStorage.getItem('token') || '';
if (token) localStorage.setItem('token', token);
const api = (p, opt = {}) => fetch(p, { ...opt, headers: { 'Content-Type': 'application/json', 'X-Token': token } }).then(r => r.json());

function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ''), 2200);
}

function tick() {
  const d = new Date();
  clock.textContent = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  date.textContent = d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });
}
setInterval(tick, 1000); tick();

fs.onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

const DPAD = { up: 'u', left: 'l', ok: 'c', right: 'r', down: 'd' };

async function load() {
  const plugins = await api('/api/plugins');
  if (plugins.error) return toast(plugins.error, true);
  grid.innerHTML = '';
  for (const p of plugins) {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `<h2>${p.icon} ${p.name}</h2><div class="status"></div><div class="btns"></div>`;
    const btns = card.querySelector('.btns');
    let pad = null;
    if (p.layout === 'remote') {
      card.classList.add('wide');
      pad = document.createElement('div');
      pad.className = 'dpad';
      btns.before(pad);
    }
    for (const a of p.actions) {
      const b = document.createElement('button');
      if (a.color) b.classList.add(a.color);
      b.innerHTML = `<span class="i">${a.icon}</span><span>${a.label}</span>`;
      b.onclick = async () => {
        b.classList.add('busy');
        navigator.vibrate?.(20);
        try {
          let r = await api(`/api/${p.id}/action/${a.key}`, { method: 'POST', body: '{}' });
          if (r.ok && r.result && r.result.askPin) {
            const pin = prompt(r.result.message || 'Code PIN');
            if (pin) r = await api(`/api/${p.id}/action/${a.key}`, { method: 'POST', body: JSON.stringify({ pin }) });
            else r = { ok: true, result: null };
          }
          if (r.ok && r.result && r.result.reload) {
            toast(r.result.message || 'Rechargement…');
            setTimeout(() => location.reload(), 4000);
          } else {
            r.ok ? (r.result && toast(String(r.result))) : toast(r.error || 'Erreur', true);
          }
        } catch { toast('Serveur injoignable', true); }
        b.classList.remove('busy');
      };
      if (pad && DPAD[a.key]) { b.style.gridArea = DPAD[a.key]; if (a.key === 'ok') b.classList.add('center'); pad.appendChild(b); }
      else btns.appendChild(b);
    }
    grid.appendChild(card);
    if (p.hasStatus) {
      const s = card.querySelector('.status');
      const refresh = () => api(`/api/${p.id}/status`).then(r => (s.textContent = r.texte || '')).catch(() => {});
      refresh(); setInterval(refresh, 10000);
    }
  }
}
load().catch(() => toast('Serveur injoignable', true));
