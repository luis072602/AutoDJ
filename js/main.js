// Arranque de la aplicación.
import { S, $, emit } from './state.js';
import { tick } from './mixer.js';
import { initEq } from './eq.js';
import { initYouTube } from './youtube.js';
import { initUi, paint } from './ui.js';

// ¿Está server.py detrás? Sin él la app sigue funcionando con archivos, pero no puede traer audio de YouTube.
async function ping() {
  let ok = false;
  try { ok = !!(await (await fetch('/api/ping')).json()).ok; } catch {}
  const el = $('#srv'), changed = ok !== S.server || !el.classList.contains(ok ? 'on' : 'off');
  S.server = ok;
  if (!changed) return;
  el.className = 'pill ' + (ok ? 'on' : 'off');
  el.textContent = ok ? 'Servidor local activo' : 'Sin servidor: solo archivos';
  el.title = ok ? 'El audio de YouTube pasa por el mezclador y el ecualizador' : 'Abre la app con «py server.py» para poder mezclar canciones de YouTube';
  emit();
}

window.autodj = S; // para inspeccionar el estado desde la consola del navegador
initEq();
initYouTube();
initUi();
ping();
setInterval(ping, 5000);
setInterval(tick, 200);
(function loop() { paint(); requestAnimationFrame(loop); })();
