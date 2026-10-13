// Canciones sintéticas con estructura conocida: silencio, intro suave, parte fuerte (el «golpe»), outro suave.

// Generador pseudoaleatorio con semilla, para que las pruebas den siempre lo mismo
export function rng(seed = 1) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 * 2 - 1; };
}

// Bombo: seno que cae de 120 a 50 Hz y se apaga en ~150 ms
function kick(out, at, amp, fs) {
  const n = Math.floor(.25 * fs), i0 = Math.round(at * fs);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / fs, f = 50 + 70 * Math.exp(-t / .03);
    ph += 2 * Math.PI * f / fs;
    out[i0 + i] += amp * Math.sin(ph) * Math.exp(-t / .12);
  }
}

// Platillo: ruido corto que el paso bajo del análisis de ritmo deja fuera
function hat(out, at, amp, fs, rand) {
  const n = Math.floor(.05 * fs), i0 = Math.round(at * fs);
  let prev = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) { const w = rand(); out[i0 + i] += amp * (w - prev) * .5 * Math.exp(-i / fs / .015); prev = w; }
}

// Las secciones se dan en compases. El primer tiempo de cada compás suena algo más fuerte.
export function track({ bpm = 128, fs = 11025, lead = 2, intro = 16, body = 32, outro = 16, tail = 2, seed = 1 } = {}) {
  const beat = 60 / bpm, bar = 4 * beat, rand = rng(seed);
  const t0 = lead, drop = t0 + intro * bar, out = drop + body * bar, end = out + outro * bar;
  const data = new Float32Array(Math.ceil((end + tail) * fs));
  for (let k = 0; t0 + k * beat < end - 1e-9; k++) {
    const at = t0 + k * beat, loud = at >= drop - 1e-9 && at < out - 1e-9, down = k % 4 === 0;
    kick(data, at, (loud ? .9 : .25) * (down ? 1 : .7), fs);
    if (loud) { hat(data, at + beat / 2, .5, fs, rand); hat(data, at + beat / 4, .2, fs, rand); hat(data, at + 3 * beat / 4, .2, fs, rand); }
  }
  return { data, fs, bpm, beat, bar, start: t0, drop, out, end };
}

// Ruido sin pulso: el análisis debe marcar el BPM como poco fiable
export function noise({ seconds = 40, fs = 11025, seed = 7 } = {}) {
  const rand = rng(seed), data = new Float32Array(seconds * fs);
  for (let i = 0; i < data.length; i++) data[i] = .3 * rand();
  return { data, fs };
}
