// Pruebas del motor de mezcla (js/mixer.js): cuándo empieza el cruce, cuánto dura y a qué velocidad entra la siguiente.
// El reloj del contexto de audio se avanza a mano y se revisa lo que el mezclador deja programado.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from './webaudio.js';

const el = { textContent: '', classList: { toggle() {} } };
globalThis.document = { querySelector: () => el, querySelectorAll: () => [] };
const { S } = await import('../js/state.js');
const { cue, tick, skip, pos } = await import('../js/mixer.js');

const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, `${what}: ${v} (esperado ${want} ± ${tol})`);

// Canción ya analizada: intro de `intro` compases desde b0, cuerpo de `body` y outro de `outro`
function song(name, { bpm = 128, b0 = .5, intro = 16, body = 64, outro = 16, weak = false } = {}) {
  const bar = 240 / bpm, drop = b0 + intro * bar, out = drop + body * bar, end = out + outro * bar;
  return { name, bpm, b0, drop, out, end, dur: end + 1, start: b0, weak, an: true, buffer: { duration: end + 1 }, bad: false };
}

const reset = (extra = {}) => Object.assign(S, { ctx: new Context(), master: new Context().createGain(), tracks: [], cur: null, mix: null, cue: null, last: null, scene: 'variado', mixT: 14, sync: true, loop: true }, extra);
beforeEach(() => reset());

// Avanza el reloj de a 0,2 s (como el temporizador real) hasta que empieza un cruce
function runUntilMix(limit = 1000) {
  for (let i = 0; i < limit * 5 && !S.mix; i++) { S.ctx.currentTime += .2; tick(); }
  assert.ok(S.mix, 'no empezó ningún cruce');
  return S.mix;
}
const curve = (p, type = 'curve') => p.events.find(e => e.type === type);

async function playing(...tracks) {
  S.tracks = tracks;
  await cue(tracks[0]);
  assert.equal(S.cur.t, tracks[0]);
  return S.cur;
}

test('la primera canción arranca desde su inicio', async () => {
  const a = song('A');
  const d = await playing(a, song('B'));
  assert.equal(d.src.started.offset, a.start);
  assert.equal(d.rate, 1);
});

test('piloto automático: cruce de potencia constante que empieza en un compás y termina justo en el golpe', async () => {
  const a = song('A', { bpm: 128 }), b = song('B', { bpm: 124, b0: .2 });
  const o = await playing(a, b);
  const m = runUntilMix(), A = 240 / a.bpm;

  // El cruce empieza en un compás de A, antes de su salida y con poca antelación
  const ms = pos(o) + (m.at - S.ctx.currentTime) * o.rate, bars = (ms - a.b0) / A;
  near(bars, Math.round(bars), 1e-6, 'inicio en compás');
  assert.ok(ms <= a.out + 1e-6, 'empieza después de la salida');
  assert.ok(m.at - S.ctx.currentTime <= 3.2 + 1e-9 && m.at > S.ctx.currentTime);

  // La siguiente sube de tempo para igualar a la actual
  const rate = m.nd.src.playbackRate.value;
  near(rate, 128 / 124, 1e-9, 'velocidad');

  // Tiempos del cruce: múltiplo de 4 y entre 6 y 24 s (el «auto» se adapta a intro y outro);
  const nb = Math.round(m.dur / (60 / a.bpm));
  near(m.dur, nb * 60 / a.bpm, 1e-9, 'duración en tiempos');
  assert.equal(nb % 4, 0);
  // (se redondea a grupos de 4 tiempos, así que puede pasarse hasta 2 tiempos)
  assert.ok(m.dur >= 6 - 2 * 60 / a.bpm && m.dur <= 24 + 2 * 60 / a.bpm, 'duración ' + m.dur);
  near(m.end, m.at + m.dur, 1e-9, 'fin');

  // Intro larga: B entra antes del golpe para que su golpe caiga exactamente al terminar el cruce
  const st = m.nd.src.started;
  near(st.when, m.at, 1e-9, 'B empieza con el cruce');
  near(st.offset + m.dur * rate, b.drop, 1e-6, 'golpe de B al final del cruce');

  // Curvas de volumen: A baja de 1 a 0 y B sube de 0 a 1, durante todo el cruce, con suma de potencias 1
  const out = curve(m.o.g.gain), inn = curve(m.nd.g.gain);
  for (const c of [out, inn]) { near(c.t, m.at, 1e-9, 'curva empieza'); near(c.dur, m.dur, 1e-9, 'curva dura'); }
  near(out.curve[0], 1, 1e-6, 'A al empezar'); near(out.curve.at(-1), 0, 1e-6, 'A al terminar');
  near(inn.curve[0], 0, 1e-6, 'B al empezar'); near(inn.curve.at(-1), 1, 1e-6, 'B al terminar');
  out.curve.forEach((v, i) => near(v * v + inn.curve[i] ** 2, 1, 1e-6, 'potencia'));

  // Filtros: A pierde graves en el primer 60 %; B se abre entre el 40 % y el 70 %
  near(curve(m.o.hp.frequency, 'exp').t, m.at + m.dur * .6, 1e-9, 'graves de A');
  near(curve(m.nd.hp.frequency, 'exp').t, m.at + m.dur * .65, 1e-9, 'graves de B');
  near(curve(m.nd.lp.frequency, 'exp').t, m.at + m.dur * .7, 1e-9, 'brillo de B');

  // A se detiene apenas termina el cruce, y entonces B pasa a ser la que suena
  near(m.o.src.stopped, m.end + .1, 1e-9, 'A se detiene');
  S.ctx.currentTime = m.end - .01; tick();
  assert.equal(S.mix, m);
  S.ctx.currentTime = m.end; tick();
  assert.equal(S.mix, null);
  assert.equal(S.cur, m.nd);
  assert.equal(S.last, b);
});

test('intro corta: la siguiente entra desde su primer compás', async () => {
  const a = song('A'), b = song('B', { intro: 1, b0: .3 });
  await playing(a, b);
  const m = runUntilMix();
  near(m.nd.src.started.offset, b.b0, 1e-9, 'entrada');
  assert.ok(m.dur >= 2 * 60 / a.bpm);
});

test('igualar tempo: doble o mitad si queda más cerca, y nunca más de ±8 %', async () => {
  const rateFor = async (bpm, opts = {}, state = {}) => {
    reset(state);
    const b = song('B', { bpm, ...opts });
    await playing(song('A', { bpm: 128 }), b);
    return runUntilMix().nd.src.playbackRate.value;
  };
  near(await rateFor(64), 1, 1e-9, 'mitad de tempo');
  near(await rateFor(250), 1.024, 1e-9, 'doble de tempo');
  near(await rateFor(100), 1.08, 1e-9, 'tope +8 %');
  near(await rateFor(150), .92, 1e-9, 'tope −8 %');
  near(await rateFor(124, { weak: true }), 1, 1e-9, 'BPM incierto');
  near(await rateFor(124, {}, { sync: false }), 1, 1e-9, 'sin sincronizar');
});

test('saltar: cruce rápido (máx. 8 s) en el próximo compás', async () => {
  const a = song('A', { bpm: 128 }), b = song('B', { bpm: 128 });
  const o = await playing(a, b);
  S.ctx.currentTime = 40.3;
  skip(); await new Promise(r => setImmediate(r));
  const m = S.mix;
  assert.ok(m, 'no empezó el cruce');
  const ms = pos(o) + (m.at - S.ctx.currentTime) * o.rate, bars = (ms - a.b0) / (240 / a.bpm);
  near(bars, Math.round(bars), 1e-6, 'inicio en compás');
  assert.ok(m.at - S.ctx.currentTime >= .4 - 1e-9 && m.at - S.ctx.currentTime <= .4 + 240 / a.bpm, 'espera ' + (m.at - S.ctx.currentTime));
  assert.ok(m.dur <= 8 + 1e-9, 'duración ' + m.dur);
  assert.equal(Math.round(m.dur / (60 / a.bpm)) % 4, 0);
});

test('ambiente con cruce fijo: usa la duración elegida', async () => {
  S.scene = 'fiesta'; S.mixT = 16;
  const a = song('A', { bpm: 120 }), b = song('B', { bpm: 120, intro: 32 });
  await playing(a, b);
  near(runUntilMix().dur, 16, 1e-9, 'duración');
});

test('mientras se mezcla no se pide otra canción', async () => {
  const a = song('A'), b = song('B'), c = song('C');
  await playing(a, b, c);
  const m = runUntilMix();
  await cue(c);
  assert.equal(S.mix, m);
  assert.equal(S.cue, null);
});
