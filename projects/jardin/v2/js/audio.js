// Ambiance sonore synthétisée (aucun fichier) : vent, oiseaux le jour, grillons la nuit, carillons
export class Ambience {
  constructor() { this.ctx = null; this.on = false; this.vol = 0.25; }

  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    const len = 2 * ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(lp.frequency);
    this.wind = ctx.createGain(); this.wind.gain.value = 0.12;
    noise.connect(lp); lp.connect(this.wind); this.wind.connect(this.master);
    noise.start(); lfo.start();
  }

  toggle() {
    this.init(); if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.on = !this.on;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.linearRampToValueAtTime(this.on ? this.vol : 0, t + 0.4);
    return this.on;
  }
  setVolume(v) { this.vol = v; if (this.ctx && this.on) this.master.gain.value = v; }

  tone(freq, dur = 0.5, type = 'sine', gain = 0.12, when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  chime(kind = 'flower') {
    const notes = { flower: [784, 988, 1175], tree: [523, 659, 784, 1047], spell: [1047, 1319, 1568, 2093], chat: [880] }[kind] || [880];
    notes.forEach((f, i) => this.tone(f, 0.9, 'triangle', 0.08, i * 0.09));
  }

  // appelé régulièrement : petits sons d'ambiance selon l'heure et le biome
  tick(dt, night, weights) {
    if (!this.ctx || !this.on) return;
    const lush = weights[0] + weights[1] + weights[2] * 0.6;
    if (!night && Math.random() < dt * 0.25 * lush) this.bird();
    if (night > 0.5 && Math.random() < dt * 1.5 * lush) this.cricket();
    if (this.wind) this.wind.gain.value = 0.08 + weights[3] * 0.12 + weights[4] * 0.14;
  }
  bird() {
    const base = 2200 + Math.random() * 1600, t0 = this.ctx.currentTime, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = t0 + i * 0.13;
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.3), t + 0.08);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.12);
    }
  }
  cricket() {
    for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, 0.04, 'square', 0.006, i * 0.06);
  }
}
