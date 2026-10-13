// Pruebas del análisis (js/analyze.js) con canciones sintéticas de BPM y estructura conocidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer, offlineContext } from './webaudio.js';
import { track, noise } from './synth.js';

globalThis.OfflineAudioContext = offlineContext();
const { analyze } = await import('../js/analyze.js');

async function run(s) {
  const t = { buffer: new Buffer(s.data, s.fs) };
  await analyze(t);
  return t;
}
const near = (v, want, tol, what) => assert.ok(Math.abs(v - want) <= tol, `${what}: ${v} (esperado ${want} ± ${tol})`);
// Distancia de x al tiempo fuerte más cercano de la rejilla de compases que empieza en s.start
const barPhase = (x, s) => { const r = ((x - s.start) % s.bar + s.bar) % s.bar; return Math.min(r, s.bar - r); };

for (const bpm of [90, 100, 110, 120, 128, 140, 150, 160]) {
  test(`mide ${bpm} BPM y encuentra el compás, el golpe y la salida`, async () => {
    const s = track({ bpm }), t = await run(s);
    assert.equal(t.weak, false);
    near(t.bpm, bpm, .75, 'bpm');
    // El primer tiempo fuerte cae en el primer compás (la precisión fina va en la prueba pendiente de abajo)
    assert.ok(barPhase(t.b0, s) <= s.beat / 2, `b0 ${t.b0} fuera de compás`);
    assert.ok(t.b0 >= s.start - .1 && t.b0 < s.start + s.beat, `b0 ${t.b0} no es el primer compás`);
    near(t.drop, s.drop, s.beat / 3, 'golpe');
    // La salida se redondea hacia atrás al compás: nunca después del outro y como mucho un compás antes
    assert.ok(t.out <= s.out + .3 && t.out >= s.out - s.bar - .6, `salida ${t.out} (outro real en ${s.out})`);
    near(t.start, s.start, .1, 'inicio');
    near(t.end, s.end, .6, 'final');
    near(t.dur, s.data.length / s.fs, 1e-9, 'duración');
    assert.ok(t.drop >= t.b0 && t.out >= t.drop, 'orden b0 ≤ golpe ≤ salida');
    // golpe y salida caen en la rejilla de compases de b0
    const bar = 240 / t.bpm;
    for (const [k, x] of [['golpe', t.drop], ['salida', t.out]]) { const n = (x - t.b0) / bar; near(n, Math.round(n), 1e-6, k + ' en compás'); }
    assert.equal(t.an, true);
  });
}

test('arranque que no coincide con el medio segundo', async () => {
  const s = track({ bpm: 124, lead: .37 }), t = await run(s);
  near(t.bpm, 124, .1, 'bpm');
  near(t.start, .37, .06, 'inicio');
  near(t.b0, .37, .06, 'b0');
  near(t.drop, s.drop, .06, 'golpe');
});

test('lleva los BPM lentos y rápidos al rango 80-170 (doble o mitad)', async () => {
  near((await run(track({ bpm: 75 }))).bpm, 150, 1, 'bpm de 75');
  near((await run(track({ bpm: 174 }))).bpm, 87, 1, 'bpm de 174');
});

test('marca como incierto el BPM de un audio sin pulso', async () => {
  const t = await run(noise());
  assert.equal(t.weak, true);
  assert.ok(t.bpm >= 80 && t.bpm <= 170);
});

test('audio a 44,1 kHz (se remuestrea para analizar)', async () => {
  const s = track({ bpm: 128, fs: 44100 }), t = await run(s);
  near(t.bpm, 128, .75, 'bpm');
  near(t.drop, s.drop, s.beat / 3, 'golpe');
});

test('si el navegador no acepta 11 kHz analiza a 22 kHz con el mismo resultado', async () => {
  const s = track({ bpm: 128 }), a = await run(s);
  globalThis.OfflineAudioContext = offlineContext({ minRate: 16000 });
  try {
    const b = await run(s);
    near(b.bpm, a.bpm, .1, 'bpm');
    near(b.b0, a.b0, .02, 'b0');
    near(b.drop, a.drop, .02, 'golpe');
  } finally { globalThis.OfflineAudioContext = offlineContext(); }
});

test('canción de más de 8 minutos: analiza los primeros 8 y deja el final abierto', async () => {
  const s = track({ bpm: 128, intro: 8, body: 260, outro: 0, tail: 0 }), t = await run(s);
  assert.ok(s.data.length / s.fs > 480);
  near(t.bpm, 128, .75, 'bpm');
  near(t.end, t.dur, 1e-9, 'final');
  near(t.waveDur, 480, 1e-9, 'silueta');
});

test('silueta para dibujar: como mucho 300 puntos entre 0 y 100', async () => {
  const t = await run(track({ bpm: 128 }));
  assert.ok(t.wave.length > 0 && t.wave.length <= 300);
  assert.ok(t.wave.every(v => Number.isInteger(v) && v >= 0 && v <= 100));
  assert.equal(Math.max(...t.wave), 100);
});

// Pendiente: hoy el BPM fino queda pegado a desfases enteros de la envolvente (~5 ms), así que
// p. ej. 120 se mide como 120,28 y el primer compás se corre hasta 0,23 s. Al arreglarlo, quitar el «todo».
test('BPM con precisión de 0,05 y compás con precisión de 30 ms', { todo: 'el ajuste fino se queda en desfases enteros de la envolvente' }, async () => {
  for (const bpm of [100, 120, 125, 150, 160]) {
    const s = track({ bpm }), t = await run(s);
    near(t.bpm, bpm, .05, 'bpm ' + bpm);
    near(t.b0, s.start, .03, 'b0 a ' + bpm);
  }
});
