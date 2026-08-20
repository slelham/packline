export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.32;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.04);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.12, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain = 0.1, hp = 400) {
    if (!this.ctx || !this.master || this.muted) return;
    const n = this.ctx.sampleRate;
    const len = Math.floor(n * dur);
    const buf = this.ctx.createBuffer(1, len, n);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  jump() {
    this.tone(420, 0.09, "square", 0.07, 720);
    this.tone(840, 0.07, "triangle", 0.04, 1100);
  }

  land() {
    this.noise(0.08, 0.12, 180);
    this.tone(110, 0.1, "sine", 0.08, 60);
  }

  slide() {
    this.noise(0.16, 0.08, 900);
    this.tone(180, 0.12, "sawtooth", 0.03, 90);
  }

  coin() {
    this.tone(880, 0.08, "sine", 0.08, 1320);
    this.tone(1320, 0.1, "triangle", 0.05, 1760);
  }

  combo(n: number) {
    const base = 520 + Math.min(8, n) * 40;
    this.tone(base, 0.08, "square", 0.06, base * 1.4);
  }

  crash() {
    this.noise(0.28, 0.2, 120);
    this.tone(90, 0.32, "sawtooth", 0.12, 40);
    this.tone(180, 0.18, "square", 0.05, 70);
  }
}
