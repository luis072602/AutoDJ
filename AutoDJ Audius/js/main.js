// Arranque de la aplicación.
import { S } from './state.js';
import { tick } from './mixer.js';
import { initEq } from './eq.js';
import { initAudius } from './audius.js';
import { initUi, paint } from './ui.js';

window.autodj = S; // para inspeccionar el estado desde la consola del navegador
initEq();
initAudius();
initUi();
setInterval(tick, 200);
(function loop() { paint(); requestAnimationFrame(loop); })();
