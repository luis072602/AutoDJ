// Audius: catálogo abierto de música. Aquí se busca; el audio lo descarga library.js con streamUrl().
// La API es pública (no usa clave) y permite leer el audio desde la página, por eso no hace falta servidor.
import { $, esc, fmt, log } from './state.js';
import { addTracks, hasTrack } from './library.js';

const API = 'https://api.audius.co/v1', APP = 'AutoDJ';
const GENRES = ['House', 'Tech House', 'Deep House', 'Techno', 'Electronic', 'Trance', 'Drum & Bass', 'Dubstep', 'Disco', 'Latin', 'Hip-Hop/Rap', 'Pop', 'Lo-Fi'];
const MIN_LEN = 60, MAX_LEN = 480;   // fuera quedan los fragmentos y los sets largos (no caben en memoria)

export const streamUrl = id => `${API}/tracks/${id}/stream?app_name=${APP}`;

async function get(path, params = {}) {
  const u = new URL(API + path);
  for (const [k, v] of Object.entries({ ...params, app_name: APP })) u.searchParams.set(k, v);
  let r;
  try { r = await fetch(u, { signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('Audius no responde, intenta de nuevo'); }
  if (!r.ok) throw new Error(r.status === 404 ? 'no encontré nada en ese enlace' : 'Audius respondió ' + r.status);
  return (await r.json()).data;
}

// Solo canciones que cualquiera puede oír completas
const usable = t => t && t.user && t.is_streamable !== false && !t.is_stream_gated && !t.stream_conditions && !t.is_delete &&
  t.duration >= MIN_LEN && t.duration <= MAX_LEN;
const toItem = t => ({
  aid: t.id, name: t.title.toLowerCase().includes(t.user.name.toLowerCase()) ? t.title : t.user.name + ' - ' + t.title, len: t.duration, bpm: t.bpm || null, genre: t.genre || null,
  url: 'https://audius.co' + t.permalink
});

let results = [], genre = null;

function render(title) {
  $('#resT').textContent = title || '';
  $('#addAll').hidden = !results.length;
  $('#resBox').hidden = !title;
  $('#res').innerHTML = results.length ? results.map((it, i) =>
    `<li class="${hasTrack(it.aid) ? 'in' : ''}"><div class="t" data-a="${i}" title="Agregar a la lista"><b>${esc(it.name)}</b>` +
    `<small>${fmt(it.len)}${it.genre ? ' · ' + esc(it.genre) : ''}</small></div>` +
    `<span class="bpm">${it.bpm ? Math.round(it.bpm) : '—'}</span>` +
    `<span class="ops"><button data-a="${i}" aria-label="Agregar">${hasTrack(it.aid) ? '✓' : '+'}</button></span></li>`).join('')
    : '<li class="empty">Sin resultados que se puedan mezclar.</li>';
  document.querySelectorAll('#genres button').forEach(b => b.classList.toggle('on', b.dataset.g === genre));
}

async function show(title, job) {
  log('Buscando en Audius…');
  try {
    results = (await job()).filter(usable).map(toItem);
    render(title);
    log(results.length ? results.length + ' canciones encontradas. Toca una para agregarla, o «Agregar todas».' : 'No encontré canciones que se puedan mezclar.');
  } catch (e) { log(e.message, true); }
}

// Un enlace de audius.co puede ser una canción o una lista
async function fromLink(url) {
  const d = await get('/resolve', { url }), x = Array.isArray(d) ? d[0] : d;
  if (!x) return [];
  if (x.playlist_name) return get('/playlists/' + x.id + '/tracks');
  return x.title ? [x] : [];
}

function search() {
  const q = $('#aq').value.trim();
  if (!q) return;
  genre = null;
  if (/^https?:\/\/(www\.)?audius\.co\//i.test(q)) show('Enlace de Audius', () => fromLink(q));
  else show('Resultados de «' + q + '»', () => get('/tracks/search', { query: q, limit: 50 }));
}

function trending(g) {
  genre = g;
  show('Tendencias de la semana · ' + g, () => get('/tracks/trending', { genre: g, time: 'week', limit: 50 }));
}

export function initAudius() {
  $('#genres').innerHTML = GENRES.map(g => `<button class="chip mini" data-g="${esc(g)}">${esc(g)}</button>`).join('');
  $('#genres').onclick = e => { const g = e.target.dataset.g; if (g) trending(g); };
  $('#ago').onclick = search;
  $('#aq').onkeydown = e => { if (e.key === 'Enter') search(); };
  $('#res').onclick = e => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const it = results[+el.dataset.a];
    if (addTracks([it])) log('Agregada: «' + it.name + '»');
    render($('#resT').textContent);
  };
  $('#addAll').onclick = () => {
    const n = addTracks(results);
    log(n ? n + ' canciones agregadas a la lista. Pulsa Reproducir.' : 'Esas canciones ya estaban en la lista.');
    render($('#resT').textContent);
  };
}
