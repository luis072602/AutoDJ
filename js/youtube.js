// YouTube / YouTube Music: lee tus listas (solo lectura) con tu cuenta de Google,
// o una lista pública a partir de su enlace. El audio lo entrega server.py.
import { S, $, esc, log } from './state.js';
import { addYouTube } from './library.js';
import { GOOGLE_CLIENT_ID } from './config.js';

let token = null, lists = [];

const loadGIS = () => new Promise((ok, no) => {
  if (window.google && google.accounts) return ok();
  const e = document.createElement('script');
  e.src = 'https://accounts.google.com/gsi/client';
  e.onload = ok;
  e.onerror = () => no(new Error('No se pudo cargar el login de Google (¿hay internet?)'));
  document.head.appendChild(e);
});

async function api(q) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/' + q, { headers: { Authorization: 'Bearer ' + token } }), j = await r.json();
  if (!r.ok) throw new Error(j.error && j.error.message || r.status);
  return j;
}
async function pages(q) {
  const all = [];
  let tok = '', n = 0;
  do { const j = await api(q + (tok ? '&pageToken=' + tok : '')); all.push(...j.items); tok = j.nextPageToken; n++; } while (tok && n < 10);
  return all;
}

async function connect() {
  const id = $('#cid').value.trim();
  if (!id) { log('Falta el Client ID de Google (mira el README)', true); return; }
  try { localStorage.setItem('adj_cid', id); } catch {}
  try {
    await loadGIS();
    google.accounts.oauth2.initTokenClient({
      client_id: id, scope: 'https://www.googleapis.com/auth/youtube.readonly',
      callback: async r => {
        if (r.error) { log('Google: ' + r.error, true); return; }
        token = r.access_token;
        try {
          lists = await pages('playlists?part=snippet,contentDetails&mine=true&maxResults=50');
          lists.push({ id: 'LL', snippet: { title: 'Videos que me gustan' }, contentDetails: {} });
          $('#ytl').innerHTML = lists.map((l, i) => `<option value="${i}">${esc(l.snippet.title)}${l.contentDetails.itemCount != null ? ' (' + l.contentDetails.itemCount + ')' : ''}</option>`).join('');
          $('#ytsel').hidden = false;
          $('#ytc').textContent = 'Cuenta conectada ✓';
          log((lists.length - 1) + ' listas encontradas. Elige una y cárgala.');
        } catch (e) { log('Error de YouTube: ' + e.message, true); }
      }
    }).requestAccessToken();
  } catch (e) { log(e.message, true); }
}

async function loadMine() {
  const l = lists[+$('#ytl').value];
  if (!l) return;
  try {
    log('Leyendo «' + l.snippet.title + '»…');
    const its = await pages('playlistItems?part=snippet&maxResults=50&playlistId=' + l.id);
    addYouTube(its
      .filter(x => x.snippet.resourceId && x.snippet.resourceId.videoId && !/^(Deleted|Private) video$/.test(x.snippet.title))
      .map(x => {
        const a = (x.snippet.videoOwnerChannelTitle || '').replace(/ - Topic$/, '');
        return { vid: x.snippet.resourceId.videoId, name: (a && !x.snippet.title.includes(a) ? a + ' - ' : '') + x.snippet.title };
      }), l.snippet.title);
  } catch (e) { log('Error de YouTube: ' + e.message, true); }
}

async function loadUrl() {
  const url = $('#yturl').value.trim();
  if (!url) return;
  if (!S.server) { log('Para leer enlaces abre la app con «py server.py».', true); return; }
  try {
    log('Leyendo el enlace…');
    const r = await fetch('/api/playlist?url=' + encodeURIComponent(url)), j = await r.json();
    if (!r.ok) throw new Error(j.error);
    if (!j.items.length) throw new Error('el enlace no tiene canciones');
    addYouTube(j.items, j.title, true);
    $('#yturl').value = '';
  } catch (e) { log('No pude leer el enlace: ' + e.message, true); }
}

export function initYouTube() {
  let saved = '';
  try { saved = localStorage.getItem('adj_cid') || ''; } catch {}
  $('#cid').value = saved || GOOGLE_CLIENT_ID;
  $('#ytc').onclick = connect;
  $('#ytload').onclick = loadMine;
  $('#ytadd').onclick = loadUrl;
  $('#yturl').onkeydown = e => { if (e.key === 'Enter') loadUrl(); };
}
