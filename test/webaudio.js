// Imitación mínima de la Web Audio API para correr las pruebas en Node (sin navegador).

// Parámetro de audio que anota cada cambio programado para poder comprobarlo después.
export class Param {
  constructor(value) { this.value = value; this.events = []; }
  setValueAtTime(v, t) { this.events.push({ type: 'set', v, t }); }
  setValueCurveAtTime(curve, t, dur) { this.events.push({ type: 'curve', curve: [...curve], t, dur }); }
  exponentialRampToValueAtTime(v, t) { this.events.push({ type: 'exp', v, t }); }
  setTargetAtTime(v, t, k) { this.events.push({ type: 'target', v, t, k }); }
}

export class Buffer {
  constructor(data, sampleRate) { this.data = data; this.sampleRate = sampleRate; this.length = data.length; this.duration = data.length / sampleRate; this.numberOfChannels = 1; }
  getChannelData() { return this.data; }
}

const node = extra => ({ connect() {}, disconnect() {}, ...extra });

// Contexto en tiempo real: solo registra lo que el mezclador programa. El reloj se mueve a mano.
export class Context {
  constructor() { this.currentTime = 0; this.state = 'running'; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createGain() { return node({ gain: new Param(1) }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: new Param(350), Q: new Param(1) }); }
  createBufferSource() {
    return node({
      buffer: null, playbackRate: new Param(1), started: null, stopped: null,
      start(when = 0, offset = 0) { this.started = { when, offset }; },
      stop(when = 0) { this.stopped = when; }
    });
  }
}

// Paso bajo de 2 polos (fórmulas RBJ), como el BiquadFilterNode 'lowpass'. Q en dB, igual que Web Audio.
function lowpass(x, fs, f0, qdb = 1) {
  const w = 2 * Math.PI * f0 / fs, q = Math.pow(10, qdb / 20), a = Math.sin(w) / (2 * q), c = Math.cos(w);
  const a0 = 1 + a, b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - a) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

// Contexto sin conexión: reproduce el buffer (remuestreado si hace falta) y, si lo hay, aplica el paso bajo.
export function offlineContext({ minRate = 0 } = {}) {
  return class OfflineContext {
    constructor(ch, length, rate) {
      if (rate < minRate) throw new Error('NotSupportedError: sampleRate ' + rate);
      this.length = length; this.sampleRate = rate; this.destination = node();
    }
    createBufferSource() {
      const s = node({ buffer: null, start: (when, offset = 0, dur = Infinity) => { s.span = { offset, dur }; } });
      return this.src = s;
    }
    createBiquadFilter() {
      const f = node({ type: 'lowpass', frequency: { value: 350 }, Q: { value: 1 } });
      return this.filter = f;
    }
    async startRendering() {
      const b = this.src.buffer, d = b.getChannelData(0), k = b.sampleRate / this.sampleRate;
      const out = new Float32Array(this.length), n = Math.min(this.length, Math.floor(this.src.span.dur * this.sampleRate));
      for (let i = 0; i < n; i++) {
        const x = (this.src.span.offset * this.sampleRate + i) * k, j = Math.floor(x), r = x - j;
        out[i] = j + 1 < d.length ? d[j] * (1 - r) + d[j + 1] * r : (d[j] || 0);
      }
      const res = this.filter ? lowpass(out, this.sampleRate, this.filter.frequency.value, this.filter.Q.value) : out;
      return { getChannelData: () => res };
    }
  };
}
